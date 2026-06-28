from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.connection import check_db
from app.config import settings
from app.routers import batch, chat, listings, trace

app = FastAPI(title="Travel AI API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(listings.router, prefix=settings.api_prefix)
app.include_router(batch.router, prefix=settings.api_prefix)
app.include_router(chat.router, prefix=settings.api_prefix)
app.include_router(trace.router, prefix=settings.api_prefix)


@app.get("/health")
def health() -> dict[str, str | bool]:
    db_ok, db_error = check_db()
    payload: dict[str, str | bool] = {"status": "ok", "db": db_ok}
    if not db_ok and db_error:
        payload["db_error"] = db_error
    return payload
