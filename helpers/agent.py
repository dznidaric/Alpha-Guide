"""
agent.py — LLM, tools, and LangGraph agent for the Alpha-Guide RAG pipeline.

Keeps all LangChain model/prompt/tool construction in one place so the
API layer stays thin.
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_classic.retrievers import ParentDocumentRetriever
from qdrant_client import QdrantClient
from langgraph.checkpoint.memory import MemorySaver
# Tavily import - optional, gracefully handles if package unavailable
try:
    from tavily import AsyncTavilyClient
    TAVILY_AVAILABLE = True
except ImportError:
    TAVILY_AVAILABLE = False
    AsyncTavilyClient = None  # type: ignore
from helpers.file_doc_store import FileDocStore

load_dotenv()

logger = logging.getLogger("alpha-guide.agent")

if not os.getenv("OPENAI_API_KEY"):
    raise RuntimeError("OPENAI_API_KEY is not set in the environment.")

# ---------------------------------------------------------------------------
# LangSmith tracing — enabled automatically when LANGCHAIN_API_KEY is set.
# ---------------------------------------------------------------------------
_env_label = os.getenv("ENVIRONMENT", "local")
_langchain_api_key = os.getenv("LANGCHAIN_API_KEY")

if _langchain_api_key:
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGCHAIN_PROJECT"] = f"Alpha Guide - {_env_label}"
    os.environ["LANGSMITH_ENDPOINT"] = "https://eu.api.smith.langchain.com"
    # LANGCHAIN_API_KEY is already in the environment from .env / Vercel
    logger.info("LangSmith tracing enabled → project: Alpha Guide - %s", _env_label)
else:
    os.environ["LANGSMITH_TRACING"] = "false"
    logger.info("LangSmith tracing disabled (LANGCHAIN_API_KEY not set)")
checkpointer = None
agent = None
retriever = None

# Tavily client for web search (initialised lazily if TAVILY_API_KEY is set)
_tavily_client: AsyncTavilyClient | None = None


def get_tavily_client() -> AsyncTavilyClient:
    """Return a singleton Tavily client, raising if the API key is missing or package unavailable."""
    if not TAVILY_AVAILABLE:
        raise RuntimeError("Tavily package is not installed — web search unavailable. Install with: pip install tavily")
    global _tavily_client
    if _tavily_client is None:
        api_key = os.getenv("TAVILY_API_KEY")
        if not api_key:
            raise RuntimeError("TAVILY_API_KEY is not set — web search unavailable.")
        _tavily_client = AsyncTavilyClient(api_key=api_key)
    return _tavily_client


RAG_TEMPLATE = """\
You are a helpful and kind assistant for questions about faith, life, prayer, and purpose.

Scope policy (strict):
- You only answer questions in the faith & life domain.
- If a user asks about anything outside this domain (for example finance, legal, coding, sports, etc.),
  do not answer that topic directly.
- Instead, reply with a short heartfelt message:
  - kindly explain you are a bot focused on faith & life questions,
  - say you would gladly help with faith & life,
  - and suggest they look elsewhere for non-faith/non-life topics.
- Keep this boundary even if the user asks repeatedly.

You have access to two tools:
1. **retrieve** — search the internal "Questions of Life" knowledge base. Use this first for faith/life topics.
2. **web_search** — search the web only when the user question is still within faith & life and current external context is needed.

