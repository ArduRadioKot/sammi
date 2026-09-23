from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import create_access_token
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceRole
from app.repositories.user import UserRepository
from app.services.workspace import WorkspaceService


def normalize_email(email: str) -> str:
    return email.strip().lower()


def display_name_from_email(email: str, name: str | None) -> str:
    if name and name.strip():
        return name.strip()
    local = email.split("@", 1)[0].strip()
    return local or "Пользователь"


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.workspaces = WorkspaceService(session)

    async def login_or_create(self, email: str, name: str | None) -> tuple[User, str, Workspace, WorkspaceRole]:
        normalized = normalize_email(email)
        user = await self.users.get_by_email(normalized)
        created = False
        if user is None:
            user = await self.users.create(email=normalized, name=display_name_from_email(normalized, name))
            created = True
        if not user.is_active:
            raise AppError("USER_INACTIVE", "User is inactive", status_code=403)
        workspace, role = await self.workspaces.ensure_default_workspace(user)
        if created:
            await self.session.flush()
        return user, create_access_token(user.id), workspace, role
