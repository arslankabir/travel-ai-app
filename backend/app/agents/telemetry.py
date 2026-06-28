import json
import re
import time
from typing import Any


class TraceStore:
    TTL_SECONDS = 3600

    def __init__(self) -> None:
        self._store: dict[str, tuple[float, dict[str, Any]]] = {}

    def _purge(self) -> None:
        now = time.time()
        expired = [k for k, (ts, _) in self._store.items() if now - ts > self.TTL_SECONDS]
        for key in expired:
            del self._store[key]

    def create(self, request_id: str) -> "TraceRecord":
        self._purge()
        record = TraceRecord(request_id)
        self._store[request_id] = (time.time(), record.to_dict())
        return record

    def save(self, request_id: str, record: "TraceRecord") -> None:
        self._purge()
        self._store[request_id] = (time.time(), record.to_dict())

    def get(self, request_id: str) -> dict[str, Any] | None:
        self._purge()
        entry = self._store.get(request_id)
        return entry[1] if entry else None


class TraceRecord:
    def __init__(self, request_id: str) -> None:
        self.request_id = request_id
        self.agent_steps: list[dict[str, Any]] = []
        self.token_usage: dict[str, int] = {"total": 0}
        self.total_latency_ms: int | None = None
        self._open_steps: dict[str, float] = {}

    def start_step(self, node: str) -> None:
        self._open_steps[node] = time.time()
        self.agent_steps.append({"node": node, "status": "running", "latency_ms": None})

    def finish_step(self, node: str, *, status: str = "ok", results_count: int | None = None) -> None:
        started = self._open_steps.pop(node, None)
        latency_ms = int((time.time() - started) * 1000) if started else None
        for step in reversed(self.agent_steps):
            if step["node"] == node and step["status"] == "running":
                step["status"] = status
                step["latency_ms"] = latency_ms
                if results_count is not None:
                    step["results_count"] = results_count
                break

    def fail_step(self, node: str) -> None:
        self.finish_step(node, status="error")

    def record_tokens(self, node: str, usage: Any) -> None:
        total = getattr(usage, "total_tokens", None)
        if total is None and isinstance(usage, dict):
            total = usage.get("total_tokens")
        if total:
            self.token_usage[node] = int(total)
            self.token_usage["total"] = sum(
                v for k, v in self.token_usage.items() if k != "total"
            )

    def finalize(self, latency_ms: int) -> None:
        self.total_latency_ms = latency_ms

    def to_dict(self) -> dict[str, Any]:
        return {
            "request_id": self.request_id,
            "total_latency_ms": self.total_latency_ms,
            "token_usage": self.token_usage,
            "agent_steps": self.agent_steps,
        }


trace_store = TraceStore()
