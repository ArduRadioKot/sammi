from app.core.config import Settings
from app.providers.ai.gigachat import GigaChatProvider
from app.providers.ai.ollama import OllamaProvider
from app.providers.ai.types import AIProvider
from app.providers.ai.yandex import YandexProvider

PROVIDER_ORDER = ("ollama", "yandex", "gigachat")


class AIProviderRegistry:
    def __init__(self, settings: Settings) -> None:
        self._providers: dict[str, AIProvider] = {
            "ollama": OllamaProvider(
                settings.ollama_base_url,
                settings.ollama_model or None,
                timeout_seconds=settings.ollama_timeout_seconds,
            ),
            "yandex": YandexProvider(
                settings.yandex_ai_api_key,
                settings.yandex_ai_project_id,
                settings.yandex_ai_base_url,
                settings.yandex_ai_model or None,
            ),
            "gigachat": GigaChatProvider(
                settings.gigachat_auth_key,
                settings.gigachat_scope,
                settings.gigachat_base_url,
                settings.gigachat_auth_url,
                settings.gigachat_model or None,
                settings.gigachat_verify_ssl,
            ),
        }

    def get(self, provider_id: str) -> AIProvider | None:
        return self._providers.get(provider_id)

    def list(self) -> list[AIProvider]:
        return [self._providers[key] for key in PROVIDER_ORDER]
