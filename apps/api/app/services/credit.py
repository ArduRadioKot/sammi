from dataclasses import dataclass
import uuid
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.models.credit import (
    ADJUSTMENT,
    CHARGE,
    GRANT,
    REFUND,
    RELEASE,
    RESERVE,
    CreditAccount,
    CreditTransaction,
)
from app.models.user import User, utc_now
from app.repositories.credit import CreditAccountRepository, CreditTransactionRepository
from app.services.workspace import WorkspaceService

logger = get_logger("app.credits")

INITIAL_GRANT_KEY = "credits:initial:{workspace_id}"


@dataclass
class CreditBalance:
    account_id: uuid.UUID
    workspace_id: uuid.UUID
    available: int
    reserved: int
    replayed: bool = False
    transaction: CreditTransaction | None = None

    @property
    def total(self) -> int:
        return self.available + self.reserved


class CreditService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.accounts = CreditAccountRepository(session)
        self.transactions = CreditTransactionRepository(session)
        self.workspaces = WorkspaceService(session)
        self.settings = get_settings()

    async def get_balance_for_user(self, workspace_id: uuid.UUID, user: User) -> CreditBalance:
        await self.workspaces.get_workspace_for_user(workspace_id, user.id)
        account = await self.get_or_create_account(workspace_id, created_by=user.id)
        return _balance(account)

    async def list_transactions_for_user(
        self,
        workspace_id: uuid.UUID,
        user: User,
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[CreditTransaction], int, CreditBalance]:
        await self.workspaces.get_workspace_for_user(workspace_id, user.id)
        account = await self.get_or_create_account(workspace_id, created_by=user.id)
        safe_limit = min(max(limit, 1), 200)
        safe_offset = max(offset, 0)
        items, total = await self.transactions.list_for_workspace(workspace_id, limit=safe_limit, offset=safe_offset)
        return items, total, _balance(account)

    async def get_or_create_account(
        self,
        workspace_id: uuid.UUID,
        *,
        created_by: uuid.UUID | None = None,
    ) -> CreditAccount:
        existing = await self.accounts.get_by_workspace(workspace_id)
        if existing is not None:
            return existing
        try:
            async with self.session.begin_nested():
                account = await self.accounts.create(workspace_id)
                grant_amount = int(self.settings.credits_initial_grant)
                if grant_amount > 0:
                    await self._apply(
                        account,
                        GRANT,
                        grant_amount,
                        available_delta=grant_amount,
                        reserved_delta=0,
                        idempotency_key=INITIAL_GRANT_KEY.format(workspace_id=workspace_id),
                        description="Initial beta grant",
                        created_by_user_id=created_by,
                    )
                return account
        except IntegrityError:
            account = await self.accounts.get_by_workspace(workspace_id, for_update=True)
            if account is None:
                raise AppError("CREDIT_ACCOUNT_NOT_FOUND", "Credit account not found", status_code=404) from None
            return account

    async def grant(
        self,
        workspace_id: uuid.UUID,
        amount: int,
        *,
        user: User | None = None,
        idempotency_key: str | None = None,
        description: str | None = None,
        reference_type: str | None = None,
        reference_id: str | None = None,
    ) -> CreditBalance:
        account = await self._lock_account(workspace_id, created_by=user.id if user else None)
        return await self._mutate(
            account,
            GRANT,
            amount,
            available_delta=amount,
            reserved_delta=0,
            user=user,
            idempotency_key=idempotency_key,
            description=description,
            reference_type=reference_type,
            reference_id=reference_id,
        )

    async def reserve(
        self,
        workspace_id: uuid.UUID,
        amount: int,
        *,
        user: User | None = None,
        idempotency_key: str | None = None,
        description: str | None = None,
        reference_type: str | None = None,
        reference_id: str | None = None,
    ) -> CreditBalance:
        account = await self._lock_account(workspace_id, created_by=user.id if user else None)
        replay = await self._replay(account, idempotency_key)
        if replay is not None:
            return replay
        if amount > account.available_credits:
            raise AppError(
                "INSUFFICIENT_CREDITS",
                "Not enough available credits",
                status_code=409,
                details={"needed": amount, "available": int(account.available_credits)},
            )
        return await self._mutate(
            account,
            RESERVE,
            amount,
            available_delta=-amount,
            reserved_delta=amount,
            user=user,
            idempotency_key=idempotency_key,
            description=description,
            reference_type=reference_type,
            reference_id=reference_id,
        )

    async def charge(
        self,
        workspace_id: uuid.UUID,
        amount: int,
        *,
        user: User | None = None,
        idempotency_key: str | None = None,
        description: str | None = None,
        reference_type: str | None = None,
        reference_id: str | None = None,
    ) -> CreditBalance:
        account = await self._lock_account(workspace_id, created_by=user.id if user else None)
        replay = await self._replay(account, idempotency_key)
        if replay is not None:
            return replay
        if amount > account.reserved_credits:
            raise AppError("INSUFFICIENT_RESERVED_CREDITS", "Not enough reserved credits", status_code=409)
        return await self._mutate(
            account,
            CHARGE,
            amount,
            available_delta=0,
            reserved_delta=-amount,
            user=user,
            idempotency_key=idempotency_key,
            description=description,
            reference_type=reference_type,
            reference_id=reference_id,
        )

    async def release(
        self,
        workspace_id: uuid.UUID,
        amount: int,
        *,
        user: User | None = None,
        idempotency_key: str | None = None,
        description: str | None = None,
        reference_type: str | None = None,
        reference_id: str | None = None,
    ) -> CreditBalance:
        account = await self._lock_account(workspace_id, created_by=user.id if user else None)
        replay = await self._replay(account, idempotency_key)
        if replay is not None:
            return replay
        if amount > account.reserved_credits:
            raise AppError("INSUFFICIENT_RESERVED_CREDITS", "Not enough reserved credits", status_code=409)
        return await self._mutate(
            account,
            RELEASE,
            amount,
            available_delta=amount,
            reserved_delta=-amount,
            user=user,
            idempotency_key=idempotency_key,
            description=description,
            reference_type=reference_type,
            reference_id=reference_id,
        )

    async def refund(
        self,
        workspace_id: uuid.UUID,
        amount: int,
        *,
        user: User | None = None,
        idempotency_key: str | None = None,
        description: str | None = None,
        reference_type: str | None = None,
        reference_id: str | None = None,
    ) -> CreditBalance:
        account = await self._lock_account(workspace_id, created_by=user.id if user else None)
        return await self._mutate(
            account,
            REFUND,
            amount,
            available_delta=amount,
            reserved_delta=0,
            user=user,
            idempotency_key=idempotency_key,
            description=description,
            reference_type=reference_type,
            reference_id=reference_id,
        )

    async def adjust(
        self,
        workspace_id: uuid.UUID,
        *,
        available_delta: int,
        reserved_delta: int = 0,
        user: User | None = None,
        idempotency_key: str | None = None,
        description: str | None = None,
    ) -> CreditBalance:
        account = await self._lock_account(workspace_id, created_by=user.id if user else None)
        replay = await self._replay(account, idempotency_key)
        if replay is not None:
            return replay
        if available_delta == 0 and reserved_delta == 0:
            raise AppError("INVALID_CREDIT_AMOUNT", "Adjustment requires a non-zero delta", status_code=400)
        next_available = account.available_credits + available_delta
        next_reserved = account.reserved_credits + reserved_delta
        if next_available < 0 or next_reserved < 0:
            raise AppError("INVALID_CREDIT_AMOUNT", "Adjustment would make balances negative", status_code=400)
        amount = abs(available_delta) if available_delta else abs(reserved_delta)
        return await self._mutate(
            account,
            ADJUSTMENT,
            amount,
            available_delta=available_delta,
            reserved_delta=reserved_delta,
            user=user,
            idempotency_key=idempotency_key,
            description=description,
        )

    async def _lock_account(self, workspace_id: uuid.UUID, *, created_by: uuid.UUID | None) -> CreditAccount:
        await self.get_or_create_account(workspace_id, created_by=created_by)
        account = await self.accounts.get_by_workspace(workspace_id, for_update=True)
        if account is None:
            raise AppError("CREDIT_ACCOUNT_NOT_FOUND", "Credit account not found", status_code=404)
        return account

    async def _replay(self, account: CreditAccount, idempotency_key: str | None) -> CreditBalance | None:
        if not idempotency_key:
            return None
        existing = await self.transactions.get_by_idempotency(account.id, idempotency_key)
        if existing is None:
            return None
        return _balance(account, transaction=existing, replayed=True)

    async def _mutate(
        self,
        account: CreditAccount,
        type: str,
        amount: int,
        *,
        available_delta: int,
        reserved_delta: int,
        user: User | None,
        idempotency_key: str | None,
        description: str | None,
        reference_type: str | None = None,
        reference_id: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> CreditBalance:
        replay = await self._replay(account, idempotency_key)
        if replay is not None:
            return replay
        return await self._apply(
            account,
            type,
            amount,
            available_delta=available_delta,
            reserved_delta=reserved_delta,
            user=user,
            idempotency_key=idempotency_key,
            description=description,
            reference_type=reference_type,
            reference_id=reference_id,
            extra=extra,
        )

    async def _apply(
        self,
        account: CreditAccount,
        type: str,
        amount: int,
        *,
        available_delta: int,
        reserved_delta: int,
        user: User | None = None,
        created_by_user_id: uuid.UUID | None = None,
        idempotency_key: str | None = None,
        description: str | None = None,
        reference_type: str | None = None,
        reference_id: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> CreditBalance:
        if type != ADJUSTMENT and amount <= 0:
            raise AppError("INVALID_CREDIT_AMOUNT", "Amount must be a positive integer", status_code=400)
        next_available = account.available_credits + available_delta
        next_reserved = account.reserved_credits + reserved_delta
        if next_available < 0 or next_reserved < 0:
            raise AppError("CREDIT_OPERATION_CONFLICT", "Credit balances cannot be negative", status_code=409)
        try:
            async with self.session.begin_nested():
                account.available_credits = next_available
                account.reserved_credits = next_reserved
                account.updated_at = utc_now()
                entry = await self.transactions.create(
                    account=account,
                    type=type,
                    amount=amount,
                    available_delta=available_delta,
                    reserved_delta=reserved_delta,
                    reference_type=reference_type,
                    reference_id=reference_id,
                    idempotency_key=idempotency_key,
                    description=description,
                    extra=extra or {},
                    created_by_user_id=created_by_user_id or (user.id if user else None),
                )
        except IntegrityError as exc:
            await self.session.refresh(account)
            if idempotency_key:
                existing = await self.transactions.get_by_idempotency(account.id, idempotency_key)
                if existing is not None:
                    return _balance(account, transaction=existing, replayed=True)
            raise AppError("CREDIT_IDEMPOTENCY_CONFLICT", "Credit operation already applied", status_code=409) from exc
        logger.info(
            "credit op=%s workspace_id=%s amount=%s available=%s reserved=%s",
            type,
            account.workspace_id,
            amount,
            account.available_credits,
            account.reserved_credits,
        )
        await self.session.flush()
        return _balance(account, transaction=entry)


def _balance(account: CreditAccount, transaction: CreditTransaction | None = None, replayed: bool = False) -> CreditBalance:
    return CreditBalance(
        account_id=account.id,
        workspace_id=account.workspace_id,
        available=int(account.available_credits),
        reserved=int(account.reserved_credits),
        replayed=replayed,
        transaction=transaction,
    )
