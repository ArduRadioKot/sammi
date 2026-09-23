import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.db.session import SessionLocal
from app.models.workspace import WorkspaceMember, WorkspaceRole
from tests.db_guard import assert_safe_to_destroy_data


@pytest.fixture
async def clean_enrichment():
    yield
    assert_safe_to_destroy_data()
    async with SessionLocal() as session:
        await session.execute(
            text(
                "TRUNCATE enrichment_attempts, cell_provenance, enrichment_runs, "
                "table_rows, table_columns, tables, credit_transactions, credit_accounts, "
                "workspace_members, workspaces, users CASCADE"
            )
        )
        await session.commit()


async def _login(client: AsyncClient, email: str, name: str = "User") -> dict:
    response = await client.post("/api/v1/auth/login", json={"email": email, "name": name})
    assert response.status_code == 200
    return response.json()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _workspace_id(client: AsyncClient, token: str) -> str:
    response = await client.get("/api/v1/workspaces", headers=_auth(token))
    return response.json()["items"][0]["id"]


async def _table_with_inn(client: AsyncClient, token: str, workspace_id: str) -> tuple[dict, dict]:
    table = await client.post(
        f"/api/v1/workspaces/{workspace_id}/tables",
        headers=_auth(token),
        json={"name": "Компании", "object_type": "company"},
    )
    assert table.status_code == 201
    inn = await client.post(
        f"/api/v1/tables/{table.json()['id']}/columns",
        headers=_auth(token),
        json={"name": "ИНН", "type": "text", "config": {}},
    )
    assert inn.status_code == 201
    return table.json(), inn.json()


@pytest.mark.asyncio
async def test_provider_list_does_not_expose_key(client: AsyncClient, clean_enrichment) -> None:
    login = await _login(client, f"enr-{uuid.uuid4().hex}@example.com")
    response = await client.get("/api/v1/enrichment/providers", headers=_auth(login["access_token"]))
    assert response.status_code == 200
    items = response.json()["items"]
    assert items[0]["id"] == "dadata"
    assert items[0]["configured"] is False
    assert items[0]["available"] is None
    assert "api_key" not in str(response.json()).lower()
    assert any(op["id"] == "company_by_identifier" for op in items[0]["operations"])


@pytest.mark.asyncio
async def test_create_enrichment_column_and_run_blocked_without_key(client: AsyncClient, clean_enrichment) -> None:
    login = await _login(client, f"enr-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    table, inn = await _table_with_inn(client, token, workspace_id)
    created = await client.post(
        f"/api/v1/tables/{table['id']}/enrichment/columns",
        headers=_auth(token),
        json={
            "name": "Название компании",
            "provider_id": "dadata",
            "operation": "company_by_identifier",
            "input_column_id": inn["id"],
            "output_field": "company_name",
        },
    )
    assert created.status_code == 201
    assert created.json()["type"] == "enrichment"
    row = await client.post(
        f"/api/v1/tables/{table['id']}/rows",
        headers=_auth(token),
        json={"data": {inn["id"]: "7707083893"}},
    )
    assert row.status_code == 201
    run = await client.post(
        f"/api/v1/tables/{table['id']}/enrichment/runs",
        headers=_auth(token),
        json={"column_id": created.json()["id"], "row_ids": [row.json()["id"]]},
    )
    assert run.status_code == 400
    assert run.json()["error"]["code"] == "ENRICHMENT_PROVIDER_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_foreign_column_rejected(client: AsyncClient, clean_enrichment) -> None:
    login = await _login(client, f"enr-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    table, _inn = await _table_with_inn(client, token, workspace_id)
    other, inn2 = await _table_with_inn(client, token, workspace_id)
    created = await client.post(
        f"/api/v1/tables/{table['id']}/enrichment/columns",
        headers=_auth(token),
        json={
            "name": "Название",
            "provider_id": "dadata",
            "operation": "company_by_identifier",
            "input_column_id": inn2["id"],
            "output_field": "company_name",
        },
    )
    assert created.status_code == 400
    _ = other


@pytest.mark.asyncio
async def test_workspace_isolation(client: AsyncClient, clean_enrichment) -> None:
    a = await _login(client, f"a-{uuid.uuid4().hex}@example.com")
    b = await _login(client, f"b-{uuid.uuid4().hex}@example.com")
    workspace_a = await _workspace_id(client, a["access_token"])
    table, inn = await _table_with_inn(client, a["access_token"], workspace_a)
    column = await client.post(
        f"/api/v1/tables/{table['id']}/enrichment/columns",
        headers=_auth(a["access_token"]),
        json={
            "name": "Название",
            "provider_id": "dadata",
            "operation": "company_by_identifier",
            "input_column_id": inn["id"],
            "output_field": "company_name",
        },
    )
    hidden = await client.get(f"/api/v1/tables/{table['id']}", headers=_auth(b["access_token"]))
    assert hidden.status_code == 404
    run = await client.post(
        f"/api/v1/tables/{table['id']}/enrichment/runs",
        headers=_auth(b["access_token"]),
        json={"column_id": column.json()["id"]},
    )
    assert run.status_code == 404
    ghost = await client.get(f"/api/v1/enrichment/runs/{uuid.uuid4()}", headers=_auth(b["access_token"]))
    assert ghost.status_code == 404


@pytest.mark.asyncio
async def test_viewer_cannot_run(client: AsyncClient, clean_enrichment) -> None:
    owner = await _login(client, f"own-{uuid.uuid4().hex}@example.com")
    viewer = await _login(client, f"view-{uuid.uuid4().hex}@example.com")
    workspace_id = await _workspace_id(client, owner["access_token"])
    table, inn = await _table_with_inn(client, owner["access_token"], workspace_id)
    column = await client.post(
        f"/api/v1/tables/{table['id']}/enrichment/columns",
        headers=_auth(owner["access_token"]),
        json={
            "name": "Название",
            "provider_id": "dadata",
            "operation": "company_by_identifier",
            "input_column_id": inn["id"],
            "output_field": "company_name",
        },
    )
    async with SessionLocal() as session:
        session.add(
            WorkspaceMember(
                workspace_id=uuid.UUID(workspace_id),
                user_id=uuid.UUID(viewer["user"]["id"]),
                role=WorkspaceRole.viewer,
            )
        )
        await session.commit()
    readable = await client.get(f"/api/v1/tables/{table['id']}", headers=_auth(viewer["access_token"]))
    assert readable.status_code == 200
    run = await client.post(
        f"/api/v1/tables/{table['id']}/enrichment/runs",
        headers=_auth(viewer["access_token"]),
        json={"column_id": column.json()["id"]},
    )
    assert run.status_code == 403


@pytest.mark.asyncio
async def test_delete_table_cascades_enrichment(client: AsyncClient, clean_enrichment) -> None:
    login = await _login(client, f"enr-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    table, inn = await _table_with_inn(client, token, workspace_id)
    await client.post(
        f"/api/v1/tables/{table['id']}/enrichment/columns",
        headers=_auth(token),
        json={
            "name": "Название",
            "provider_id": "dadata",
            "operation": "company_by_identifier",
            "input_column_id": inn["id"],
            "output_field": "company_name",
        },
    )
    deleted = await client.delete(f"/api/v1/tables/{table['id']}", headers=_auth(token))
    assert deleted.status_code == 204
    async with SessionLocal() as session:
        runs = await session.execute(text("SELECT count(*) FROM enrichment_runs"))
        assert int(runs.scalar_one()) == 0
