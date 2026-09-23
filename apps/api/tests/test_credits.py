import asyncio
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text

from app.core.errors import AppError
from app.db.session import SessionLocal
from app.models.credit import GRANT
from app.models.workspace import WorkspaceMember, WorkspaceRole
from app.services.credit import CreditService
from tests.db_guard import assert_safe_to_destroy_data


@pytest.fixture
async def clean_credits():
    yield
    assert_safe_to_destroy_data()
    async with SessionLocal() as session:
        await session.execute(
            text("TRUNCATE credit_transactions, credit_accounts, workspace_members, workspaces, users CASCADE")
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


@pytest.mark.asyncio
async def test_credits_require_auth(client: AsyncClient, clean_credits) -> None:
    workspace_id = uuid.uuid4()
    denied = await client.get(f"/api/v1/workspaces/{workspace_id}/credits")
    assert denied.status_code == 401
    assert denied.json()["error"]["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_credits_balance_lazy_init_and_idempotent_grant(client: AsyncClient, clean_credits) -> None:
    login = await _login(client, f"credits-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)

    first = await client.get(f"/api/v1/workspaces/{workspace_id}/credits", headers=_auth(token))
    assert first.status_code == 200, first.text
    assert first.json() == {"available": 1000, "reserved": 0, "total": 1000}

    second = await client.get(f"/api/v1/workspaces/{workspace_id}/credits", headers=_auth(token))
    assert second.status_code == 200
    assert second.json() == first.json()

    history = await client.get(
        f"/api/v1/workspaces/{workspace_id}/credits/transactions",
        headers=_auth(token),
    )
    assert history.status_code == 200
    body = history.json()
    assert body["total"] == 1
    assert body["limit"] == 50
    assert body["offset"] == 0
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["type"] == GRANT
    assert item["amount"] == 1000
    assert item["available_after"] == 1000
    assert item["reserved_after"] == 0
    assert item["description"] == "Initial beta grant"
    assert "metadata" not in item
    assert "idempotency_key" not in item

    async with SessionLocal() as session:
        accounts = (await session.execute(text("SELECT available_credits, reserved_credits FROM credit_accounts"))).all()
        grants = (await session.execute(text("SELECT count(*) FROM credit_transactions WHERE type = 'grant'"))).scalar_one()
    assert accounts == [(1000, 0)]
    assert grants == 1


@pytest.mark.asyncio
async def test_credits_workspace_isolation(client: AsyncClient, clean_credits) -> None:
    token_a = (await _login(client, f"a-{uuid.uuid4().hex}@example.com"))["access_token"]
    token_b = (await _login(client, f"b-{uuid.uuid4().hex}@example.com"))["access_token"]
    workspace_b = await _workspace_id(client, token_b)
    denied = await client.get(f"/api/v1/workspaces/{workspace_b}/credits", headers=_auth(token_a))
    assert denied.status_code == 404
    assert denied.json()["error"]["code"] == "WORKSPACE_NOT_FOUND"


@pytest.mark.asyncio
async def test_credits_transactions_pagination(client: AsyncClient, clean_credits) -> None:
    login = await _login(client, f"page-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    uuid_workspace = uuid.UUID(workspace_id)

    async with SessionLocal() as session:
        service = CreditService(session)
        await service.get_or_create_account(uuid_workspace, created_by=uuid.UUID(login["user"]["id"]))
        for index in range(3):
            await service.grant(uuid_workspace, 10, description=f"extra-{index}")
        await session.commit()

    page = await client.get(
        f"/api/v1/workspaces/{workspace_id}/credits/transactions?limit=2&offset=0",
        headers=_auth(token),
    )
    assert page.status_code == 200
    body = page.json()
    assert body["total"] == 4
    assert body["limit"] == 2
    assert len(body["items"]) == 2

    next_page = await client.get(
        f"/api/v1/workspaces/{workspace_id}/credits/transactions?limit=2&offset=2",
        headers=_auth(token),
    )
    assert next_page.json()["total"] == 4
    assert len(next_page.json()["items"]) == 2
    ids = {item["id"] for item in body["items"]} | {item["id"] for item in next_page.json()["items"]}
    assert len(ids) == 4


@pytest.mark.asyncio
async def test_public_credit_mutations_are_absent(client: AsyncClient, clean_credits) -> None:
    login = await _login(client, f"mut-{uuid.uuid4().hex}@example.com")
    token = login["access_token"]
    workspace_id = await _workspace_id(client, token)
    for path in (
        f"/api/v1/workspaces/{workspace_id}/credits/grant",
        f"/api/v1/workspaces/{workspace_id}/credits/charge",
        f"/api/v1/workspaces/{workspace_id}/credits/refund",
        f"/api/v1/dev/workspaces/{workspace_id}/credits/grant",
    ):
        response = await client.post(path, headers=_auth(token), json={"amount": 10})
        assert response.status_code in {404, 405}


@pytest.mark.asyncio
async def test_viewer_can_read_credits(client: AsyncClient, clean_credits) -> None:
    owner = await _login(client, f"owner-{uuid.uuid4().hex}@example.com")
    viewer = await _login(client, f"viewer-{uuid.uuid4().hex}@example.com")
    workspace_id = await _workspace_id(client, owner["access_token"])
    async with SessionLocal() as session:
        session.add(
            WorkspaceMember(
                workspace_id=uuid.UUID(workspace_id),
                user_id=uuid.UUID(viewer["user"]["id"]),
                role=WorkspaceRole.viewer,
            )
        )
        await session.commit()
    response = await client.get(
        f"/api/v1/workspaces/{workspace_id}/credits",
        headers=_auth(viewer["access_token"]),
    )
    assert response.status_code == 200
    assert response.json()["available"] == 1000
