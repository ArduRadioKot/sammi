import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from tests.db_guard import assert_safe_to_destroy_data


@pytest.fixture
async def clean_auth():
    yield
    assert_safe_to_destroy_data()
    async with SessionLocal() as session:
        await session.execute(text("TRUNCATE workspace_members, workspaces, users CASCADE"))
        await session.commit()


async def _login(client: AsyncClient, email: str, name: str | None = None):
    payload: dict[str, str] = {"email": email}
    if name is not None:
        payload["name"] = name
    return await client.post("/api/v1/auth/login", json=payload)


@pytest.mark.asyncio
async def test_new_login_creates_user_workspace_owner(client: AsyncClient, clean_auth) -> None:
    email = f"new-{uuid.uuid4().hex}@example.com"
    response = await _login(client, email, "Ирина")
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == email
    assert body["user"]["name"] == "Ирина"
    user_id = body["user"]["id"]

    async with SessionLocal() as session:
        user = await session.get(User, uuid.UUID(user_id))
        assert user is not None
        members = (await session.execute(text("SELECT role FROM workspace_members WHERE user_id = :id"), {"id": user.id})).all()
        workspaces = (await session.execute(text("SELECT name FROM workspaces"))).all()
    assert len(members) == 1
    assert members[0][0] == "owner"
    assert workspaces[0][0] == "Мой workspace"


@pytest.mark.asyncio
async def test_same_email_does_not_duplicate_user_or_workspace(client: AsyncClient, clean_auth) -> None:
    email = f"repeat-{uuid.uuid4().hex}@Example.COM"
    first = await _login(client, email, "One")
    second = await _login(client, email, "Two")
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["user"]["id"] == second.json()["user"]["id"]
    assert first.json()["user"]["name"] == "One"

    async with SessionLocal() as session:
        users = (await session.execute(text("SELECT count(*) FROM users"))).scalar_one()
        workspaces = (await session.execute(text("SELECT count(*) FROM workspaces"))).scalar_one()
        members = (await session.execute(text("SELECT count(*) FROM workspace_members"))).scalar_one()
    assert users == 1
    assert workspaces == 1
    assert members == 1


@pytest.mark.asyncio
async def test_auth_me_authenticated_and_unauthenticated(client: AsyncClient, clean_auth) -> None:
    missing = await client.get("/api/v1/auth/me")
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "UNAUTHORIZED"

    login = await _login(client, f"me-{uuid.uuid4().hex}@example.com")
    token = login.json()["access_token"]
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == login.json()["user"]["email"]


@pytest.mark.asyncio
async def test_invalid_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-token"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_TOKEN"


@pytest.mark.asyncio
async def test_unique_email_constraint(clean_auth) -> None:
    email = f"uniq-{uuid.uuid4().hex}@example.com"
    async with SessionLocal() as session:
        session.add(User(email=email, name="A"))
        await session.commit()
    async with SessionLocal() as session:
        session.add(User(email=email, name="B"))
        with pytest.raises(IntegrityError):
            await session.commit()


@pytest.mark.asyncio
async def test_logout_requires_auth(client: AsyncClient, clean_auth) -> None:
    denied = await client.post("/api/v1/auth/logout")
    assert denied.status_code == 401
    login = await _login(client, f"out-{uuid.uuid4().hex}@example.com")
    ok = await client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert ok.status_code == 204
