"""
model.py — LLM and prompt factory for the Alpha-Guide RAG pipeline.

Keeps all LangChain model/prompt construction in one place so the API
layer stays thin.
"""

import os
from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from langgraph.checkpoint.memory import MemorySaver
from tavily import AsyncTavilyClient

load_dotenv()

if not os.getenv("OPENAI_API_KEY"):
    raise RuntimeError("OPENAI_API_KEY is not set in the environment.")

checkpointer = None
agent = None
retriever = None

# Tavily client for web search (initialised lazily if TAVILY_API_KEY is set)
_tavily_client: AsyncTavilyClient | None = None

def get_tavily_client() -> AsyncTavilyClient:
    """Return a singleton Tavily client, raising if the API key is missing."""
    global _tavily_client
    if _tavily_client is None:
        api_key = os.getenv("TAVILY_API_KEY")
        if not api_key:
            raise RuntimeError("TAVILY_API_KEY is not set — web search unavailable.")
        _tavily_client = AsyncTavilyClient(api_key=api_key)
    return _tavily_client


RAG_TEMPLATE = """\
You are a helpful and kind assistant for questions about faith, life, prayer, and purpose.

You have access to two tools:
1. **retrieve** — search the internal "Questions of Life" knowledge base. Use this first for faith/life topics.
2. **web_search** — search the web for current events, factual lookups, or anything not covered by the knowledge base.

Guidelines:
- Always try the knowledge base first for faith-related questions.
- Use web search when the question is about current events, general knowledge, or when the knowledge base has no relevant results.
- Cite your sources when possible.
- If you still do not know the answer, say so honestly.
"""


def create_qdrant_retriever():
    url = os.getenv("QDRANT_URL")
    api_key = os.getenv("QDRANT_API_KEY")

    qdrant_client = QdrantClient(
        url=url,
        api_key=api_key,
        port=443,
        http2=False,  # Proxies often struggle with HTTP/2; keeping it False is safer
    )

    vector_store = QdrantVectorStore(
        collection_name="alpha-guide-rag",
        embedding=OpenAIEmbeddings(model="text-embedding-3-small"),
        client=qdrant_client
    )

    return vector_store.as_retriever(search_kwargs={"k": 4})

retriever = create_qdrant_retriever()

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


tools = [retrieve, web_search]


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
            except Exception as e:
                print(f"Error setting up Redis: {e}")
            
        else:
            checkpointer = MemorySaver()

        agent = create_agent(
            model="openai:gpt-5-mini",
            tools=tools,
            system_prompt=RAG_TEMPLATE,
            checkpointer=checkpointer,
        )
    return agent

