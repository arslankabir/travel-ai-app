from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from app.config import settings

DEFAULT_CHAT_BASE_URL = "https://api.openai.com/v1"


class ModelFactory:
    """Chat LLMs are pluggable (Ollama or any OpenAI-compatible API). Embeddings are OpenAI-only."""

    @staticmethod
    def get_llm(role: str = "intent", temperature: float = 0.0) -> ChatOpenAI:
        provider = settings.llm_provider.lower()
        model_name = settings.llm_model_for(role)

        if provider == "ollama":
            return ChatOpenAI(
                base_url=settings.llm_base_url,
                api_key="ollama-local",
                model=model_name,
                temperature=temperature,
            )

        if provider in ("openai", "openai_compatible"):
            api_key = settings.chat_api_key
            if not api_key:
                raise ValueError(
                    "LLM_API_KEY (or OPENAI_API_KEY fallback) is required for chat agents. "
                    "Embeddings use OPENAI_API_KEY separately via get_embeddings()."
                )
            base_url = settings.llm_base_url.strip() or DEFAULT_CHAT_BASE_URL
            return ChatOpenAI(
                base_url=base_url,
                api_key=api_key,
                model=model_name,
                temperature=temperature,
            )

        raise ValueError(
            f"Unsupported LLM provider: {provider!r}. Use ollama or openai (OpenAI-compatible APIs)."
        )

    @staticmethod
    def get_embeddings() -> OpenAIEmbeddings:
        if not settings.openai_api_key:
            raise ValueError(
                "OPENAI_API_KEY is required for embeddings (ingest + live query vectors). "
                "Chat LLMs use LLM_API_KEY / LLM_BASE_URL separately."
            )
        return OpenAIEmbeddings(
            model=settings.embedding_model,
            dimensions=settings.vector_dimension,
            api_key=settings.openai_api_key,
        )
