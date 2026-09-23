import asyncio
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.core.errors import AppError
from app.db.session import SessionLocal
from app.models.credit import ADJUSTMENT, CHARGE, GRANT, REFUND, RELEASE, RESERVE, CreditAccount
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.services.credit import CreditService
from tests.db_guard import assert_safe_to_destroy_data


@pytest.fixture
async def clean_credits():
    yield
    assert_safe_to_destroy_data()
    async with SessionLocal() as session:
        await session.execute(
            text("TRUNCATE credit_transactions, credit_accounts, workspace_members, workspaces, users CASCADE")
        )
        await session.commit()


async def _workspace() -> uuid.UUID:
    async with SessionLocal() as session:
        user = User(email=f"cred-{uuid.uuid4().hex}@example.com", name="Credits")
        workspace = Workspace(name="Credits WS", slug=f"ws-{uuid.uuid4().hex[:10]}")
        session.add_all([user, workspace])
        await session.flush()
        session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.owner))
        await session.commit()
        return workspace.id


def _service(session, initial: int = 1000) -> CreditService:
    service = CreditService(session)
    service.settings = SimpleNamespace(credits_initial_grant=initial)
    return service


@pytest.mark.asyncio
async def test_account_initialization_single_grant(clean_credits) -> None:
    workspace_id = await _workspace()
    async with SessionLocal() as session:
        service = _service(session)
        first = await service.get_or_create_account(workspace_id)
        second = await service.get_or_create_account(workspace_id)
        await session.commit()
        assert first.id == second.id
        assert first.available_credits == 1000
        assert first.reserved_credits == 0
        rows = list((await session.execute(text("SELECT type FROM credit_transactions"))).all())
    assert rows == [(GRANT,)]


@pytest.mark.asyncio
async def test_reserve_charge_release_refund_and_ledger(clean_credits) -> None:
    workspace_id = await _workspace()
    async with SessionLocal() as session:
        service = _service(session, initial=0)
        await service.get_or_create_account(workspace_id)
        granted = await service.grant(workspace_id, 1000, description="seed")
        assert granted.available == 1000
        assert granted.reserved == 0

        reserved = await service.reserve(
            workspace_id,
            300,
            reference_type="enrichment_run",
            reference_id=str(uuid.uuid4()),
            idempotency_key="run-1-reserve",
        )
        assert reserved.available == 700
        assert reserved.reserved == 300

        charged = await service.charge(workspace_id, 200, idempotency_key="run-1-charge")
        assert charged.available == 700
        assert charged.reserved == 100

        released = await service.release(workspace_id, 100, idempotency_key="run-1-release")
        assert released.available == 800
        assert released.reserved == 0

        refunded = await service.refund(workspace_id, 50, idempotency_key="run-1-refund")
        assert refunded.available == 850
        assert refunded.reserved == 0
        await session.commit()

        account = await session.get(CreditAccount, granted.account_id)
        last = (
            await session.execute(
                text(
                    "SELECT type, available_after, reserved_after FROM credit_transactions ORDER BY created_at DESC LIMIT 1"
                )
            )
        ).one()
        assert account is not None
        assert last[0] == REFUND
        assert last[1] == account.available_credits == 850
        assert last[2] == account.reserved_credits == 0
        types = [row[0] for row in (await session.execute(text("SELECT type FROM credit_transactions ORDER BY created_at"))).all()]
        assert types == [GRANT, RESERVE, CHARGE, RELEASE, REFUND]


@pytest.mark.asyncio
async def test_insufficient_and_negative_amount(clean_credits) -> None:
    workspace_id = await _workspace()
    async with SessionLocal() as session:
        service = _service(session, initial=100)
        await service.get_or_create_account(workspace_id)
        with pytest.raises(AppError) as reserve_error:
            await service.reserve(workspace_id, 101)
        assert reserve_error.value.code == "INSUFFICIENT_CREDITS"
        with pytest.raises(AppError) as charge_error:
            await service.charge(workspace_id, 1)
        assert charge_error.value.code == "INSUFFICIENT_RESERVED_CREDITS"
        with pytest.raises(AppError) as amount_error:
            await service.grant(workspace_id, 0)
        assert amount_error.value.code == "INVALID_CREDIT_AMOUNT"
        with pytest.raises(AppError) as negative_error:
            await service.refund(workspace_id, -5)
        assert negative_error.value.code == "INVALID_CREDIT_AMOUNT"
        await session.commit()
        account = await session.scalar(text("SELECT available_credits FROM credit_accounts"))
        assert account == 100


