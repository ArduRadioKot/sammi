import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.db.session import SessionLocal
from app.models.workspace import WorkspaceMember, WorkspaceRole
from tests.db_guard import assert_safe_to_destroy_data


@pytest.fixture
async def clean_tables():
    yield
    assert_safe_to_destroy_data()
    async with SessionLocal() as session:
        await session.execute(
            text("TRUNCATE table_rows, table_columns, tables, workspace_members, workspaces, users CASCADE")
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
    assert response.status_code == 200
    return response.json()["items"][0]["id"]


async def _create_table(client: AsyncClient, token: str, workspace_id: str, name: str = "Компании") -> dict:
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/tables",
        headers=_auth(token),
        json={"name": name, "object_type": "company"},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_create_list_update_delete_table(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"tables-{uuid.uuid4().hex}@example.com", "Ирина")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)

    created = await _create_table(client, token, workspace_id, "Test Companies")
    assert created["name"] == "Test Companies"
    assert created["object_type"] == "company"
    assert created["created_by"] == login["user"]["id"]
    assert created["workspace_id"] == workspace_id
    assert created["row_count"] == 0
    assert created["column_count"] == 0

    listed = await client.get(f"/api/v1/workspaces/{workspace_id}/tables", headers=_auth(token))
    assert listed.status_code == 200
    assert listed.json()["items"][0]["id"] == created["id"]

    patched = await client.patch(
        f"/api/v1/tables/{created['id']}",
        headers=_auth(token),
        json={"name": "Companies renamed"},
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Companies renamed"

    deleted = await client.delete(f"/api/v1/tables/{created['id']}", headers=_auth(token))
    assert deleted.status_code == 204
    missing = await client.get(f"/api/v1/tables/{created['id']}", headers=_auth(token))
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "TABLE_NOT_FOUND"


@pytest.mark.asyncio
async def test_cascade_delete_removes_columns_and_rows(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"cascade-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    table = await _create_table(client, token, workspace_id)
    column = await client.post(
        f"/api/v1/tables/{table['id']}/columns",
        headers=_auth(token),
        json={"name": "Компания", "type": "text", "config": {}},
    )
    assert column.status_code == 201
    row = await client.post(
        f"/api/v1/tables/{table['id']}/rows",
        headers=_auth(token),
        json={"data": {column.json()["id"]: "Selectel"}},
    )
    assert row.status_code == 201
    await client.delete(f"/api/v1/tables/{table['id']}", headers=_auth(token))
    async with SessionLocal() as session:
        columns = (await session.execute(text("SELECT count(*) FROM table_columns"))).scalar_one()
        rows = (await session.execute(text("SELECT count(*) FROM table_rows"))).scalar_one()
        tables = (await session.execute(text("SELECT count(*) FROM tables"))).scalar_one()
    assert columns == 0
    assert rows == 0
    assert tables == 0


@pytest.mark.asyncio
async def test_columns_create_rename_reorder_delete(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"cols-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    table = await _create_table(client, token, workspace_id)

    first = await client.post(
        f"/api/v1/tables/{table['id']}/columns",
        headers=_auth(token),
        json={"name": "Company", "type": "text"},
    )
    second = await client.post(
        f"/api/v1/tables/{table['id']}/columns",
        headers=_auth(token),
        json={"name": "Employees", "type": "number"},
    )
    third = await client.post(
        f"/api/v1/tables/{table['id']}/columns",
        headers=_auth(token),
        json={"name": "Active", "type": "boolean"},
    )
    assert first.status_code == 201
    ids = [first.json()["id"], second.json()["id"], third.json()["id"]]
    assert first.json()["position"] == 1
    assert second.json()["position"] == 2

    renamed = await client.patch(
        f"/api/v1/tables/{table['id']}/columns/{ids[0]}",
        headers=_auth(token),
        json={"name": "Company Name"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Company Name"

    reordered = await client.post(
        f"/api/v1/tables/{table['id']}/columns/reorder",
        headers=_auth(token),
        json={"column_ids": [ids[2], ids[0], ids[1]]},
    )
    assert reordered.status_code == 200
    assert [item["id"] for item in reordered.json()["items"]] == [ids[2], ids[0], ids[1]]
    assert [item["position"] for item in reordered.json()["items"]] == [1, 2, 3]

    bad_order = await client.post(
        f"/api/v1/tables/{table['id']}/columns/reorder",
        headers=_auth(token),
        json={"column_ids": [ids[0], ids[0]]},
    )
    assert bad_order.status_code == 400
    assert bad_order.json()["error"]["code"] == "INVALID_COLUMN_ORDER"

    row = await client.post(
        f"/api/v1/tables/{table['id']}/rows",
        headers=_auth(token),
        json={"data": {ids[0]: "OpenAI", ids[1]: 250, ids[2]: True}},
    )
    assert row.status_code == 201
    deleted = await client.delete(f"/api/v1/tables/{table['id']}/columns/{ids[1]}", headers=_auth(token))
    assert deleted.status_code == 204
    remaining = await client.get(f"/api/v1/tables/{table['id']}/rows", headers=_auth(token))
    data = remaining.json()["items"][0]["data"]
    assert ids[1] not in data
    assert data[ids[0]] == "OpenAI"


@pytest.mark.asyncio
async def test_rows_create_patch_delete_and_validation(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"rows-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    table = await _create_table(client, token, workspace_id)
    text_col = (
        await client.post(
            f"/api/v1/tables/{table['id']}/columns",
            headers=_auth(token),
            json={"name": "Company", "type": "text"},
        )
    ).json()
    number_col = (
        await client.post(
            f"/api/v1/tables/{table['id']}/columns",
            headers=_auth(token),
            json={"name": "Employees", "type": "number"},
        )
    ).json()

    empty = await client.post(f"/api/v1/tables/{table['id']}/rows", headers=_auth(token), json={"data": {}})
    assert empty.status_code == 201
    assert empty.json()["data"] == {}

    created = await client.post(
        f"/api/v1/tables/{table['id']}/rows",
        headers=_auth(token),
        json={"data": {text_col["id"]: "OpenAI Test Company", number_col["id"]: 250}},
    )
    assert created.status_code == 201
    row_id = created.json()["id"]

    patched = await client.patch(
        f"/api/v1/tables/{table['id']}/rows/{row_id}",
        headers=_auth(token),
        json={"data": {number_col["id"]: 100}},
    )
    assert patched.status_code == 200
    assert patched.json()["data"][text_col["id"]] == "OpenAI Test Company"
    assert patched.json()["data"][number_col["id"]] == 100

    cleared = await client.patch(
        f"/api/v1/tables/{table['id']}/rows/{row_id}",
        headers=_auth(token),
        json={"data": {number_col["id"]: None}},
    )
    assert cleared.status_code == 200
    assert number_col["id"] not in cleared.json()["data"]

    invalid_type = await client.patch(
        f"/api/v1/tables/{table['id']}/rows/{row_id}",
        headers=_auth(token),
        json={"data": {number_col["id"]: "lots"}},
    )
    assert invalid_type.status_code == 400
    assert invalid_type.json()["error"]["code"] == "INVALID_CELL_VALUE"

    unknown = await client.post(
        f"/api/v1/tables/{table['id']}/rows",
        headers=_auth(token),
        json={"data": {str(uuid.uuid4()): "x"}},
    )
    assert unknown.status_code == 400
    assert unknown.json()["error"]["code"] == "COLUMN_NOT_FOUND"

    listed = await client.get(f"/api/v1/tables/{table['id']}/rows?limit=1&offset=0", headers=_auth(token))
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] == 2
    assert body["limit"] == 1
    assert len(body["items"]) == 1

    deleted = await client.delete(f"/api/v1/tables/{table['id']}/rows/{row_id}", headers=_auth(token))
    assert deleted.status_code == 204
    remaining = await client.get(f"/api/v1/tables/{table['id']}/rows", headers=_auth(token))
    assert remaining.json()["total"] == 1

    bulk = await client.post(
        f"/api/v1/tables/{table['id']}/rows/bulk-delete",
        headers=_auth(token),
        json={"row_ids": [empty.json()["id"]]},
    )
    assert bulk.status_code == 204
    after = await client.get(f"/api/v1/tables/{table['id']}/rows", headers=_auth(token))
    assert after.json()["total"] == 0


@pytest.mark.asyncio
async def test_workspace_isolation(client: AsyncClient, clean_tables) -> None:
    user_a = await _login(client, f"a-{uuid.uuid4().hex}@example.com", "A")
    user_b = await _login(client, f"b-{uuid.uuid4().hex}@example.com", "B")
    ws_a = await _workspace_id(client, user_a["access_token"])
    table = await _create_table(client, user_a["access_token"], ws_a, "Secret")
    column = await client.post(
        f"/api/v1/tables/{table['id']}/columns",
        headers=_auth(user_a["access_token"]),
        json={"name": "Name", "type": "text"},
    )
    row = await client.post(
        f"/api/v1/tables/{table['id']}/rows",
        headers=_auth(user_a["access_token"]),
        json={"data": {column.json()["id"]: "private"}},
    )
    headers_b = _auth(user_b["access_token"])
    forbidden = [
        await client.get(f"/api/v1/tables/{table['id']}", headers=headers_b),
        await client.patch(f"/api/v1/tables/{table['id']}", headers=headers_b, json={"name": "Hijack"}),
        await client.delete(f"/api/v1/tables/{table['id']}", headers=headers_b),
        await client.post(
            f"/api/v1/tables/{table['id']}/columns",
            headers=headers_b,
            json={"name": "Nope", "type": "text"},
        ),
        await client.get(f"/api/v1/tables/{table['id']}/rows", headers=headers_b),
        await client.patch(
            f"/api/v1/tables/{table['id']}/rows/{row.json()['id']}",
            headers=headers_b,
            json={"data": {column.json()["id"]: "stolen"}},
        ),
    ]
    for response in forbidden:
        assert response.status_code == 404, response.text
        assert response.json()["error"]["code"] == "TABLE_NOT_FOUND"


@pytest.mark.asyncio
async def test_viewer_cannot_write(client: AsyncClient, clean_tables) -> None:
    owner = await _login(client, f"owner-{uuid.uuid4().hex}@example.com", "Owner")
    viewer = await _login(client, f"viewer-{uuid.uuid4().hex}@example.com", "Viewer")
    ws = await _workspace_id(client, owner["access_token"])
    table = await _create_table(client, owner["access_token"], ws)
    async with SessionLocal() as session:
        session.add(
            WorkspaceMember(
                workspace_id=uuid.UUID(ws),
                user_id=uuid.UUID(viewer["user"]["id"]),
                role=WorkspaceRole.viewer,
            )
        )
        await session.commit()

    readable = await client.get(f"/api/v1/tables/{table['id']}", headers=_auth(viewer["access_token"]))
    assert readable.status_code == 200
    denied = await client.post(
        f"/api/v1/tables/{table['id']}/columns",
        headers=_auth(viewer["access_token"]),
        json={"name": "X", "type": "text"},
    )
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "TABLE_ACCESS_DENIED"

    create_denied = await client.post(
        f"/api/v1/workspaces/{ws}/tables",
        headers=_auth(viewer["access_token"]),
        json={"name": "Nope", "object_type": "custom"},
    )
    assert create_denied.status_code == 403
    assert create_denied.json()["error"]["code"] == "WORKSPACE_ACCESS_DENIED"


@pytest.mark.asyncio
async def test_invalid_column_type_rejected(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"type-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    table = await _create_table(client, token, workspace_id)
    response = await client.post(
        f"/api/v1/tables/{table['id']}/columns",
        headers=_auth(token),
        json={"name": "AI", "type": "ai"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_COLUMN_TYPE"


@pytest.mark.asyncio
async def test_row_count_is_real(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"count-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    table = await _create_table(client, token, workspace_id)
    for _ in range(3):
        created = await client.post(f"/api/v1/tables/{table['id']}/rows", headers=_auth(token), json={"data": {}})
        assert created.status_code == 201
    listed = await client.get(f"/api/v1/workspaces/{workspace_id}/tables", headers=_auth(token))
    assert listed.json()["items"][0]["row_count"] == 3
    detail = await client.get(f"/api/v1/tables/{table['id']}", headers=_auth(token))
    assert detail.json()["row_count"] == 3
