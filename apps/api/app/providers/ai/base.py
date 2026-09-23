from typing import Any, NoReturn

from app.core.errors import AppError
from app.providers.ai.types import AIGenerationResult, AIModel, ProviderCapabilities, ProviderHealth


class ProviderMixin:
    provider_id: str

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities()

    def _not_implemented(self, operation: str) -> NoReturn:
        raise AppError(
            "AI_PROVIDER_ERROR",
            f"{self.provider_id} {operation} is not enabled yet",
            status_code=501,
        )

    async def generate(
        self,
        *,
        model: str | None = None,
        messages: list[dict[str, str]] | None = None,
        prompt: str | None = None,
        temperature: float | None = None,
        system: str | None = None,
    ) -> AIGenerationResult:
        self._not_implemented("generate")

    async def generate_structured(
        self,
        *,
        json_schema: dict[str, Any],
        model: str | None = None,
        messages: list[dict[str, str]] | None = None,
        prompt: str | None = None,
        temperature: float | None = None,
        system: str | None = None,
    ) -> AIGenerationResult:
        self._not_implemented("generate_structured")

    async def list_models(self) -> list[AIModel]:
        self._not_implemented("list_models")


def map_http_error(status_code: int, *, timeout: bool = False) -> ProviderHealth:
    if timeout:
        return ProviderHealth(False, "AI_PROVIDER_TIMEOUT", "Provider request timed out")
    if status_code in {401, 403}:
        return ProviderHealth(False, "AI_PROVIDER_AUTH_FAILED", "Provider authentication failed")
    return ProviderHealth(False, "AI_PROVIDER_UNAVAILABLE", "Provider is unavailable")
