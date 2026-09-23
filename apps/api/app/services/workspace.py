import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.repositories.workspace import WorkspaceMemberRepository, WorkspaceRepository


class WorkspaceService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.workspaces = WorkspaceRepository(session)
        self.members = WorkspaceMemberRepository(session)

    async def ensure_default_workspace(self, user: User) -> tuple[Workspace, WorkspaceRole]:
        existing = await self.workspaces.list_for_user(user.id)
        if existing:
            workspace, member = existing[0]
            return workspace, member.role
        slug = f"ws-{uuid.uuid4().hex[:10]}"
        workspace = await self.workspaces.create(name="Мой workspace", slug=slug)
        member = await self.members.create(
            workspace_id=workspace.id,
            user_id=user.id,
            role=WorkspaceRole.owner,
        )
        return workspace, member.role

    async def list_user_workspaces(self, user_id: uuid.UUID) -> list[tuple[Workspace, WorkspaceMember]]:
        return await self.workspaces.list_for_user(user_id)

    async def get_workspace_for_user(self, workspace_id: uuid.UUID, user_id: uuid.UUID) -> tuple[Workspace, WorkspaceMember]:
        member = await self.members.get(workspace_id, user_id)
        if member is None:
            raise AppError("WORKSPACE_NOT_FOUND", "Workspace not found", status_code=404)
        workspace = await self.workspaces.get_by_id(workspace_id)
        if workspace is None:
            raise AppError("WORKSPACE_NOT_FOUND", "Workspace not found", status_code=404)
        return workspace, member
