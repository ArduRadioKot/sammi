import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.relationship import RelationshipAnalysisRun
from app.models.table import WorkspaceTable
from app.models.user import User
from app.schemas.relationship import AnalysisMapSummary
from app.schemas.workspace import WorkspaceListResponse, WorkspaceResponse
from app.services.workspace import WorkspaceService

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("/{workspace_id}/relationship-maps", response_model=list[AnalysisMapSummary])
async def list_relationship_maps(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[AnalysisMapSummary]:
    await WorkspaceService(session).get_workspace_for_user(workspace_id, user.id)
    run = RelationshipAnalysisRun
    table = WorkspaceTable
    rows = await session.execute(
        select(table.id, table.name, run.report["company"].astext, run.status)
        .join(run, run.table_id == table.id)
        .where(table.workspace_id == workspace_id)
        .order_by(run.created_at.desc(), table.id)
    )
    return [
        AnalysisMapSummary(table_id=table_id, table_name=name, company=company or name, status=status)
        for table_id, name, company, status in rows
    ]


@router.get("", response_model=WorkspaceListResponse)
async def list_workspaces(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> WorkspaceListResponse:
    rows = await WorkspaceService(session).list_user_workspaces(user.id)
    return WorkspaceListResponse(
        items=[
            WorkspaceResponse(
                id=workspace.id,
                name=workspace.name,
                slug=workspace.slug,
                role=member.role,
                created_at=workspace.created_at,
            )
            for workspace, member in rows
        ]
    )


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> WorkspaceResponse:
    workspace, member = await WorkspaceService(session).get_workspace_for_user(workspace_id, user.id)
    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        slug=workspace.slug,
        role=member.role,
        created_at=workspace.created_at,
    )