@pytest.mark.asyncio
async def test_idempotent_reserve_returns_existing(clean_credits) -> None:
    workspace_id = await _workspace()
    async with SessionLocal() as session:
        service = _service(session, initial=1000)
        await service.get_or_create_account(workspace_id)
        first = await service.reserve(workspace_id, 40, idempotency_key="test-run-1-reserve")
        second = await service.reserve(workspace_id, 40, idempotency_key="test-run-1-reserve")
        await session.commit()
        assert first.replayed is False
        assert second.replayed is True
        assert first.available == second.available == 960
        assert first.reserved == second.reserved == 40
        count = (await session.execute(text("SELECT count(*) FROM credit_transactions WHERE type = 'reserve'"))).scalar_one()
        assert count == 1


@pytest.mark.asyncio
async def test_adjustment_and_transaction_rollback(clean_credits) -> None:
    workspace_id = await _workspace()
    async with SessionLocal() as session:
        service = _service(session, initial=100)
        await service.get_or_create_account(workspace_id)
        await service.adjust(workspace_id, available_delta=-20, description="manual")
        await session.commit()
    async with SessionLocal() as session:
        service = _service(session, initial=100)
        try:
            await service.reserve(workspace_id, 500)
        except AppError as exc:
            assert exc.code == "INSUFFICIENT_CREDITS"
            await session.rollback()
        else:
            raise AssertionError("expected insufficient credits")
    async with SessionLocal() as session:
        account = (await session.execute(text("SELECT available_credits, reserved_credits FROM credit_accounts"))).one()
        types = [row[0] for row in (await session.execute(text("SELECT type FROM credit_transactions ORDER BY created_at"))).all()]
    assert account == (80, 0)
    assert types == [GRANT, ADJUSTMENT]


@pytest.mark.asyncio
async def test_concurrent_get_or_create_does_not_double_grant(clean_credits) -> None:
    workspace_id = await _workspace()

    async def create_once() -> uuid.UUID:
        async with SessionLocal() as session:
            service = _service(session)
            account = await service.get_or_create_account(workspace_id)
            await session.commit()
            return account.id

    first_id, second_id = await asyncio.gather(create_once(), create_once())
    assert first_id == second_id
    async with SessionLocal() as session:
        accounts = (await session.execute(text("SELECT count(*) FROM credit_accounts"))).scalar_one()
        grants = (await session.execute(text("SELECT count(*) FROM credit_transactions"))).scalar_one()
        available = (await session.execute(text("SELECT available_credits FROM credit_accounts"))).scalar_one()
    assert accounts == 1
    assert grants == 1
    assert available == 1000


@pytest.mark.asyncio
async def test_concurrent_reserve_locking(clean_credits) -> None:
    workspace_id = await _workspace()
    async with SessionLocal() as session:
        service = _service(session, initial=100)
        await service.get_or_create_account(workspace_id)
        await session.commit()

    async def reserve_once() -> str:
        async with SessionLocal() as session:
            service = _service(session, initial=100)
            try:
                await service.reserve(workspace_id, 80)
                await session.commit()
                return "ok"
            except AppError as exc:
                await session.rollback()
                return exc.code

    results = await asyncio.gather(reserve_once(), reserve_once())
    assert sorted(results) == ["INSUFFICIENT_CREDITS", "ok"]
    async with SessionLocal() as session:
        row = (await session.execute(text("SELECT available_credits, reserved_credits FROM credit_accounts"))).one()
        reserves = (await session.execute(text("SELECT count(*) FROM credit_transactions WHERE type = 'reserve'"))).scalar_one()
    assert row == (20, 80)
    assert reserves == 1
