import asyncio
import time
import uuid

import httpx

from app.core.logging import get_logger
from app.providers.ai.base import ProviderMixin, map_http_error
from app.providers.ai.types import ProviderHealth

logger = get_logger("app.ai.gigachat")
HEALTH_TIMEOUT = httpx.Timeout(3.0, connect=2.0)
TOKEN_SKEW_SECONDS = 30


class GigaChatProvider(ProviderMixin):
    provider_id = "gigachat"

    def __init__(
        self,
        auth_key: str,
        scope: str,
        base_url: str,
        auth_url: str,
        model: str | None,
        verify_ssl: bool = True,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.auth_key = auth_key.strip()
        self.scope = scope.strip() or "GIGACHAT_API_PERS"
        self.base_url = base_url.rstrip("/")
        self.auth_url = auth_url.rstrip("/")
        self.model = model
        self.verify_ssl = verify_ssl
        self._client = client
        self._token: str | None = None
        self._expires_at = 0.0
        self._lock = asyncio.Lock()

    def is_configured(self) -> bool:
        return bool(self.auth_key)

    async def _get_token(self, client: httpx.AsyncClient) -> str:
        async with self._lock:
            if self._token and time.time() < self._expires_at - TOKEN_SKEW_SECONDS:
                return self._token
            response = await client.post(
                self.auth_url,
                headers={
                    "Authorization": f"Basic {self.auth_key}",
                    "RqUID": str(uuid.uuid4()),
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                },
                data={"scope": self.scope},
            )
            if response.status_code >= 400:
                raise httpx.HTTPStatusError("auth failed", request=response.request, response=response)
            payload = response.json()
            token = payload.get("access_token")
            if not token:
                raise ValueError("missing access_token")
            expires_at = payload.get("expires_at")
            expires_in = payload.get("expires_in", 1800)
            if isinstance(expires_at, (int, float)) and expires_at > 1_000_000_000_000:
                self._expires_at = expires_at / 1000
            elif isinstance(expires_at, (int, float)) and expires_at > 1_000_000_000:
                self._expires_at = float(expires_at)
            else:
                self._expires_at = time.time() + float(expires_in)
            self._token = str(token)
            return self._token

    async def health_check(self) -> ProviderHealth:
        if not self.is_configured():
            return ProviderHealth(False, "AI_PROVIDER_NOT_CONFIGURED", "GigaChat is not configured")
        client = self._client or httpx.AsyncClient(timeout=HEALTH_TIMEOUT, verify=self.verify_ssl)
        close = self._client is None
        try:
            token = await self._get_token(client)
            response = await client.get(
                f"{self.base_url}/models",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
        except httpx.TimeoutException:
            logger.info("provider=gigachat operation=health status=timeout")
            return map_http_error(0, timeout=True)
        except httpx.HTTPStatusError as exc:
            logger.info("provider=gigachat operation=health status=%s", exc.response.status_code)
            return map_http_error(exc.response.status_code)
        except httpx.HTTPError as exc:
            logger.info("provider=gigachat operation=health status=unavailable type=%s", type(exc).__name__)
            return ProviderHealth(False, "AI_PROVIDER_UNAVAILABLE", "GigaChat is unavailable")
        except ValueError:
            logger.info("provider=gigachat operation=health status=auth_failed")
            return ProviderHealth(False, "AI_PROVIDER_AUTH_FAILED", "Provider authentication failed")
        finally:
            if close:
                await client.aclose()
        if response.status_code >= 400:
            logger.info("provider=gigachat operation=health status=%s", response.status_code)
            return map_http_error(response.status_code)
        logger.info("provider=gigachat operation=health status=ok")
        return ProviderHealth(True)
