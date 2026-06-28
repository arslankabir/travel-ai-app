from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    database_url: str = "postgresql://postgres:postgrespassword@localhost:5432/travel_db"
    cors_origins: str = "http://localhost:3000"
    redis_url: str = ""
    api_prefix: str = "/api"
    vector_dimension: int = 512

    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"

    llm_provider: str = "ollama"
    llm_api_key: str = ""
    llm_base_url: str = "http://localhost:11434/v1"
    llm_model_intent: str = "qwen2.5:3b"
    llm_model_review: str = "qwen2.5:3b"
    llm_model_itinerary: str = "llama3.1:8b"

    model_config = SettingsConfigDict(
        env_file=ROOT / ".env" if (ROOT / ".env").is_file() else None,
        extra="ignore",
    )

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def chat_api_key(self) -> str:
        """Chat agents: LLM_API_KEY first, else OPENAI_API_KEY for backward compatibility."""
        return self.llm_api_key or self.openai_api_key

    def llm_model_for(self, role: str) -> str:
        return {
            "intent": self.llm_model_intent,
            "review": self.llm_model_review,
            "itinerary": self.llm_model_itinerary,
        }.get(role, self.llm_model_intent)


settings = Settings()
