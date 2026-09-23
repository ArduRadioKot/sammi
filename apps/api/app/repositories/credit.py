import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credit import CreditAccount, CreditTransaction
from app.models.user import utc_now


class CreditAccountRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_workspace(self, workspace_id: uuid.UUID, *, for_update: bool = False) -> CreditAccount | None:
        stmt = select(CreditAccount).where(CreditAccount.workspace_id == workspace_id)
        if for_update:
            stmt = stmt.with_for_update()
        return await self.session.scalar(stmt)

    async def create(self, workspace_id: uuid.UUID) -> CreditAccount:
        account = CreditAccount(workspace_id=workspace_id, available_credits=0, reserved_credits=0)
        self.session.add(account)
        await self.session.flush()
        return account


class CreditTransactionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_idempotency(self, account_id: uuid.UUID, key: str) -> CreditTransaction | None:
        return await self.session.scalar(
            select(CreditTransaction).where(
                CreditTransaction.credit_account_id == account_id,
                CreditTransaction.idempotency_key == key,
            )
        )

    async def create(
        self,
        *,
        account: CreditAccount,
        type: str,
        amount: int,
        available_delta: int,
        reserved_delta: int,
        reference_type: str | None,
        reference_id: str | None,
        idempotency_key: str | None,
        description: str | None,
        extra: dict[str, Any],
        created_by_user_id: uuid.UUID | None,
    ) -> CreditTransaction:
        entry = CreditTransaction(
            credit_account_id=account.id,
            workspace_id=account.workspace_id,
            type=type,
            amount=amount,
            available_delta=available_delta,
            reserved_delta=reserved_delta,
            available_after=account.available_credits,
            reserved_after=account.reserved_credits,
            reference_type=reference_type,
            reference_id=str(reference_id) if reference_id is not None else None,
            idempotency_key=idempotency_key,
            description=description,
            extra=extra,
            created_by_user_id=created_by_user_id,
        )
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def list_for_workspace(
        self,
        workspace_id: uuid.UUID,
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[CreditTransaction], int]:
        total = await self.session.scalar(
            select(func.count()).select_from(CreditTransaction).where(CreditTransaction.workspace_id == workspace_id)
        )
        result = await self.session.execute(
            select(CreditTransaction)
            .where(CreditTransaction.workspace_id == workspace_id)
            .order_by(CreditTransaction.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), int(total or 0)
