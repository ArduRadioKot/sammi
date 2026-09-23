import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.db.session import SessionLocal
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.providers.enrichment.registry import EnrichmentProviderRegistry
from app.providers.enrichment.types import (
    COMPANY_BY_IDENTIFIER,
    ERROR,
    NO_VALUE,
    NOT_FOUND,
    OUTPUT_FIELDS,
    SUCCESS,
    EnrichmentField,
    EnrichmentOperation,
    EnrichmentRequest,
    EnrichmentResult,
    ProviderCapabilities,
)
from app.services.credit import CreditService
from app.services.enrichment import EnrichmentService
from app.services.table import ColumnService, RowService, TableService
from tests.db_guard import assert_safe_to_destroy_data

SBER = "7707083893"


class FakeDaData:
    provider_id = "dadata"
    display_name = "DaData"
    region = "RU"

    def __init__(self, outcomes: dict[str, EnrichmentResult] | None = None, *, configured: bool = True) -> None:
        self.outcomes = outcomes or {}
        self.configured_flag = configured
        self.calls: list[EnrichmentRequest] = []

    def configured(self) -> bool:
        return self.configured_flag

    def capabilities(self) -> ProviderCapabilities:
        outputs = tuple(EnrichmentField(id=item["id"], label=item["label"]) for item in OUTPUT_FIELDS)
        return ProviderCapabilities(
            operations=(
                EnrichmentOperation(
                    id=COMPANY_BY_IDENTIFIER,
                    label="Компания по ИНН / ОГРН",
                    inputs=("inn", "ogrn"),
                    outputs=outputs,
                    credits_per_success=1,
                ),
            )
        )

    async def health_check(self) -> tuple[bool | None, str | None]:
        return (True, None) if self.configured_flag else (False, "ENRICHMENT_PROVIDER_NOT_CONFIGURED")

    async def enrich(self, request: EnrichmentRequest) -> EnrichmentResult:
        self.calls.append(request)
        query = str(request.input.get("query"))
        if query in self.outcomes:
            return self.outcomes[query]
        return EnrichmentResult(
            status=SUCCESS,
            data={request.requested_field: f"value-{query}"},
            value=f"value-{query}",
            provider=self.provider_id,
            operation=request.operation,
            source="DaData",
            metadata={"retrieved_at": "2026-09-23T00:00:00+00:00"},
        )


@pytest.fixture
async def clean_enrichment():
    yield
    assert_safe_to_destroy_data()
    async with SessionLocal() as session:
        await session.execute(
            text(
                "TRUNCATE enrichment_attempts, cell_provenance, enrichment_runs, "
                "table_rows, table_columns, tables, credit_transactions, credit_accounts, "
                "workspace_members, workspaces, users CASCADE"
            )
        )
        await session.commit()


async def _setup(session: AsyncSession, *, credits: int | None = None) -> tuple[User, uuid.UUID, uuid.UUID, uuid.UUID, list[uuid.UUID]]:
    user = User(email=f"enr-{uuid.uuid4().hex}@example.com", name="Enrich")
    workspace = Workspace(name="WS", slug=f"ws-{uuid.uuid4().hex[:10]}")
    session.add_all([user, workspace])
    await session.flush()
    session.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=WorkspaceRole.owner))
    table = await TableService(session).create(workspace.id, user, name="Companies", object_type="company", description=None)
    inn = await ColumnService(session).create(table.id, user, name="ИНН", type="text", config={})
    rows = []
    for value in ("7707083893", "", "1027700132195"):
        row = await RowService(session).create(table.id, user, {str(inn.id): value})
        rows.append(row.id)
    if credits is not None:
        credit = CreditService(session)
        account = await credit.get_or_create_account(workspace.id, created_by=user.id)
        delta = credits - int(account.available_credits)
        if delta:
            await credit.adjust(workspace.id, available_delta=delta, user=user, description="test balance")
    await session.commit()
    return user, workspace.id, table.id, inn.id, rows


def _service(session: AsyncSession, fake: FakeDaData) -> EnrichmentService:
    from app.core.config import get_settings

    return EnrichmentService(
        session,
        settings=get_settings(),
        registry=EnrichmentProviderRegistry(get_settings(), providers={"dadata": fake}),
    )


@pytest.mark.asyncio
async def test_empty_input_skips_without_provider_or_credits(clean_enrichment) -> None:
    fake = FakeDaData()
    async with SessionLocal() as session:
        user, workspace_id, table_id, inn_id, rows = await _setup(session)
        service = _service(session, fake)
        column = await service.create_column(
            table_id,
            user,
            name="Название",
            provider_id="dadata",
            operation=COMPANY_BY_IDENTIFIER,
            input_column_id=inn_id,
            output_field="company_name",
        )
        run = await service.create_run(table_id, user, column_id=column.id, row_ids=rows, idempotency_key=None)
        assert run.skipped_count == 1
        assert run.success_count == 2
        assert run.reserved_credits == 2
        assert run.charged_credits == 2
        assert len(fake.calls) == 2
        balance = await CreditService(session).get_balance_for_user(workspace_id, user)
        assert balance.reserved == 0
        assert balance.available == 998


