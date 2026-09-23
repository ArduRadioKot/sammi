import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.session import get_db
from app.models.user import User
from app.models.workspace import WorkspaceRole
from app.schemas.credit import (
    CreditBalanceResponse,
    CreditGrantRequest,
    CreditTransactionListResponse,
    CreditTransactionRead,
)
from app.services.credit import CreditService
from app.services.workspace import WorkspaceService

router = APIRouter(prefix="/workspaces", tags=["credits"])
dev_router = APIRouter(prefix="/dev/workspaces", tags=["dev"])

ADMIN_ROLES = {WorkspaceRole.owner, WorkspaceRole.admin}


@router.get("/{workspace_id}/credits", response_model=CreditBalanceResponse)
async def get_workspace_credits(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CreditBalanceResponse:
    balance = await CreditService(session).get_balance_for_user(workspace_id, user)
    return CreditBalanceResponse(available=balance.available, reserved=balance.reserved, total=balance.total)


@router.get("/{workspace_id}/credits/transactions", response_model=CreditTransactionListResponse)
async def list_workspace_credit_transactions(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> CreditTransactionListResponse:
    items, total, _balance = await CreditService(session).list_transactions_for_user(
        workspace_id,
        user,
        limit=limit,
        offset=offset,
    )
    return CreditTransactionListResponse(
        items=[CreditTransactionRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@dev_router.post("/{workspace_id}/credits/grant", response_model=CreditBalanceResponse)
async def grant_workspace_credits_dev(
    workspace_id: uuid.UUID,
    payload: CreditGrantRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CreditBalanceResponse:
    if get_settings().app_env != "development":
        raise AppError("NOT_FOUND", "Not found", status_code=404)
    _, member = await WorkspaceService(session).get_workspace_for_user(workspace_id, user.id)
    if member.role not in ADMIN_ROLES:
        raise AppError("CREDIT_OPERATION_CONFLICT", "Only owner or admin can grant development credits", status_code=403)
    balance = await CreditService(session).grant(
        workspace_id,
        payload.amount,
        user=user,
        description=payload.description or "Development grant",
    )
    return CreditBalanceResponse(available=balance.available, reserved=balance.reserved, total=balance.total)
