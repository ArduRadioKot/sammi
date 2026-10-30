import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.db.session import SessionLocal
from tests.db_guard import assert_safe_to_destroy_data


@pytest.fixture
async def clean_tables():
    yield
    assert_safe_to_destroy_data()
    async with SessionLocal() as session:
        await session.execute(text("TRUNCATE geocode_cache, table_rows, table_columns, tables, workspace_members, workspaces, users CASCADE"))
        await session.commit()


async def _login(client: AsyncClient, email: str) -> dict:
    response = await client.post("/api/v1/auth/login", json={"email": email})
    assert response.status_code == 200
    return response.json()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _workspace_id(client: AsyncClient, token: str) -> str:
    response = await client.get("/api/v1/workspaces", headers=_auth(token))
    assert response.status_code == 200
    return response.json()["items"][0]["id"]


class FakeGeocoderProvider:
    provider_id = "fake-nominatim"

    def __init__(self, *queries: str) -> None:
        self._matched = set(queries)

    def max_requests(self) -> int:
        return 100

    async def geocode(self, query: str) -> tuple[float, float, str | None] | None:
        if query in self._matched:
            return 55.7558, 37.6173, "Москва"
        return None


@pytest.mark.asyncio
async def test_map_requires_auth(client: AsyncClient, clean_tables) -> None:
    response = await client.get(f"/api/v1/tables/{uuid.uuid4()}/map")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_map_table_not_found(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"map-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    response = await client.get(f"/api/v1/tables/{uuid.uuid4()}/map", headers=_auth(token))
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_map_no_address_column(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"map-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)

    table = (
        await client.post(
            f"/api/v1/workspaces/{workspace_id}/tables",
            headers=_auth(token),
            json={"name": "No address", "object_type": "company"},
        )
    ).json()
    await client.post(
        f"/api/v1/tables/{table['id']}/columns",
        headers=_auth(token),
        json={"name": "Метка", "type": "text", "config": {}},
    )

    response = await client.get(f"/api/v1/tables/{table['id']}/map", headers=_auth(token))
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "MAP_NO_ADDRESS_COLUMN"


@pytest.mark.asyncio
async def test_map_points_geocode_and_cache(client: AsyncClient, clean_tables, monkeypatch) -> None:
    from app.services import map as map_service_module

    login = await _login(client, f"map-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)

    table = (
        await client.post(
            f"/api/v1/workspaces/{workspace_id}/tables",
            headers=_auth(token),
            json={"name": "Map Companies", "object_type": "company"},
        )
    ).json()
    address_column = (
        await client.post(
            f"/api/v1/tables/{table['id']}/columns",
            headers=_auth(token),
            json={"name": "Адрес", "type": "text", "config": {}},
        )
    ).json()
    name_column = (
        await client.post(
            f"/api/v1/tables/{table['id']}/columns",
            headers=_auth(token),
            json={"name": "Название", "type": "text", "config": {}},
        )
    ).json()

    row_one = (
        await client.post(
            f"/api/v1/tables/{table['id']}/rows",
            headers=_auth(token),
            json={"data": {address_column["id"]: "Москва, Садовая-Самотечная 10", name_column["id"]: "First"}},
        )
    ).json()
    row_two = (
        await client.post(
            f"/api/v1/tables/{table['id']}/rows",
            headers=_auth(token),
            json={"data": {address_column["id"]: "Невиданный город", name_column["id"]: "Second"}},
        )
    ).json()

    provider = FakeGeocoderProvider("Москва, Садовая-Самотечная 10")
    monkeypatch.setattr(
        map_service_module,
        "NominatimGeocodingProvider",
        lambda **kwargs: provider,
    )

    first = await client.get(f"/api/v1/tables/{table['id']}/map", headers=_auth(token))
    assert first.status_code == 200, first.text
    payload = first.json()
    assert payload["column_id"] == address_column["id"]
    assert payload["column_name"] == "Адрес"
    assert payload["total_rows"] == 2
    assert payload["resolved"] == 1
    assert payload["unresolved"] == 1
    assert payload["geocoded"] == 1
    assert payload["source"] == "geocoded"
    assert len(payload["points"]) == 1
    point = payload["points"][0]
    assert point["row_id"] == row_one["id"]
    assert point["lat"] == pytest.approx(55.7558)
    assert point["lon"] == pytest.approx(37.6173)

    second = await client.get(f"/api/v1/tables/{table['id']}/map", headers=_auth(token))
    payload = second.json()
    assert payload["geocoded"] == 0
    assert payload["cached"] == 1
    assert payload["resolved"] == 1
    assert payload["points"][0]["row_id"] in {row_one["id"], row_two["id"]}

    third = await client.get(
        f"/api/v1/tables/{table['id']}/map",
        params={"column_id": name_column["id"]},
        headers=_auth(token),
    )
    assert third.status_code == 200
    assert third.json()["column_id"] == name_column["id"]
    assert third.json()["points"] == []
    _ = row_two
