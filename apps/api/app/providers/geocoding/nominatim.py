from __future__ import annotations

from typing import Any

import httpx

from app.core.errors import AppError
from app.core.logging import get_logger

logger = get_logger("app.geocoding.nominatim")


class NominatimGeocodingProvider:
    """Geocode free-form address strings through the OSM Nominatim search API."""

    provider_id = "nominatim"

    def __init__(
        self,
        *,
        base_url: str,
        user_agent: str,
        timeout_seconds: float,
        max_requests: int,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._user_agent = user_agent
        self._timeout = timeout_seconds
        self._max_requests = max(int(max_requests), 0)
        self._client = client

    def max_requests(self) -> int:
        return self._max_requests

    async def geocode(self, query: str) -> tuple[float, float, str | None] | None:
        """Return (lat, lon, display_name) for the first match, or None if not found."""
        url = f"{self._base_url}/search"
        params = {
            "q": query,
            "format": "jsonv2",
            "limit": 1,
            "accept-language": "ru",
        }
        headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
        payload = await self._request(url, params, headers)
        return self._normalize(payload)

    async def _request(
        self,
        url: str,
        params: dict[str, Any],
        headers: dict[str, str],
    ) -> Any:
        try:
            if self._client is not None:
                response = await self._client.get(url, params=params, headers=headers)
            else:
                timeout = httpx.Timeout(self._timeout)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.get(url, params=params, headers=headers)
        except httpx.TimeoutException:
            raise AppError(
                "GEOCODING_PROVIDER_TIMEOUT",
                "Geocoding request timed out",
                status_code=504,
            ) from None
        except httpx.HTTPError:
            raise AppError(
                "GEOCODING_PROVIDER_UNAVAILABLE",
                "Geocoding provider is unavailable",
                status_code=503,
            ) from None
        if response.status_code >= 400:
            raise AppError(
                "GEOCODING_PROVIDER_ERROR",
                "Geocoding provider rejected the request",
                status_code=502,
            )
        try:
            return response.json()
        except ValueError as exc:
            raise AppError(
                "GEOCODING_PROVIDER_INVALID_RESPONSE",
                "Geocoding provider returned invalid JSON",
                status_code=502,
            ) from exc

    def _normalize(self, payload: Any) -> tuple[float, float, str | None] | None:
        if not isinstance(payload, dict) and not isinstance(payload, list):
            raise AppError(
                "GEOCODING_PROVIDER_INVALID_RESPONSE",
                "Geocoding provider returned an unexpected payload",
                status_code=502,
            )
        matches = payload if isinstance(payload, list) else payload.get("results")
        if not isinstance(matches, list) or not matches:
            return None
        first = matches[0]
        if not isinstance(first, dict):
            return None
        lat = _number(first.get("lat"))
        lon = _number(first.get("lon"))
        if lat is None or lon is None:
            return None
        display_name = str(first.get("display_name")).strip() or None if first.get("display_name") else None
        return lat, lon, display_name


def _number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None
