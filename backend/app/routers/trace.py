from fastapi import APIRouter, HTTPException

from app.agents.telemetry import trace_store

router = APIRouter(prefix="/trace", tags=["trace"])


@router.get("/{request_id}")
def get_trace(request_id: str) -> dict:
    record = trace_store.get(request_id)
    if record is None:
        raise HTTPException(404, "Trace not found or expired")
    return record
