import httpx

from app.core.logging import get_logger
from app.providers.ai.base import ProviderMixin, map_http_error
from app.providers.ai.types import ProviderHealth

logger = get_logger("app.ai.yandex")
HEALTH_TIMEOUT = httpx.Timeout(3.0, connect=2.0)


class YandexProvider(ProviderMixin):
    provider_id = "yandex"

    def __init__(
        self,
        api_key: str,
        project_id: str,
        base_url: str,
        model: str | None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.api_key = api_key.strip()
        self.project_id = project_id.strip()
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._client = client

    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def health_check(self) -> ProviderHealth:
        if not self.is_configured():
            return ProviderHealth(False, "AI_PROVIDER_NOT_CONFIGURED", "Yandex AI is not configured")
        headers: dict[str, str] = {"Authorization": f"Bearer {self.api_key}"}
        if self.project_id:
            headers["x-folder-id"] = self.project_id
        client = self._client or httpx.AsyncClient(timeout=HEALTH_TIMEOUT)
        close = self._client is None
        try:
            response = await client.get(f"{self.base_url}/models", headers=headers)
        except httpx.TimeoutException:
            logger.info("provider=yandex operation=health status=timeout")
            return map_http_error(0, timeout=True)
        except httpx.HTTPError as exc:
            logger.info("provider=yandex operation=health status=unavailable type=%s", type(exc).__name__)
            return ProviderHealth(False, "AI_PROVIDER_UNAVAILABLE", "Yandex AI is unavailable")
        finally:
            if close:
                await client.aclose()
        if response.status_code >= 400:
            logger.info("provider=yandex operation=health status=%s", response.status_code)
            return map_http_error(response.status_code)
        logger.info("provider=yandex operation=health status=ok")
        return ProviderHealth(True)
