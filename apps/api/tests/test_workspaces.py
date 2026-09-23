import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from tests.db_guard import assert_safe_to_destroy_data


@pytest.fixture
async def clean_auth():
    yield
    assert_safe_to_destroy_data()
    async with SessionLocal() as session:
        await session.execute(text("TRUNCATE workspace_members, workspaces, users CASCADE"))
        await session.commit()


async def _auth(client: AsyncClient, email: str) -> str:
    response = await client.post("/api/v1/auth/login", json={"email": email})
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_workspace_list_contains_user_workspace(client: AsyncClient, clean_auth) -> None:
    token = await _auth(client, f"ws-{uuid.uuid4().hex}@example.com")
    response = await client.get("/api/v1/workspaces", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["name"] == "Мой workspace"
    assert items[0]["role"] == "owner"

    detail = await client.get(f"/api/v1/workspaces/{items[0]['id']}", headers={"Authorization": f"Bearer {token}"})
    assert detail.status_code == 200
    assert detail.json()["id"] == items[0]["id"]


@pytest.mark.asyncio
async def test_user_cannot_access_unrelated_workspace(client: AsyncClient, clean_auth) -> None:
    token_a = await _auth(client, f"a-{uuid.uuid4().hex}@example.com")
    token_b = await _auth(client, f"b-{uuid.uuid4().hex}@example.com")
    listed = await client.get("/api/v1/workspaces", headers={"Authorization": f"Bearer {token_b}"})
    other_id = listed.json()["items"][0]["id"]
    denied = await client.get(f"/api/v1/workspaces/{other_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert denied.status_code == 404
    assert denied.json()["error"]["code"] == "WORKSPACE_NOT_FOUND"


@pytest.mark.asyncio
async def test_unique_membership_constraint(clean_auth) -> None:
    async with SessionLocal() as session:
        user = User(email=f"mem-{uuid.uuid4().hex}@example.com", name="Mem")
        workspace = Workspace(name="W", slug=f"ws-{uuid.uuid4().hex[:10]}")
        session.add_all([user, workspace])
        await session.flush()
        session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.owner))
        await session.commit()
        user_id, workspace_id = user.id, workspace.id
    async with SessionLocal() as session:
        session.add(WorkspaceMember(workspace_id=workspace_id, user_id=user_id, role=WorkspaceRole.member))
        with pytest.raises(IntegrityError):
            await session.commit()
