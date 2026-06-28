from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from app.config import settings


class ModelFactory:
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
        if provider == "openai":
            return ChatOpenAI(
                model=model_name,
                temperature=temperature,
                api_key=settings.openai_api_key or None,
            )
        raise ValueError(f"Unsupported LLM provider: {provider}")

    @staticmethod
    def get_embeddings() -> OpenAIEmbeddings:
        if not settings.openai_api_key:
            raise ValueError(
                "OPENAI_API_KEY is required for embeddings (retrieval semantic search). "
                "Set it in the project root .env file."
            )
        return OpenAIEmbeddings(
            model=settings.embedding_model,
            dimensions=settings.vector_dimension,
            api_key=settings.openai_api_key,
        )
