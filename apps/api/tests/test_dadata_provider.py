import json
import os

import httpx
import pytest

from app.core.errors import AppError
from app.providers.enrichment.dadata import DaDataEnrichmentProvider
from app.providers.enrichment.types import COMPANY_BY_IDENTIFIER, EnrichmentRequest

SBER_INN = "7707083893"

PARTY = {
    "suggestions": [
        {
            "value": "ПАО Сбербанк",
            "unrestricted_value": "ПАО Сбербанк",
            "data": {
                "hid": "hid-sber",
                "inn": SBER_INN,
                "kpp": "773601001",
                "ogrn": "1027700132195",
                "okved": "64.19",
                "name": {"full_with_opf": "ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО СБЕРБАНК РОССИИ", "short_with_opf": "ПАО Сбербанк"},
                "state": {"status": "ACTIVE"},
                "address": {"unrestricted_value": "г Москва", "value": "г Москва"},
                "management": {"name": "Греф Герман Оскарович", "post": "Президент, Председатель Правления"},
                "finance": {"revenue": None},
            },
        }
    ]
}


def _provider(handler, **kwargs) -> DaDataEnrichmentProvider:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return DaDataEnrichmentProvider(
        api_key=kwargs.get("api_key", "test-key"),
        base_url="https://suggestions.dadata.ru/suggestions/api/4_1/rs",
        timeout_seconds=15,
        credits_per_success=1,
        store_raw=kwargs.get("store_raw", False),
        client=client,
    )


def _request(query: str = SBER_INN, field: str = "company_name") -> EnrichmentRequest:
    return EnrichmentRequest(operation=COMPANY_BY_IDENTIFIER, input={"query": query}, requested_field=field)


def test_not_configured() -> None:
    provider = DaDataEnrichmentProvider(
        api_key="",
        base_url="https://suggestions.dadata.ru/suggestions/api/4_1/rs",
        timeout_seconds=15,
        credits_per_success=1,
    )
    assert provider.configured() is False


@pytest.mark.asyncio
async def test_auth_header_endpoint_and_body() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers.get("authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json=PARTY)

    provider = _provider(handler)
    result = await provider.enrich(_request())
    assert captured["url"].endswith("/findById/party")
    assert captured["authorization"] == "Token test-key"
    assert captured["body"] == {"query": SBER_INN, "branch_type": "MAIN"}
    assert result.status == "success"
    assert result.value == "ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО СБЕРБАНК РОССИИ"
    assert result.data["inn"] == SBER_INN
    assert result.data["status"] == "Действующая"
    assert result.data["management_name"] == "Греф Герман Оскарович"
    assert result.raw is None


@pytest.mark.asyncio
async def test_not_found() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"suggestions": []})

    result = await _provider(handler).enrich(_request("0000000000"))
    assert result.status == "not_found"


@pytest.mark.asyncio
async def test_null_field_is_no_value() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=PARTY)

    result = await _provider(handler).enrich(_request(field="revenue"))
    assert result.status == "no_value"
    assert result.value is None
    assert result.data["company_name"]


@pytest.mark.asyncio
async def test_http_errors() -> None:
    for status, code in (
        (401, "ENRICHMENT_PROVIDER_AUTH_FAILED"),
        (403, "ENRICHMENT_PROVIDER_AUTH_FAILED"),
        (429, "ENRICHMENT_PROVIDER_RATE_LIMIT"),
        (500, "ENRICHMENT_PROVIDER_UNAVAILABLE"),
    ):
        def handler(_request: httpx.Request, status_code=status) -> httpx.Response:
            return httpx.Response(status_code, json={"message": "vendor"})

        result = await _provider(handler).enrich(_request())
        assert result.status == "error"
        assert result.error_code == code
        assert result.error_message != "vendor"


@pytest.mark.asyncio
async def test_timeout() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout")

    with pytest.raises(AppError) as exc:
        await _provider(handler).enrich(_request())
    assert exc.value.code == "ENRICHMENT_PROVIDER_TIMEOUT"


@pytest.mark.asyncio
async def test_invalid_json() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not-json")

    with pytest.raises(AppError) as exc:
        await _provider(handler).enrich(_request())
    assert exc.value.code == "ENRICHMENT_PROVIDER_INVALID_RESPONSE"


@pytest.mark.dadata
@pytest.mark.skipif(
    os.environ.get("DADATA_INTEGRATION_TEST") != "true" or not os.environ.get("DADATA_API_KEY"),
    reason="live DaData not configured",
)
@pytest.mark.asyncio
async def test_live_dadata_sber_inn() -> None:
    provider = DaDataEnrichmentProvider(
        api_key=os.environ["DADATA_API_KEY"],
        base_url=os.environ.get("DADATA_BASE_URL", "https://suggestions.dadata.ru/suggestions/api/4_1/rs"),
        timeout_seconds=15,
        credits_per_success=1,
    )
    result = await provider.enrich(_request("7707083893", "company_name"))
    assert result.status in {"success", "not_found"}
    if result.status == "success":
        assert result.value
        assert result.provider == "dadata"