@pytest.mark.asyncio
async def test_success_not_found_charges_and_writes(clean_enrichment) -> None:
    fake = FakeDaData(
        {
            "1": EnrichmentResult(status=SUCCESS, data={"company_name": "A"}, value="A", provider="dadata", operation=COMPANY_BY_IDENTIFIER, source="DaData"),
            "2": EnrichmentResult(status=NOT_FOUND, provider="dadata", operation=COMPANY_BY_IDENTIFIER, source="DaData"),
            "3": EnrichmentResult(status=SUCCESS, data={"company_name": "C"}, value="C", provider="dadata", operation=COMPANY_BY_IDENTIFIER, source="DaData"),
        }
    )
    async with SessionLocal() as session:
        user, workspace_id, table_id, inn_id, _rows = await _setup(session, credits=100)
        service = _service(session, fake)
        column = await service.create_column(
            table_id, user, name="Название", provider_id="dadata", operation=COMPANY_BY_IDENTIFIER,
            input_column_id=inn_id, output_field="company_name",
        )
        r1 = await RowService(session).create(table_id, user, {str(inn_id): "1"})
        r2 = await RowService(session).create(table_id, user, {str(inn_id): "2"})
        r3 = await RowService(session).create(table_id, user, {str(inn_id): "3"})
        await session.commit()
        run = await service.create_run(
            table_id, user, column_id=column.id, row_ids=[r1.id, r2.id, r3.id], idempotency_key="run-a"
        )
        assert run.success_count == 2
        assert run.not_found_count == 1
        assert run.error_count == 0
        assert run.reserved_credits == 3
        assert run.charged_credits == 2
        row2 = await RowService(session).get(table_id, r2.id, user) if hasattr(RowService, "get") else None
        from app.repositories.table import TableRowRepository

        stored = await TableRowRepository(session).get_by_id(r1.id)
        assert stored.data[str(column.id)] == "A"
        missing = await TableRowRepository(session).get_by_id(r2.id)
        assert str(column.id) not in (missing.data or {}) or missing.data.get(str(column.id)) in (None, "")
        provenance = await service.get_provenance(table_id, r1.id, column.id, user)
        assert provenance is not None
        assert provenance.provider_id == "dadata"
        none_prov = await service.get_provenance(table_id, r2.id, column.id, user)
        assert none_prov is None
        balance = await CreditService(session).get_balance_for_user(workspace_id, user)
        assert balance.available == 98
        assert balance.reserved == 0
        from app.repositories.credit import CreditTransactionRepository

        txs, _total = await CreditTransactionRepository(session).list_for_workspace(workspace_id, limit=20, offset=0)
        types = [item.type for item in txs]
        assert types.count("reserve") == 1
        assert types.count("charge") == 1
        assert types.count("release") == 1


@pytest.mark.asyncio
async def test_error_and_no_value_do_not_charge(clean_enrichment) -> None:
    fake = FakeDaData(
        {
            "x": EnrichmentResult(status=ERROR, provider="dadata", operation=COMPANY_BY_IDENTIFIER, error_code="ENRICHMENT_PROVIDER_RATE_LIMIT", error_message="rate"),
            "y": EnrichmentResult(status=NO_VALUE, data={"company_name": "Y", "revenue": None}, value=None, provider="dadata", operation=COMPANY_BY_IDENTIFIER),
        }
    )
    async with SessionLocal() as session:
        user, workspace_id, table_id, inn_id, _rows = await _setup(session, credits=10)
        service = _service(session, fake)
        column = await service.create_column(
            table_id, user, name="Выручка", provider_id="dadata", operation=COMPANY_BY_IDENTIFIER,
            input_column_id=inn_id, output_field="revenue",
        )
        r1 = await RowService(session).create(table_id, user, {str(inn_id): "x"})
        r2 = await RowService(session).create(table_id, user, {str(inn_id): "y"})
        await session.commit()
        run = await service.create_run(table_id, user, column_id=column.id, row_ids=[r1.id, r2.id], idempotency_key=None)
        assert run.charged_credits == 0
        assert run.error_count == 1
        assert run.not_found_count == 1
        balance = await CreditService(session).get_balance_for_user(workspace_id, user)
        assert balance.available == 10
        assert balance.reserved == 0


@pytest.mark.asyncio
async def test_insufficient_credits_no_provider_calls(clean_enrichment) -> None:
    fake = FakeDaData()
    async with SessionLocal() as session:
        user, _workspace_id, table_id, inn_id, _rows = await _setup(session, credits=2)
        service = _service(session, fake)
        column = await service.create_column(
            table_id, user, name="Название", provider_id="dadata", operation=COMPANY_BY_IDENTIFIER,
            input_column_id=inn_id, output_field="company_name",
        )
        ids = []
        for value in ("1", "2", "3"):
            row = await RowService(session).create(table_id, user, {str(inn_id): value})
            ids.append(row.id)
        await session.commit()
        with pytest.raises(AppError) as exc:
            await service.create_run(table_id, user, column_id=column.id, row_ids=ids, idempotency_key=None)
        assert exc.value.code == "INSUFFICIENT_CREDITS"
        assert exc.value.details["needed"] == 3
        assert exc.value.details["available"] == 2
        assert fake.calls == []


@pytest.mark.asyncio
async def test_idempotent_run_does_not_double_charge(clean_enrichment) -> None:
    fake = FakeDaData()
    async with SessionLocal() as session:
        user, workspace_id, table_id, inn_id, rows = await _setup(session, credits=50)
        service = _service(session, fake)
        column = await service.create_column(
            table_id, user, name="Название", provider_id="dadata", operation=COMPANY_BY_IDENTIFIER,
            input_column_id=inn_id, output_field="company_name",
        )
        first = await service.create_run(
            table_id, user, column_id=column.id, row_ids=[rows[0]], idempotency_key="same-key"
        )
        calls_after_first = len(fake.calls)
        second = await service.create_run(
            table_id, user, column_id=column.id, row_ids=[rows[0]], idempotency_key="same-key"
        )
        assert second.id == first.id
        assert len(fake.calls) == calls_after_first
        balance = await CreditService(session).get_balance_for_user(workspace_id, user)
        assert balance.available == 49
        assert balance.reserved == 0
