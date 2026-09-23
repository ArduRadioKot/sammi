import csv
import io
import json
import time
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.workspace import WorkspaceMember, WorkspaceRole
from tests.csv_support import csv_bytes
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


async def _create_table(client: AsyncClient, token: str, workspace_id: str, name: str = "CRM Leads") -> dict:
    response = await client.post(
        f"/api/v1/workspaces/{workspace_id}/tables",
        headers=_auth(token),
        json={"name": name, "object_type": "company"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _mapping_create(headers: list[dict], overrides: dict[int, dict] | None = None) -> str:
    columns = []
    for header in headers:
        item = {
            "csv_index": header["index"],
            "action": "create",
            "name": header["name"],
            "type": header["suggested_type"],
        }
        if overrides and header["index"] in overrides:
            item.update(overrides[header["index"]])
        columns.append(item)
    return json.dumps({"columns": columns})


async def _preview(client: AsyncClient, url: str, token: str, data: bytes, filename: str, delimiter: str | None = None):
    form = {"file": (filename, data, "text/csv")}
    fields = {"delimiter": delimiter} if delimiter else None
    response = await client.post(url, headers=_auth(token), files=form, data=fields)
    return response


@pytest.mark.asyncio
async def test_create_table_from_csv(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"csv-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    data = csv_bytes("companies.csv")
    preview = await _preview(
        client, f"/api/v1/workspaces/{workspace_id}/imports/csv/preview", token, data, "companies.csv"
    )
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["row_count"] == 3
    assert body["file_signature"]
    assert body["suggested_table_name"] == "companies"
    imported = await client.post(
        f"/api/v1/workspaces/{workspace_id}/imports/csv",
        headers=_auth(token),
        files={"file": ("companies.csv", data, "text/csv")},
        data={
            "mapping_json": _mapping_create(body["headers"]),
            "options_json": json.dumps(
                {
                    "file_signature": body["file_signature"],
                    "table_name": "Imported Companies",
                    "object_type": "company",
                    "delimiter": "comma",
                }
            ),
        },
    )
    assert imported.status_code == 200, imported.text
    payload = imported.json()
    assert payload["rows_imported"] == 3
    assert payload["columns_created"] == 3
    table_id = payload["table_id"]
    detail = await client.get(f"/api/v1/tables/{table_id}", headers=_auth(token))
    rows = await client.get(f"/api/v1/tables/{table_id}/rows", headers=_auth(token))
    assert detail.json()["name"] == "Imported Companies"
    assert detail.json()["row_count"] == 3
    assert rows.json()["total"] == 3
    column_id = detail.json()["columns"][0]["id"]
    assert rows.json()["items"][0]["data"][column_id] == "Acme"


@pytest.mark.asyncio
async def test_import_into_existing_table_appends(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"exist-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    table = await _create_table(client, token, workspace_id)
    company = await client.post(
        f"/api/v1/tables/{table['id']}/columns",
        headers=_auth(token),
        json={"name": "Company Name", "type": "text"},
    )
    seed = await client.post(
        f"/api/v1/tables/{table['id']}/rows",
        headers=_auth(token),
        json={"data": {company.json()["id"]: "Existing Co"}},
    )
    assert seed.status_code == 201
    data = csv_bytes("companies.csv")
    preview = await _preview(
        client, f"/api/v1/tables/{table['id']}/imports/csv/preview", token, data, "companies.csv"
    )
    body = preview.json()
    mapping = {
        "columns": [
            {"csv_index": 0, "action": "existing", "column_id": company.json()["id"]},
            {"csv_index": 1, "action": "create", "name": "Employees", "type": "number"},
            {"csv_index": 2, "action": "skip"},
        ]
    }
    imported = await client.post(
        f"/api/v1/tables/{table['id']}/imports/csv",
        headers=_auth(token),
        files={"file": ("companies.csv", data, "text/csv")},
        data={
            "mapping_json": json.dumps(mapping),
            "options_json": json.dumps({"file_signature": body["file_signature"]}),
        },
    )
    assert imported.status_code == 200, imported.text
    rows = await client.get(f"/api/v1/tables/{table['id']}/rows", headers=_auth(token))
    assert rows.json()["total"] == 4
    values = [item["data"].get(company.json()["id"]) for item in rows.json()["items"]]
    assert values[0] == "Existing Co"
    assert "Acme" in values


@pytest.mark.asyncio
async def test_invalid_import_is_atomic(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"atomic-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    lines = ["Company,Employees"]
    for index in range(1, 101):
        value = "hello" if index == 97 else str(index)
        lines.append(f"Co{index},{value}")
    data = ("\n".join(lines) + "\n").encode("utf-8")
    preview = await _preview(
        client, f"/api/v1/workspaces/{workspace_id}/imports/csv/preview", token, data, "many.csv"
    )
    body = preview.json()
    before = await client.get(f"/api/v1/workspaces/{workspace_id}/tables", headers=_auth(token))
    imported = await client.post(
        f"/api/v1/workspaces/{workspace_id}/imports/csv",
        headers=_auth(token),
        files={"file": ("many.csv", data, "text/csv")},
        data={
            "mapping_json": _mapping_create(body["headers"], {1: {"type": "number", "name": "Employees", "action": "create"}}),
            "options_json": json.dumps({"file_signature": body["file_signature"], "table_name": "Should Not Exist"}),
        },
    )
    assert imported.status_code == 400
    assert imported.json()["error"]["code"] == "CSV_VALIDATION_FAILED"
    items = imported.json()["error"]["details"]["items"]
    assert items[0]["row"] == 98
    assert items[0]["column"] == "Employees"
    after = await client.get(f"/api/v1/workspaces/{workspace_id}/tables", headers=_auth(token))
    assert after.json()["items"] == before.json()["items"]
    async with SessionLocal() as session:
        tables = (await session.execute(text("SELECT count(*) FROM tables"))).scalar_one()
        columns = (await session.execute(text("SELECT count(*) FROM table_columns"))).scalar_one()
        rows = (await session.execute(text("SELECT count(*) FROM table_rows"))).scalar_one()
    assert tables == 0
    assert columns == 0
    assert rows == 0


@pytest.mark.asyncio
async def test_existing_table_invalid_does_not_add_columns(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"exist-fail-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    table = await _create_table(client, token, workspace_id, "Keep")
    data = csv_bytes("invalid_number.csv")
    preview = await _preview(client, f"/api/v1/tables/{table['id']}/imports/csv/preview", token, data, "invalid.csv")
    body = preview.json()
    imported = await client.post(
        f"/api/v1/tables/{table['id']}/imports/csv",
        headers=_auth(token),
        files={"file": ("invalid.csv", data, "text/csv")},
        data={
            "mapping_json": _mapping_create(body["headers"], {1: {"type": "number"}}),
            "options_json": json.dumps({"file_signature": body["file_signature"]}),
        },
    )
    assert imported.status_code == 400
    detail = await client.get(f"/api/v1/tables/{table['id']}", headers=_auth(token))
    assert detail.json()["row_count"] == 0
    assert detail.json()["column_count"] == 0


@pytest.mark.asyncio
async def test_mapping_errors(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"map-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    data = csv_bytes("companies.csv")
    preview = await _preview(
        client, f"/api/v1/workspaces/{workspace_id}/imports/csv/preview", token, data, "companies.csv"
    )
    sig = preview.json()["file_signature"]
    missing = await client.post(
        f"/api/v1/workspaces/{workspace_id}/imports/csv",
        headers=_auth(token),
        files={"file": ("companies.csv", data, "text/csv")},
        data={"mapping_json": json.dumps({"columns": [{"csv_index": 0, "action": "skip"}]}), "options_json": json.dumps({"file_signature": sig})},
    )
    assert missing.status_code == 400
    assert missing.json()["error"]["code"] == "CSV_MAPPING_INVALID"
    duplicate = await client.post(
        f"/api/v1/workspaces/{workspace_id}/imports/csv",
        headers=_auth(token),
        files={"file": ("companies.csv", data, "text/csv")},
        data={
            "mapping_json": json.dumps(
                {
                    "columns": [
                        {"csv_index": 0, "action": "skip"},
                        {"csv_index": 0, "action": "skip"},
                        {"csv_index": 1, "action": "skip"},
                    ]
                }
            ),
            "options_json": json.dumps({"file_signature": sig}),
        },
    )
    assert duplicate.json()["error"]["code"] == "CSV_MAPPING_INVALID"
    bad_uuid = await client.post(
        f"/api/v1/workspaces/{workspace_id}/imports/csv",
        headers=_auth(token),
        files={"file": ("companies.csv", data, "text/csv")},
        data={
            "mapping_json": json.dumps(
                {
                    "columns": [
                        {"csv_index": 0, "action": "existing", "column_id": str(uuid.uuid4())},
                        {"csv_index": 1, "action": "skip"},
                        {"csv_index": 2, "action": "skip"},
                    ]
                }
            ),
            "options_json": json.dumps({"file_signature": sig}),
        },
    )
    assert bad_uuid.json()["error"]["code"] == "CSV_MAPPING_INVALID"
    changed = await client.post(
        f"/api/v1/workspaces/{workspace_id}/imports/csv",
        headers=_auth(token),
        files={"file": ("companies.csv", data, "text/csv")},
        data={
            "mapping_json": _mapping_create(preview.json()["headers"]),
            "options_json": json.dumps({"file_signature": "0" * 64}),
        },
    )
    assert changed.json()["error"]["code"] == "CSV_FILE_CHANGED"


@pytest.mark.asyncio
async def test_limits_and_empty(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"lim-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    settings = get_settings()
    original_size = settings.csv_max_file_size_mb
    original_rows = settings.csv_max_rows
    try:
        settings.csv_max_file_size_mb = 0
        huge = await _preview(
            client, f"/api/v1/workspaces/{workspace_id}/imports/csv/preview", token, b"A,B\n1,2\n", "x.csv"
        )
        assert huge.status_code == 400
        assert huge.json()["error"]["code"] == "CSV_FILE_TOO_LARGE"
        settings.csv_max_file_size_mb = original_size
        settings.csv_max_rows = 2
        many = await _preview(
            client,
            f"/api/v1/workspaces/{workspace_id}/imports/csv/preview",
            token,
            b"A,B\n1,2\n3,4\n5,6\n",
            "x.csv",
        )
        assert many.json()["error"]["code"] == "CSV_TOO_MANY_ROWS"
    finally:
        settings.csv_max_file_size_mb = original_size
        settings.csv_max_rows = original_rows
    empty = await _preview(client, f"/api/v1/workspaces/{workspace_id}/imports/csv/preview", token, b"  ", "empty.csv")
    assert empty.json()["error"]["code"] == "CSV_EMPTY"


@pytest.mark.asyncio
async def test_authorization_csv(client: AsyncClient, clean_tables) -> None:
    owner = await _login(client, f"own-{uuid.uuid4().hex}@example.com", "Owner")
    other = await _login(client, f"oth-{uuid.uuid4().hex}@example.com", "Other")
    viewer = await _login(client, f"view-{uuid.uuid4().hex}@example.com", "Viewer")
    ws = await _workspace_id(client, owner["access_token"])
    other_ws = await _workspace_id(client, other["access_token"])
    data = csv_bytes("companies.csv")
    table_preview = await _preview(
        client, f"/api/v1/workspaces/{ws}/imports/csv/preview", owner["access_token"], data, "companies.csv"
    )
    imported = await client.post(
        f"/api/v1/workspaces/{ws}/imports/csv",
        headers=_auth(owner["access_token"]),
        files={"file": ("companies.csv", data, "text/csv")},
        data={
            "mapping_json": _mapping_create(table_preview.json()["headers"]),
            "options_json": json.dumps(
                {"file_signature": table_preview.json()["file_signature"], "table_name": "Secret"}
            ),
        },
    )
    table_id = imported.json()["table_id"]
    stolen_preview = await _preview(
        client, f"/api/v1/tables/{table_id}/imports/csv/preview", other["access_token"], data, "companies.csv"
    )
    assert stolen_preview.status_code == 404
    stolen_export = await client.get(f"/api/v1/tables/{table_id}/export.csv", headers=_auth(other["access_token"]))
    assert stolen_export.status_code == 404
    stolen_create = await _preview(
        client, f"/api/v1/workspaces/{ws}/imports/csv/preview", other["access_token"], data, "companies.csv"
    )
    assert stolen_create.status_code == 404
    async with SessionLocal() as session:
        session.add(
            WorkspaceMember(
                workspace_id=uuid.UUID(ws),
                user_id=uuid.UUID(viewer["user"]["id"]),
                role=WorkspaceRole.viewer,
            )
        )
        await session.commit()
    viewer_import = await client.post(
        f"/api/v1/workspaces/{ws}/imports/csv",
        headers=_auth(viewer["access_token"]),
        files={"file": ("companies.csv", data, "text/csv")},
        data={
            "mapping_json": _mapping_create(table_preview.json()["headers"]),
            "options_json": json.dumps({"file_signature": table_preview.json()["file_signature"]}),
        },
    )
    assert viewer_import.status_code == 403
    viewer_export = await client.get(f"/api/v1/tables/{table_id}/export.csv", headers=_auth(viewer["access_token"]))
    assert viewer_export.status_code == 200
    del other_ws


@pytest.mark.asyncio
async def test_export_csv(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"exp-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    data = csv_bytes("companies.csv")
    preview = await _preview(
        client, f"/api/v1/workspaces/{workspace_id}/imports/csv/preview", token, data, "companies.csv"
    )
    imported = await client.post(
        f"/api/v1/workspaces/{workspace_id}/imports/csv",
        headers=_auth(token),
        files={"file": ("companies.csv", data, "text/csv")},
        data={
            "mapping_json": _mapping_create(preview.json()["headers"]),
            "options_json": json.dumps(
                {"file_signature": preview.json()["file_signature"], "table_name": "Russian SaaS"}
            ),
        },
    )
    table_id = imported.json()["table_id"]
    exported = await client.get(f"/api/v1/tables/{table_id}/export.csv", headers=_auth(token))
    assert exported.status_code == 200
    assert exported.content.startswith(b"\xef\xbb\xbf")
    text_body = exported.content.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text_body)))
    assert rows[0] == ["Company", "Employees", "Active"]
    assert rows[1] == ["Acme", "250", "true"]
    assert "filename=" in exported.headers["content-disposition"]
    semicolon = await client.get(
        f"/api/v1/tables/{table_id}/export.csv?delimiter=semicolon&bom=false",
        headers=_auth(token),
    )
    assert not semicolon.content.startswith(b"\xef\xbb\xbf")
    assert ";" in semicolon.content.decode()


@pytest.mark.asyncio
async def test_export_injection_and_empty(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"inj-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    data = csv_bytes("injection.csv")
    preview = await _preview(
        client, f"/api/v1/workspaces/{workspace_id}/imports/csv/preview", token, data, "injection.csv"
    )
    imported = await client.post(
        f"/api/v1/workspaces/{workspace_id}/imports/csv",
        headers=_auth(token),
        files={"file": ("injection.csv", data, "text/csv")},
        data={
            "mapping_json": _mapping_create(preview.json()["headers"]),
            "options_json": json.dumps({"file_signature": preview.json()["file_signature"], "table_name": "Inject"}),
        },
    )
    table_id = imported.json()["table_id"]
    safe = await client.get(
        f"/api/v1/tables/{table_id}/export.csv?safe_for_spreadsheets=true&bom=false",
        headers=_auth(token),
    )
    body = safe.content.decode()
    assert "'=1+1" in body
    assert "'+cmd" in body
    empty_table = await _create_table(client, token, workspace_id, "Empty")
    col = await client.post(
        f"/api/v1/tables/{empty_table['id']}/columns",
        headers=_auth(token),
        json={"name": "Name", "type": "text"},
    )
    assert col.status_code == 201
    empty_export = await client.get(
        f"/api/v1/tables/{empty_table['id']}/export.csv?bom=false",
        headers=_auth(token),
    )
    assert empty_export.content.decode().strip() == "Name"
    no_cols = await _create_table(client, token, workspace_id, "NoCols")
    bare = await client.get(f"/api/v1/tables/{no_cols['id']}/export.csv?bom=false", headers=_auth(token))
    assert bare.status_code == 200
    assert bare.content.decode() in {"\n", ""}


@pytest.mark.asyncio
async def test_russian_roundtrip(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"ru-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    data = csv_bytes("russian_semicolon.csv")
    preview = await _preview(
        client,
        f"/api/v1/workspaces/{workspace_id}/imports/csv/preview",
        token,
        data,
        "russian_semicolon.csv",
        delimiter="semicolon",
    )
    assert preview.status_code == 200, preview.text
    imported = await client.post(
        f"/api/v1/workspaces/{workspace_id}/imports/csv",
        headers=_auth(token),
        files={"file": ("russian_semicolon.csv", data, "text/csv")},
        data={
            "delimiter": "semicolon",
            "mapping_json": _mapping_create(preview.json()["headers"]),
            "options_json": json.dumps(
                {
                    "file_signature": preview.json()["file_signature"],
                    "table_name": "Russian SaaS",
                    "delimiter": "semicolon",
                }
            ),
        },
    )
    assert imported.status_code == 200, imported.text
    exported = await client.get(
        f"/api/v1/tables/{imported.json()['table_id']}/export.csv?delimiter=semicolon&bom=true",
        headers=_auth(token),
    )
    text_body = exported.content.decode("utf-8-sig")
    assert "Селектел" in text_body
    assert "Яндекс" in text_body


@pytest.mark.asyncio
async def test_import_5000_rows_chunked(client: AsyncClient, clean_tables) -> None:
    login = await _login(client, f"perf-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    lines = ["Company,Employees"]
    lines.extend(f"Co{index},{index}" for index in range(5000))
    data = ("\n".join(lines) + "\n").encode("utf-8")
    preview = await _preview(client, f"/api/v1/workspaces/{workspace_id}/imports/csv/preview", token, data, "fivek.csv")
    started = time.perf_counter()
    imported = await client.post(
        f"/api/v1/workspaces/{workspace_id}/imports/csv",
        headers=_auth(token),
        files={"file": ("fivek.csv", data, "text/csv")},
        data={
            "mapping_json": _mapping_create(preview.json()["headers"], {1: {"type": "number"}}),
            "options_json": json.dumps({"file_signature": preview.json()["file_signature"], "table_name": "Five K"}),
        },
    )
    duration = time.perf_counter() - started
    assert imported.status_code == 200, imported.text
    assert imported.json()["rows_imported"] == 5000
    page = await client.get(f"/api/v1/tables/{imported.json()['table_id']}/rows?limit=200", headers=_auth(token))
    assert page.json()["total"] == 5000
    assert len(page.json()["items"]) == 200
    exported = await client.get(f"/api/v1/tables/{imported.json()['table_id']}/export.csv?bom=false", headers=_auth(token))
    assert exported.content.decode().count("\n") >= 5001
    print(f"csv_import_5000_duration_s={duration:.3f}")