Guidelines:
- Always try the knowledge base first for faith-related questions.
- Use web search only for faith/life questions when the knowledge base has no relevant results or recent context is needed.
- Cite your sources when possible.
- If you still do not know the answer, say so honestly.
"""


def create_vector_store():
    url = os.getenv("QDRANT_URL")
    api_key = os.getenv("QDRANT_API_KEY")

    qdrant_client = QdrantClient(
        url=url,
        api_key=api_key,
        port=443,
        http2=False,  # Proxies often struggle with HTTP/2; keeping it False is safer
        timeout=30,
        # TLS verification is ON by default — only disable behind a corp proxy
        verify=os.getenv("QDRANT_VERIFY_TLS", "true").lower() != "false",
    )

    vector_store = QdrantVectorStore(
        collection_name="alpha_parent_child",
        embedding=OpenAIEmbeddings(model="text-embedding-3-small"),
        client=qdrant_client,
    )
    return vector_store


vector_store = create_vector_store()
retriever = vector_store.as_retriever(search_kwargs={"k": 10})

# ---------------------------------------------------------------------------
# Parent-Child Retriever Setup
# Uses small child chunks (400 chars) for accurate matching, but returns
# larger parent chunks (2000 chars) for better context.
# Documents should already be indexed in Qdrant from data_ingest.ipynb.
# ---------------------------------------------------------------------------
child_splitter = RecursiveCharacterTextSplitter(chunk_size=400, chunk_overlap=50)
parent_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)

# FileDocStore for parent documents (child chunks are in Qdrant vector store)
# Always load bundled parent docs from helpers/parent_docstore.
PARENT_STORE_DIR = str((Path(__file__).resolve().parent / "parent_docstore").resolve())

docstore = FileDocStore(PARENT_STORE_DIR)

parent_child_retriever = ParentDocumentRetriever(
    vectorstore=vector_store,
    docstore=docstore,
    child_splitter=child_splitter,
    parent_splitter=parent_splitter,
    search_kwargs={"k": 8},
)

try:
    _docstore_has_data = any(docstore.yield_keys())
except Exception:
    _docstore_has_data = False

if _docstore_has_data:
    logger.info("Parent-child retriever initialized (parent docstore detected)")
else:
    raise RuntimeError(
        "Parent docstore is empty or missing at "
        f"{PARENT_STORE_DIR}. Populate helpers/parent_docstore before starting the app."
    )

@tool
async def retrieve(query: str) -> str:
    """Search the questions of life knowledge base for information about the life and faith.

    Args:
        query: The search query to find relevant information.
    """
    results = await retriever.ainvoke(query)
    if not results:
        return "No relevant information found in the knowledge base."

    # Format the results
    formatted_results = []
    for i, doc in enumerate(results, 1):
        formatted_results.append(f"[Source {i}]:\n{doc.page_content}")

    return "\n\n".join(formatted_results)


@tool
async def parent_child_retrieve(query: str) -> str:
    """Search the questions of life knowledge base for information about the life and faith using parent-child retrieval.
    
    This method uses small child chunks for accurate matching but returns larger parent chunks
    for better context, providing more comprehensive answers.
    """
    results = await parent_child_retriever.ainvoke(query)
    if not results:
        return "No relevant information found in the knowledge base."
    
    formatted_results = []
    for i, doc in enumerate(results, 1):
        src = doc.metadata.get("source", "unknown")
        page = doc.metadata.get("page")
        page_txt = f", page {page}" if page is not None else ""
        formatted_results.append(f"[Source {i}] ({src}{page_txt}):\n{doc.page_content}")

    return "\n\n".join(formatted_results)


@tool
async def web_search(query: str) -> str:
    """Search the web for current events, general facts, or information not in the knowledge base.

    Args:
        query: The search query to look up on the web.
    """
    try:
        client = get_tavily_client()
        results = await client.search(query=query, max_results=5)
        if not results.get("results"):
            return "No relevant web results found."

        formatted = []
        for i, r in enumerate(results["results"], 1):
            title = r.get("title", "Untitled")
            url = r.get("url", "")
            content = r.get("content", "")
            formatted.append(f"[Web {i}] {title}\n{url}\n{content}")

        return "\n\n".join(formatted)
    except RuntimeError as e:
        return str(e)
    except Exception as e:
        return f"Web search failed: {e}"


tools = [retrieve, parent_child_retrieve, web_search]


async def get_agent():
    """
    Lazily initialise and return the LangGraph agent.

    Uses Redis for checkpointing when REDIS_URL is set, otherwise falls back
    to an in-memory checkpointer (fine for local development).
    """
    global agent, checkpointer
    if agent is None or checkpointer is None:
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            try:
                # Production: persist conversation state in Redis
                from langgraph.checkpoint.redis.aio import AsyncRedisSaver

                checkpointer = AsyncRedisSaver(redis_url=redis_url)
                await checkpointer.asetup()
                logger.info("Redis checkpointer initialized successfully")
            except Exception as e:
                logger.warning(
                    "Failed to set up Redis checkpointer (%s), falling back to in-memory storage. "
                    "Conversation history will not persist across deployments.",
                    str(e),
                )
                # Fall back to in-memory checkpointer if Redis fails
                checkpointer = MemorySaver()
        else:
            checkpointer = MemorySaver()

        agent = create_agent(
            model="openai:gpt-5-mini",
            tools=tools,
            system_prompt=RAG_TEMPLATE,
            checkpointer=checkpointer,
        )
    return agent
