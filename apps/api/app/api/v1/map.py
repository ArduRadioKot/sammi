import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.map import MapPointsResponse
from app.services.map import MapService

router = APIRouter(tags=["map"])


@router.get(
    "/tables/{table_id}/map",
    response_model=MapPointsResponse,
    summary="Map points for a table address column",
)
async def get_table_map(
    table_id: uuid.UUID,
    column_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> MapPointsResponse:
    return await MapService(session).points(table_id, user, column_id=column_id)
