from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.errors import AppError
from app.core.logging import get_logger
from app.providers.enrichment.types import (
    COMPANY_BY_IDENTIFIER,
    ERROR,
    NO_VALUE,
    NOT_FOUND,
    OUTPUT_FIELDS,
    STATUS_LABELS,
    SUCCESS,
    EnrichmentField,
    EnrichmentOperation,
    EnrichmentRequest,
    EnrichmentResult,
    ProviderCapabilities,
    identifier_to_text,
)

logger = get_logger("app.enrichment.dadata")


class DaDataEnrichmentProvider:
    provider_id = "dadata"
    display_name = "DaData"
    region = "RU"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        timeout_seconds: float,
        credits_per_success: int,
        store_raw: bool = False,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = (api_key or "").strip()
        self._base_url = (base_url or "").rstrip("/")
        self._timeout = timeout_seconds
        self._credits = max(int(credits_per_success), 0)
        self._store_raw = store_raw
        self._client = client

    def configured(self) -> bool:
        return bool(self._api_key)

    def capabilities(self) -> ProviderCapabilities:
        outputs = tuple(EnrichmentField(id=item["id"], label=item["label"]) for item in OUTPUT_FIELDS)
        return ProviderCapabilities(
            operations=(
                EnrichmentOperation(
                    id=COMPANY_BY_IDENTIFIER,
                    label="Компания по ИНН / ОГРН",
                    inputs=("inn", "ogrn"),
                    outputs=outputs,
                    credits_per_success=self._credits,
                ),
            )
        )

    async def health_check(self) -> tuple[bool | None, str | None]:
        if not self.configured():
            return False, "ENRICHMENT_PROVIDER_NOT_CONFIGURED"
        return None, None

    async def enrich(self, request: EnrichmentRequest) -> EnrichmentResult:
        if not self.configured():
            raise AppError(
                "ENRICHMENT_PROVIDER_NOT_CONFIGURED",
                "DaData is not configured",
                status_code=400,
            )
        if request.operation != COMPANY_BY_IDENTIFIER:
            raise AppError(
                "ENRICHMENT_OPERATION_UNSUPPORTED",
                f"Unsupported operation: {request.operation}",
                status_code=400,
            )
        query = identifier_to_text(request.input.get("query"))
        if not query:
            return EnrichmentResult(
                status=NOT_FOUND,
                provider=self.provider_id,
                operation=request.operation,
                error_code="EMPTY_INPUT",
                error_message="Identifier is empty",
            )
        payload, status_code = await self._find_party(query)
        if status_code is not None:
            return self._http_error(status_code, request.operation)
        return self._normalize(payload, request)

    async def _find_party(self, query: str) -> tuple[dict[str, Any] | None, int | None]:
        url = f"{self._base_url}/findById/party"
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Token {self._api_key}",
        }
        body = {"query": query, "branch_type": "MAIN"}
        try:
            if self._client is not None:
                response = await self._client.post(url, headers=headers, json=body)
            else:
                timeout = httpx.Timeout(self._timeout)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.post(url, headers=headers, json=body)
        except httpx.TimeoutException:
            raise AppError(
                "ENRICHMENT_PROVIDER_TIMEOUT",
                "DaData request timed out",
                status_code=504,
            ) from None
        except httpx.HTTPError:
            raise AppError(
                "ENRICHMENT_PROVIDER_UNAVAILABLE",
                "DaData is unavailable",
                status_code=503,
            ) from None
        if response.status_code >= 400:
            return None, response.status_code
        try:
            payload = response.json()
        except ValueError as exc:
            raise AppError(
                "ENRICHMENT_PROVIDER_INVALID_RESPONSE",
                "DaData returned invalid JSON",
                status_code=502,
            ) from exc
        if not isinstance(payload, dict):
            raise AppError(
                "ENRICHMENT_PROVIDER_INVALID_RESPONSE",
                "DaData returned an unexpected payload",
                status_code=502,
            )
        return payload, None

    def _http_error(self, status_code: int, operation: str) -> EnrichmentResult:
        if status_code in {401, 403}:
            code, message = "ENRICHMENT_PROVIDER_AUTH_FAILED", "DaData authentication failed"
        elif status_code == 429:
            code, message = "ENRICHMENT_PROVIDER_RATE_LIMIT", "DaData rate limit reached"
        elif status_code >= 500:
            code, message = "ENRICHMENT_PROVIDER_UNAVAILABLE", "DaData is unavailable"
        else:
            code, message = "ENRICHMENT_PROVIDER_INVALID_RESPONSE", "DaData rejected the request"
        return EnrichmentResult(
            status=ERROR,
            provider=self.provider_id,
            operation=operation,
            error_code=code,
            error_message=message,
            metadata={"http_status": status_code},
        )

    def _normalize(self, payload: dict[str, Any], request: EnrichmentRequest) -> EnrichmentResult:
        suggestions = payload.get("suggestions")
        if not isinstance(suggestions, list) or not suggestions:
            return EnrichmentResult(
                status=NOT_FOUND,
                provider=self.provider_id,
                operation=request.operation,
                source="DaData",
                metadata={"source": "dadata", "retrieved_at": _now()},
            )
        first = suggestions[0]
        if not isinstance(first, dict):
            raise AppError(
                "ENRICHMENT_PROVIDER_INVALID_RESPONSE",
                "DaData returned an unexpected suggestion",
                status_code=502,
            )
        data = first.get("data") if isinstance(first.get("data"), dict) else {}
        normalized = _party_fields(first, data)
        requested = request.requested_field
        value = normalized.get(requested)
        status = SUCCESS if value not in (None, "") else NO_VALUE
        metadata = {
            "source": "dadata",
            "hid": data.get("hid"),
            "retrieved_at": _now(),
        }
        raw = payload if self._store_raw else None
        return EnrichmentResult(
            status=status,
            data=normalized,
            value=value if status == SUCCESS else None,
            provider=self.provider_id,
            operation=request.operation,
            source="DaData",
            metadata=metadata,
            raw=raw,
        )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _party_fields(suggestion: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    name = data.get("name") if isinstance(data.get("name"), dict) else {}
    state = data.get("state") if isinstance(data.get("state"), dict) else {}
    address = data.get("address") if isinstance(data.get("address"), dict) else {}
    management = data.get("management") if isinstance(data.get("management"), dict) else {}
    finance = data.get("finance") if isinstance(data.get("finance"), dict) else {}
    status_raw = _text(state.get("status"))
    revenue = finance.get("revenue")
    return {
        "company_name": _text(name.get("full_with_opf")) or _text(suggestion.get("unrestricted_value")) or _text(suggestion.get("value")),
        "company_short_name": _text(name.get("short_with_opf")) or _text(name.get("short")),
        "inn": _text(data.get("inn")),
        "kpp": _text(data.get("kpp")),
        "ogrn": _text(data.get("ogrn")),
        "status": STATUS_LABELS.get(status_raw or "", status_raw),
        "address": _text(address.get("unrestricted_value")) or _text(address.get("value")),
        "management_name": _text(management.get("name")),
        "management_post": _text(management.get("post")),
        "okved": _text(data.get("okved")),
        "revenue": revenue if isinstance(revenue, (int, float)) and not isinstance(revenue, bool) else None,
    }
