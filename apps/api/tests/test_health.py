import pytest
from httpx import AsyncClient

from app.core.errors import AppError
from app.services.health import HealthService


@pytest.mark.asyncio
async def test_health_response(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
    assert response.headers.get("x-request-id")


@pytest.mark.asyncio
async def test_health_database_connection(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.json()["database"] == "ok"


@pytest.mark.asyncio
async def test_health_database_failure() -> None:
    class BrokenSession:
        async def execute(self, _statement):
            raise OSError("connection refused")

    with pytest.raises(AppError) as caught:
        await HealthService().assert_database(BrokenSession())  # type: ignore[arg-type]
    assert caught.value.code == "DATABASE_UNAVAILABLE"
    assert caught.value.status_code == 503


@pytest.mark.asyncio
async def test_basic_api_error_contract(client: AsyncClient) -> None:
    response = await client.get("/api/v1/missing")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"
    assert body["error"]["message"]
    assert "traceback" not in response.text.lower()
