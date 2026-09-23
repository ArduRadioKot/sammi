import asyncio

from app.core.config import get_settings
from app.core.errors import AppError
from app.providers.ai.ollama import TEST_PROMPT, OllamaProvider
from app.providers.ai.registry import AIProviderRegistry
from app.providers.ai.types import AIGenerationResult, AIModel, AIProvider, ProviderCapabilities, ProviderHealth

_registry: AIProviderRegistry | None = None


def get_ai_registry() -> AIProviderRegistry:
    global _registry
    if _registry is None:
        _registry = AIProviderRegistry(get_settings())
    return _registry


def _capabilities(provider: AIProvider) -> dict[str, bool]:
    caps = provider.capabilities() if hasattr(provider, "capabilities") else ProviderCapabilities()
    return {
        "generation": caps.generation,
        "structured_output": caps.structured_output,
        "tools": caps.tools,
        "streaming": caps.streaming,
    }


def _default_model(provider: AIProvider) -> str | None:
    model = getattr(provider, "model", None)
    return str(model) if model else None


def _safe_endpoint(provider: AIProvider) -> str | None:
    if provider.provider_id != "ollama":
        return None
    endpoint = getattr(provider, "base_url", None)
    return str(endpoint) if endpoint else None


class AIProviderStatusService:
    def __init__(self, registry: AIProviderRegistry | None = None) -> None:
        self.registry = registry or get_ai_registry()

    async def list_status(self) -> list[dict[str, object]]:
        providers = self.registry.list()
        checks = await asyncio.gather(*(self._status_for(provider) for provider in providers))
        return list(checks)

    async def _status_for(self, provider: AIProvider) -> dict[str, object]:
        configured = provider.is_configured()
        available = False
        if configured:
            health = await provider.health_check()
            available = health.available
        return {
            "id": provider.provider_id,
            "configured": configured,
            "available": available,
            "capabilities": _capabilities(provider),
            "default_model": _default_model(provider),
            "endpoint": _safe_endpoint(provider),
        }

    async def check(self, provider_id: str) -> tuple[AIProvider, ProviderHealth]:
        provider = self._require(provider_id)
        if not provider.is_configured():
            raise AppError("AI_PROVIDER_NOT_CONFIGURED", f"{provider_id} is not configured", status_code=400)
        return provider, await provider.health_check()

    async def list_models(self, provider_id: str) -> list[AIModel]:
        provider = self._require(provider_id)
        if not provider.is_configured():
            raise AppError("AI_PROVIDER_NOT_CONFIGURED", f"{provider_id} is not configured", status_code=400)
        return await provider.list_models()

    async def test_generation(self, provider_id: str, model: str | None) -> dict[str, object]:
        provider = self._require(provider_id)
        if not provider.capabilities().generation:
            raise AppError("AI_PROVIDER_ERROR", f"{provider_id} generation is not enabled yet", status_code=501)
        chosen = (model or "").strip() or _default_model(provider)
        if not chosen and isinstance(provider, OllamaProvider):
            installed = await provider.list_models()
            chosen = installed[0].id if installed else None
        if not chosen:
            raise AppError("AI_MODEL_NOT_FOUND", "No Ollama model selected", status_code=400)
        result: AIGenerationResult = await provider.generate(model=chosen, prompt=TEST_PROMPT)
        return {
            "provider": result.provider,
            "model": result.model,
            "status": "ok",
            "duration_ms": result.duration_ms,
        }

    def _require(self, provider_id: str) -> AIProvider:
        provider = self.registry.get(provider_id)
        if provider is None:
            raise AppError("AI_PROVIDER_NOT_CONFIGURED", "Unknown AI provider", status_code=404)
        return provider
