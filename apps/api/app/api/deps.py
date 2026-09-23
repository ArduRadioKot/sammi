import uuid
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import parse_access_token
from app.db.session import get_db
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.repositories.user import UserRepository
from app.services.workspace import WorkspaceService


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("UNAUTHORIZED", "Authentication required", status_code=401)
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise AppError("UNAUTHORIZED", "Authentication required", status_code=401)
    user_id = parse_access_token(token)
    user = await UserRepository(session).get_by_id(user_id)
    if user is None:
        raise AppError("UNAUTHORIZED", "Authentication required", status_code=401)
    if not user.is_active:
        raise AppError("USER_INACTIVE", "User is inactive", status_code=403)
    return user


async def get_current_workspace_member(
    workspace_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> tuple[Workspace, WorkspaceMember]:
    try:
        parsed = uuid.UUID(workspace_id)
    except ValueError as exc:
        raise AppError("WORKSPACE_NOT_FOUND", "Workspace not found", status_code=404) from exc
    return await WorkspaceService(session).get_workspace_for_user(parsed, user.id)
