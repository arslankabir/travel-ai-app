from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings


def _connect_args(database_url: str) -> dict:
    """Supabase and other remote Postgres require SSL from Railway."""
    url = database_url.lower()
    if "localhost" in url or "127.0.0.1" in url:
        return {}
    if "sslmode=" in url:
        return {}
    return {"sslmode": "require"}


engine = create_engine(
    settings.sqlalchemy_url,
    pool_pre_ping=True,
    connect_args=_connect_args(settings.database_url),
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def check_db() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
