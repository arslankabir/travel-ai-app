import json
import time
import uuid

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agents.graph import app_graph
from app.agents.telemetry import trace_store

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    user_input: str = Field(..., min_length=1)
    mode: str = "concierge"  # search | concierge


@router.post("/stream")
async def stream_chat(req: ChatRequest) -> StreamingResponse:
    async def event_generator():
        request_id = str(uuid.uuid4())
        start_time = time.time()
        trace = trace_store.create(request_id)

        yield _sse({"event": "trace_init", "request_id": request_id})

        initial_state = {
            "messages": [],
            "mode": req.mode if req.mode in ("search", "concierge") else "concierge",
            "request_id": request_id,
            "user_input": req.user_input,
            "intent_type": None,
            "parsed_filters": None,
            "listings": [],
            "citations": [],
            "response_text": "",
            "itinerary": None,
            "error": None,
        }

        final_output: dict = {}
        nodes_started: set[str] = set()
        itinerary_tokens_sent = False

        try:
            async for event in app_graph.astream_events(initial_state, version="v2"):
                kind = event.get("event")

                if kind == "on_chain_start":
                    node = event.get("metadata", {}).get("langgraph_node")
                    if node and node not in nodes_started:
                        nodes_started.add(node)
                        trace.start_step(node)
                        yield _sse({"event": "node_start", "node": node})

                elif kind == "on_chat_model_stream":
                    node = event.get("metadata", {}).get("langgraph_node")
                    # Intent/review use structured JSON — don't leak raw tokens to UI
                    if node not in ("itinerary_agent",):
                        continue
                    chunk = event.get("data", {}).get("chunk")
                    content = getattr(chunk, "content", None) if chunk else None
                    if content:
                        itinerary_tokens_sent = True
                        yield _sse({"event": "token", "token": content})

                elif kind == "on_chat_model_end":
                    node = event.get("metadata", {}).get("langgraph_node")
                    output = event.get("data", {}).get("output")
                    usage = getattr(output, "usage_metadata", None)
                    if node and usage:
                        trace.record_tokens(node, usage)

                elif kind == "on_chain_end":
                    node = event.get("metadata", {}).get("langgraph_node")
                    output_data = event.get("data", {}).get("output") or {}

                    if isinstance(output_data, dict):
                        final_output.update(output_data)

                    if node:
                        results_count = len(output_data.get("listings", [])) if isinstance(output_data, dict) else None
                        trace.finish_step(node, results_count=results_count)

                    if node == "intent_agent" and isinstance(output_data, dict):
                        mode = initial_state.get("mode")
                        if mode == "search" and output_data.get("parsed_filters"):
                            yield _sse({
                                "event": "filters_parsed",
                                "filters": output_data["parsed_filters"],
                            })
                        elif output_data.get("intent_type") == "chitchat" and output_data.get("response_text"):
                            yield _sse({"event": "message", "text": output_data["response_text"]})

                    if node == "retrieval_agent" and isinstance(output_data, dict):
                        if output_data.get("listings"):
                            yield _sse({
                                "event": "listings_loaded",
                                "listings": _public_listings(output_data["listings"]),
                            })
                        if output_data.get("response_text"):
                            yield _sse({"event": "message", "text": output_data["response_text"]})

                    if node == "review_agent" and isinstance(output_data, dict):
                        if output_data.get("citations"):
                            yield _sse({
                                "event": "citations_loaded",
                                "citations": _public_citations(output_data["citations"]),
                            })
                        summary = output_data.get("review_summary")
                        if summary:
                            yield _sse({"event": "message", "text": f"**Review insights:** {summary}"})

                    if node == "itinerary_agent" and isinstance(output_data, dict):
                        itinerary = output_data.get("itinerary")
                        # Avoid duplicate full-text flash when tokens were already streamed
                        if itinerary and not itinerary_tokens_sent:
                            yield _sse({"event": "itinerary", "text": itinerary})

                    if event.get("name") == "LangGraph":
                        latency_ms = int((time.time() - start_time) * 1000)
                        trace.finalize(latency_ms)
                        trace_store.save(request_id, trace)
                        yield _sse({
                            "event": "complete",
                            "request_id": request_id,
                            "latency_ms": latency_ms,
                        })

                elif kind == "on_chain_error":
                    node = event.get("metadata", {}).get("langgraph_node", "unknown")
                    trace.fail_step(node)
                    trace_store.save(request_id, trace)
                    yield _sse({
                        "event": "error",
                        "node": node,
                        "message": str(event.get("data", {}).get("error", "Agent failed")),
                        "recoverable": True,
                        "partial": final_output,
                    })

        except Exception as exc:
            trace.fail_step("graph")
            trace_store.save(request_id, trace)
            yield _sse({
                "event": "error",
                "node": "graph",
                "message": str(exc),
                "recoverable": False,
            })

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _public_listings(listings: list) -> list:
    out = []
    for item in listings:
        if isinstance(item, dict):
            out.append({**item, "id": str(item["id"])})
    return out


def _public_citations(citations: list) -> list:
    out = []
    for c in citations:
        if not isinstance(c, dict):
            continue
        out.append(
            {
                "review_id": str(c["review_id"]),
                "listing_id": str(c["listing_id"]),
                "quote": c.get("quote", ""),
                **({"listing_name": c["listing_name"]} if c.get("listing_name") else {}),
            }
        )
    return out
