from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.models.enrichment import (
    ATTEMPT_ERROR,
    ATTEMPT_NO_VALUE,
    ATTEMPT_NOT_FOUND,
    ATTEMPT_SKIPPED,
    ATTEMPT_SUCCESS,
    COMPLETED,
    COMPLETED_WITH_ERRORS,
    FAILED,
    PENDING,
    RUNNING,
    CellProvenance,
    EnrichmentAttempt,
    EnrichmentRun,
)
from app.models.table import TableColumn, TableRow, WorkspaceTable
from app.models.user import User, utc_now
from app.providers.enrichment.registry import EnrichmentProviderRegistry
from app.providers.enrichment.types import (
    COMPANY_BY_IDENTIFIER,
    ERROR,
    NO_VALUE,
    NOT_FOUND,
    OUTPUT_FIELD_IDS,
    SUCCESS,
    EnrichmentProvider,
    EnrichmentRequest,
    EnrichmentResult,
    identifier_to_text,
    mask_identifier,
)
from app.repositories.enrichment import CellProvenanceRepository, EnrichmentAttemptRepository, EnrichmentRunRepository
from app.services.credit import CreditService
from app.services.table import ColumnService, TableAccess, require_table_write, validate_column_type

logger = get_logger("app.enrichment")

TERMINAL_STATUSES = {COMPLETED, COMPLETED_WITH_ERRORS, FAILED}


