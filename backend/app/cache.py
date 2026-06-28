import hashlib
import json
import time
from typing import Any

from app.config import settings


class CacheStore:
    """Redis when available, otherwise in-memory TTL dict."""

    def __init__(self) -> None:
        self._memory: dict[str, tuple[float, str]] = {}
        self._redis = None
        if settings.redis_url:
            try:
                import redis

                self._redis = redis.from_url(
                    settings.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=1,
                )
                self._redis.ping()
            except Exception:
                self._redis = None

    def get(self, key: str) -> Any | None:
        if self._redis:
            try:
                raw = self._redis.get(key)
                return json.loads(raw) if raw else None
            except Exception:
                pass
        entry = self._memory.get(key)
        if not entry:
            return None
        expires, raw = entry
        if time.time() > expires:
            del self._memory[key]
            return None
        return json.loads(raw)

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        raw = json.dumps(value)
        if self._redis:
            try:
                self._redis.setex(key, ttl_seconds, raw)
                return
            except Exception:
                pass
        self._memory[key] = (time.time() + ttl_seconds, raw)


cache = CacheStore()


def hash_payload(payload: dict | list | str) -> str:
    if isinstance(payload, str):
        data = payload
    else:
        data = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(data.encode()).hexdigest()[:32]
