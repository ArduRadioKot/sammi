from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass(frozen=True)
class AIModel:
    id: str
    name: str
    provider: str | None = None
    parameter_size: str | None = None
    quantization: str | None = None


@dataclass(frozen=True)
class ProviderHealth:
    available: bool
    error_code: str | None = None
    message: str | None = None


@dataclass(frozen=True)
class ProviderCapabilities:
    generation: bool = False
    structured_output: bool = False
    tools: bool = False
    streaming: bool = False


@dataclass(frozen=True)
class AIGenerationResult:
    provider: str
    model: str
    content: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    duration_ms: int | None = None
    raw_usage: dict[str, Any] | None = None
    structured: dict[str, Any] | None = field(default=None)


@runtime_checkable
class AIProvider(Protocol):
    provider_id: str

    def is_configured(self) -> bool: ...

    def capabilities(self) -> ProviderCapabilities: ...

    async def health_check(self) -> ProviderHealth: ...

    async def list_models(self) -> list[AIModel]: ...

    async def generate(
        self,
        *,
        model: str | None = None,
        messages: list[dict[str, str]] | None = None,
        prompt: str | None = None,
        temperature: float | None = None,
        system: str | None = None,
    ) -> AIGenerationResult: ...

    async def generate_structured(
        self,
        *,
        json_schema: dict[str, Any],
        model: str | None = None,
        messages: list[dict[str, str]] | None = None,
        prompt: str | None = None,
        temperature: float | None = None,
        system: str | None = None,
    ) -> AIGenerationResult: ...