class EnrichmentService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        settings: Settings | None = None,
        registry: EnrichmentProviderRegistry | None = None,
    ) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.registry = registry or EnrichmentProviderRegistry(self.settings)
        self.access = TableAccess(session)
        self.columns = ColumnService(session)
        self.runs = EnrichmentRunRepository(session)
        self.attempts = EnrichmentAttemptRepository(session)
        self.provenance = CellProvenanceRepository(session)
        self.credits = CreditService(session)

    def list_providers(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for provider in self.registry.list():
            caps = provider.capabilities()
            items.append(
                {
                    "id": provider.provider_id,
                    "name": provider.display_name,
                    "configured": provider.configured(),
                    "available": None,
                    "region": provider.region,
                    "operations": [
                        {
                            "id": operation.id,
                            "label": operation.label,
                            "inputs": list(operation.inputs),
                            "outputs": [{"id": field.id, "label": field.label} for field in operation.outputs],
                            "credits_per_success": operation.credits_per_success,
                        }
                        for operation in caps.operations
                    ],
                }
            )
        return items

    async def check_dadata(self, user: User, query: str) -> EnrichmentResult:
        _ = user
        provider = self.registry.get("dadata")
        if provider is None or not provider.configured():
            raise AppError("ENRICHMENT_PROVIDER_NOT_CONFIGURED", "DaData is not configured", status_code=400)
        text = identifier_to_text(query)
        if not text:
            raise AppError("INVALID_REQUEST", "query is required", status_code=400)
        try:
            return await provider.enrich(
                EnrichmentRequest(
                    operation=COMPANY_BY_IDENTIFIER,
                    input={"query": text},
                    requested_field="company_name",
                )
            )
        except AppError:
            raise

    async def create_column(
        self,
        table_id: uuid.UUID,
        user: User,
        *,
        name: str,
        provider_id: str,
        operation: str,
        input_column_id: uuid.UUID,
        output_field: str,
    ) -> TableColumn:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        columns = await self.access.columns.list_for_table(table.id)
        config = self._validated_config(
            table,
            columns,
            provider_id=provider_id,
            operation=operation,
            input_column_id=input_column_id,
            output_field=output_field,
        )
        position = await self.access.columns.max_position(table.id) + 1
        column = await self.access.columns.create(
            table_id=table.id,
            name=name.strip(),
            type="enrichment",
            position=position,
            config=config,
        )
        await self.access.tables.touch(table)
        return column

    def validate_config_payload(self, config: dict[str, Any], columns: list[TableColumn], table: WorkspaceTable) -> dict[str, Any]:
        provider_id = str(config.get("provider_id") or "")
        operation = str(config.get("operation") or "")
        raw_input = config.get("input_column_id")
        output_field = str(config.get("output_field") or "")
        try:
            input_column_id = uuid.UUID(str(raw_input))
        except (ValueError, TypeError) as exc:
            raise AppError("INVALID_REQUEST", "input_column_id must be a column UUID", status_code=400) from exc
        return self._validated_config(
            table,
            columns,
            provider_id=provider_id,
            operation=operation,
            input_column_id=input_column_id,
            output_field=output_field,
        )

    async def create_run(
        self,
        table_id: uuid.UUID,
        user: User,
        *,
        column_id: uuid.UUID,
        row_ids: list[uuid.UUID] | None,
        idempotency_key: str | None,
    ) -> EnrichmentRun:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        if idempotency_key:
            existing = await self.runs.get_by_idempotency(table.workspace_id, idempotency_key)
            if existing is not None:
                if existing.table_id != table.id:
                    raise AppError("ENRICHMENT_IDEMPOTENCY_CONFLICT", "Idempotency key already used", status_code=409)
                return existing

        columns = await self.access.columns.list_for_table(table.id)
        target = next((item for item in columns if item.id == column_id), None)
        if target is None or target.type != "enrichment":
            raise AppError("COLUMN_NOT_FOUND", "Enrichment column not found", status_code=404)
        config = target.config if isinstance(target.config, dict) else {}
        provider_id = str(config.get("provider_id") or "")
        operation = str(config.get("operation") or "")
        output_field = str(config.get("output_field") or "")
        try:
            input_column_id = uuid.UUID(str(config.get("input_column_id")))
        except (ValueError, TypeError) as exc:
            raise AppError("INVALID_REQUEST", "Enrichment column is missing input_column_id", status_code=400) from exc

        provider = self.registry.get(provider_id)
        if provider is None:
            raise AppError("ENRICHMENT_PROVIDER_UNKNOWN", f"Unknown provider: {provider_id}", status_code=400)
        if not provider.configured():
            raise AppError("ENRICHMENT_PROVIDER_NOT_CONFIGURED", f"{provider.display_name} is not configured", status_code=400)
        operation_meta = _operation(provider, operation)
        unit_cost = int(operation_meta.credits_per_success)

        rows = await self._load_rows(table.id, row_ids)
        if row_ids is not None and not rows:
            raise AppError("INVALID_REQUEST", "No matching rows in this table", status_code=400)
        if len(rows) > self.settings.enrichment_sync_max_rows:
            raise AppError(
                "ENRICHMENT_ASYNC_REQUIRED",
                "Для больших запусков потребуется background processing.",
                status_code=400,
                details={"max_rows": self.settings.enrichment_sync_max_rows, "requested": len(rows)},
            )

        classified = [_classify_row(row, input_column_id) for row in rows]
        candidates = [item for item in classified if item["kind"] == "candidate"]
        skipped = [item for item in classified if item["kind"] == "skipped"]
        reservation = len(candidates) * unit_cost

        try:
            run = await self.runs.create(
                workspace_id=table.workspace_id,
                table_id=table.id,
                target_column_id=target.id,
                provider_id=provider_id,
                operation=operation,
                status=PENDING,
                created_by_user_id=user.id,
                total_rows=len(rows),
                reserved_credits=reservation,
                config={
                    "provider_id": provider_id,
                    "operation": operation,
                    "input_column_id": str(input_column_id),
                    "output_field": output_field,
                    "credits_per_success": unit_cost,
                },
                idempotency_key=idempotency_key,
            )
        except IntegrityError:
            await self.session.rollback()
            if idempotency_key:
                existing = await self.runs.get_by_idempotency(table.workspace_id, idempotency_key)
                if existing is not None:
                    return existing
            raise

        reserved_ok = False
        charged = 0
        try:
            if reservation > 0:
                try:
                    await self.credits.reserve(
                        table.workspace_id,
                        reservation,
                        user=user,
                        reference_type="enrichment_run",
                        reference_id=str(run.id),
                        idempotency_key=f"enrichment:{run.id}:reserve",
                        description="Enrichment reservation",
                    )
                except AppError as exc:
                    run.status = FAILED
                    run.completed_at = utc_now()
                    run.updated_at = utc_now()
                    await self.session.flush()
                    raise exc
                reserved_ok = True
            run.status = RUNNING
            run.started_at = utc_now()
            run.updated_at = utc_now()
            await self.session.commit()

            for item in skipped:
                await self.attempts.create(
                    run_id=run.id,
                    row_id=item["row"].id,
                    provider_id=provider_id,
                    operation=operation,
                    attempt_index=1,
                    status=ATTEMPT_SKIPPED,
                    input_value=item["input_value"],
                    error_code="EMPTY_INPUT",
                    error_message="Input cell is empty",
                    credits_charged=0,
                    provider_metadata={"reason": "EMPTY_INPUT"},
                )
            await self.session.commit()

            fetched = await self._fetch_candidates(
                provider,
                candidates,
                operation=operation,
                output_field=output_field,
            )

            success_count = 0
            not_found_count = 0
            error_count = 0
            for row, input_value, result, duration_ms in fetched:
                attempt_status, charged_here = await self._persist_attempt(
                    table=table,
                    run=run,
                    target=target,
                    row=row,
                    provider=provider,
                    operation=operation,
                    output_field=output_field,
                    input_value=input_value,
                    result=result,
                    duration_ms=duration_ms,
                    unit_cost=unit_cost,
                )
                if attempt_status == ATTEMPT_SUCCESS:
                    success_count += 1
                    charged += charged_here
                elif attempt_status in {ATTEMPT_NOT_FOUND, ATTEMPT_NO_VALUE}:
                    not_found_count += 1
                else:
                    error_count += 1
            await self.session.commit()

            if reserved_ok:
                await self._settle(table.workspace_id, run, user, reservation, charged)
            run.processed_rows = len(rows)
            run.success_count = success_count
            run.not_found_count = not_found_count
            run.error_count = error_count
            run.skipped_count = len(skipped)
            run.charged_credits = charged
            run.status = COMPLETED_WITH_ERRORS if error_count else COMPLETED
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            await self.session.commit()
            logger.info(
                "enrichment completed provider=%s operation=%s run_id=%s workspace_id=%s rows=%s success=%s not_found=%s errors=%s skipped=%s credits_charged=%s",
                provider_id,
                operation,
                run.id,
                table.workspace_id,
                len(rows),
                success_count,
                not_found_count,
                error_count,
                len(skipped),
                charged,
            )
            return run
        except AppError:
            if reserved_ok:
                await self._safe_release(table.workspace_id, run, user, reservation, charged)
            raise
        except Exception:
            logger.exception("enrichment failed run_id=%s workspace_id=%s", run.id, table.workspace_id)
            if reserved_ok:
                await self._safe_release(table.workspace_id, run, user, reservation, charged)
            run.status = FAILED
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            await self.session.commit()
            raise AppError("ENRICHMENT_RUN_FAILED", "Enrichment run failed", status_code=500)

    async def get_run(self, run_id: uuid.UUID, user: User) -> EnrichmentRun:
        run = await self.runs.get_by_id(run_id)
        if run is None:
            raise AppError("ENRICHMENT_RUN_NOT_FOUND", "Enrichment run not found", status_code=404)
        await self.access.table_for_user(run.table_id, user)
        return run

    async def list_runs(self, table_id: uuid.UUID, user: User, *, limit: int, offset: int) -> tuple[list[EnrichmentRun], int]:
        await self.access.table_for_user(table_id, user)
        return await self.runs.list_for_table(table_id, limit=limit, offset=offset)

    async def list_attempts(
        self,
        run_id: uuid.UUID,
        user: User,
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[EnrichmentAttempt], int]:
        run = await self.get_run(run_id, user)
        return await self.attempts.list_for_run(run.id, limit=limit, offset=offset)

    async def get_provenance(
        self,
        table_id: uuid.UUID,
        row_id: uuid.UUID,
        column_id: uuid.UUID,
        user: User,
    ) -> CellProvenance | None:
        table, _member = await self.access.table_for_user(table_id, user)
        row = await self.access.rows.get_by_id(row_id)
        if row is None or row.table_id != table.id:
            raise AppError("ROW_NOT_FOUND", "Row not found", status_code=404)
        column = await self.access.columns.get_by_id(column_id)
        if column is None or column.table_id != table.id:
            raise AppError("COLUMN_NOT_FOUND", "Column not found", status_code=404)
        return await self.provenance.get(row_id, column_id)

    def _validated_config(
        self,
        table: WorkspaceTable,
        columns: list[TableColumn],
        *,
        provider_id: str,
        operation: str,
        input_column_id: uuid.UUID,
        output_field: str,
    ) -> dict[str, Any]:
        _ = table
        provider = self.registry.get(provider_id)
        if provider is None:
            raise AppError("ENRICHMENT_PROVIDER_UNKNOWN", f"Unknown provider: {provider_id}", status_code=400)
        operation_meta = _operation(provider, operation)
        if output_field not in {field.id for field in operation_meta.outputs} or output_field not in OUTPUT_FIELD_IDS:
            raise AppError("ENRICHMENT_OUTPUT_UNSUPPORTED", f"Unsupported output field: {output_field}", status_code=400)
        input_column = next((item for item in columns if item.id == input_column_id), None)
        if input_column is None:
            raise AppError("COLUMN_NOT_FOUND", "Input column must belong to this table", status_code=400)
        return {
            "provider_id": provider.provider_id,
            "operation": operation_meta.id,
            "input_column_id": str(input_column.id),
            "output_field": output_field,
            "credits_per_success": operation_meta.credits_per_success,
        }

    async def _load_rows(self, table_id: uuid.UUID, row_ids: list[uuid.UUID] | None) -> list[TableRow]:
        if row_ids is not None:
            unique_ids = list(dict.fromkeys(row_ids))
            return await self.access.rows.get_by_ids(table_id, unique_ids)
        rows: list[TableRow] = []
        async for chunk in self.access.rows.iterate_chunks(table_id, chunk_size=self.settings.enrichment_sync_max_rows + 1):
            rows.extend(chunk)
            if len(rows) > self.settings.enrichment_sync_max_rows:
                break
        return rows

    async def _fetch_candidates(
        self,
        provider: EnrichmentProvider,
        candidates: list[dict[str, Any]],
        *,
        operation: str,
        output_field: str,
    ) -> list[tuple[TableRow, str, EnrichmentResult, int]]:
        semaphore = asyncio.Semaphore(self.settings.enrichment_provider_concurrency)

        async def one(item: dict[str, Any]) -> tuple[TableRow, str, EnrichmentResult, int]:
            async with semaphore:
                started = time.perf_counter()
                try:
                    result = await provider.enrich(
                        EnrichmentRequest(
                            operation=operation,
                            input={"query": item["input_value"]},
                            requested_field=output_field,
                        )
                    )
                except AppError as exc:
                    result = EnrichmentResult(
                        status=ERROR,
                        provider=provider.provider_id,
                        operation=operation,
                        error_code=exc.code,
                        error_message=exc.message,
                    )
                duration_ms = int((time.perf_counter() - started) * 1000)
                return item["row"], item["input_value"], result, duration_ms

        return list(await asyncio.gather(*[one(item) for item in candidates]))

    async def _persist_attempt(
        self,
        *,
        table: WorkspaceTable,
        run: EnrichmentRun,
        target: TableColumn,
        row: TableRow,
        provider: EnrichmentProvider,
        operation: str,
        output_field: str,
        input_value: str,
        result: EnrichmentResult,
        duration_ms: int,
        unit_cost: int,
    ) -> tuple[str, int]:
        status = result.status
        charged = 0
        error_code = result.error_code
        error_message = result.error_message
        if status == SUCCESS:
            attempt_status = ATTEMPT_SUCCESS
            charged = unit_cost
        elif status == NOT_FOUND:
            attempt_status = ATTEMPT_NOT_FOUND
        elif status == NO_VALUE:
            attempt_status = ATTEMPT_NO_VALUE
        else:
            attempt_status = ATTEMPT_ERROR
            error_code = error_code or "ENRICHMENT_PROVIDER_ERROR"
            error_message = error_message or "Provider error"
        attempt = await self.attempts.create(
            run_id=run.id,
            row_id=row.id,
            provider_id=provider.provider_id,
            operation=operation,
            attempt_index=1,
            status=attempt_status,
            input_value=input_value,
            normalized_result=result.data or None,
            provider_metadata={
                **(result.metadata or {}),
                "requested_field": output_field,
                "source": result.source or provider.display_name,
            },
            credits_charged=charged,
            duration_ms=duration_ms,
            error_code=error_code,
            error_message=error_message,
        )
        if attempt_status == ATTEMPT_SUCCESS:
            data = dict(row.data or {})
            data[str(target.id)] = result.value
            row.data = data
            flag_modified(row, "data")
            row.updated_at = utc_now()
            retrieved_at = _parse_retrieved(result.metadata.get("retrieved_at"))
            await self.provenance.upsert(
                table_id=table.id,
                row_id=row.id,
                column_id=target.id,
                run_id=run.id,
                attempt_id=attempt.id,
                provider_id=provider.provider_id,
                operation=operation,
                source_label=result.source or provider.display_name,
                source_url=None,
                retrieved_at=retrieved_at,
                confidence=result.confidence,
                credits_charged=charged,
                extra={
                    "input": mask_identifier(input_value),
                    "output_field": output_field,
                    "normalized": result.data,
                },
            )
        return attempt_status, charged

    async def _settle(
        self,
        workspace_id: uuid.UUID,
        run: EnrichmentRun,
        user: User,
        reserved: int,
        charged: int,
    ) -> None:
        if charged:
            await self.credits.charge(
                workspace_id,
                charged,
                user=user,
                reference_type="enrichment_run",
                reference_id=str(run.id),
                idempotency_key=f"enrichment:{run.id}:charge",
                description="Enrichment success charge",
            )
        unused = reserved - charged
        if unused > 0:
            await self.credits.release(
                workspace_id,
                unused,
                user=user,
                reference_type="enrichment_run",
                reference_id=str(run.id),
                idempotency_key=f"enrichment:{run.id}:release",
                description="Unused enrichment reservation",
            )

    async def _safe_release(
        self,
        workspace_id: uuid.UUID,
        run: EnrichmentRun,
        user: User,
        reserved: int,
        charged: int,
    ) -> None:
        try:
            await self._settle(workspace_id, run, user, reserved, charged)
            run.charged_credits = charged
            run.status = FAILED
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            await self.session.commit()
        except Exception:
            logger.exception("enrichment settlement failed run_id=%s", run.id)
            try:
                await self.session.rollback()
            except Exception:
                pass


def _operation(provider: EnrichmentProvider, operation: str):
    caps = provider.capabilities()
    for item in caps.operations:
        if item.id == operation:
            return item
    raise AppError("ENRICHMENT_OPERATION_UNSUPPORTED", f"Unsupported operation: {operation}", status_code=400)


def _classify_row(row: TableRow, input_column_id: uuid.UUID) -> dict[str, Any]:
    raw = (row.data or {}).get(str(input_column_id))
    text = identifier_to_text(raw)
    if not text:
        return {"kind": "skipped", "row": row, "input_value": None}
    return {"kind": "candidate", "row": row, "input_value": text}


def _parse_retrieved(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return utc_now()


def ensure_enrichment_column_type(column_type: str) -> str:
    return validate_column_type(column_type)
