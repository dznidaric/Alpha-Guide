"""
index.py — FastAPI application for the Alpha-Guide RAG chatbot.

Endpoints
---------
GET  /               → health-check
POST /api/chat       → RAG-powered chat (choose a retriever strategy)
"""

import json
import uuid
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from helpers.agent import get_agent



load_dotenv()

# ---------------------------------------------------------------------------
# App & middleware
# ---------------------------------------------------------------------------
app = FastAPI(title="Alpha-Guide API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    context: dict[str, Any] | None = None
    config: dict[str, Any] | None = None
    thread_id: str | None = None  # conversation thread for memory; auto-generated if omitted


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
def root():
    """Health-check / ping endpoint."""
    return {"status": "ok"}


@app.post("/api/chat")
async def chat(request: ChatRequest):
    agent = await get_agent()

    agent_input = {
        "messages": [{"role": "user", "content": request.message}]
    }

    # The checkpointer needs a thread_id to track conversation state
    thread_id = request.thread_id or str(uuid.uuid4())
    agent_config = {"configurable": {"thread_id": thread_id}}

    print(f"context: {request.context}")
    print(f"agent_config: {agent_config}")
    print(f"agent_input: {agent_input}")
    

    async def stream_response():
        async for message, metadata in agent.astream(
            agent_input,
            config=agent_config,
            context=request.context,
            stream_mode="messages"
        ):
            yield f"event: message\ndata: {json.dumps([message.model_dump(mode='json'), metadata], default=str)}\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")