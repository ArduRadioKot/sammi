import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enrichment import CellProvenance, EnrichmentAttempt, EnrichmentRun
from app.models.user import utc_now


class EnrichmentRunRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, **kwargs: Any) -> EnrichmentRun:
        run = EnrichmentRun(**kwargs)
        self.session.add(run)
        await self.session.flush()
        return run

    async def get_by_id(self, run_id: uuid.UUID) -> EnrichmentRun | None:
        return await self.session.get(EnrichmentRun, run_id)

    async def get_by_idempotency(self, workspace_id: uuid.UUID, idempotency_key: str) -> EnrichmentRun | None:
        result = await self.session.execute(
            select(EnrichmentRun).where(
                EnrichmentRun.workspace_id == workspace_id,
                EnrichmentRun.idempotency_key == idempotency_key,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_table(
        self,
        table_id: uuid.UUID,
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[EnrichmentRun], int]:
        total = await self.session.scalar(
            select(func.count()).select_from(EnrichmentRun).where(EnrichmentRun.table_id == table_id)
        )
        page = await self.session.execute(
            select(EnrichmentRun)
            .where(EnrichmentRun.table_id == table_id)
            .order_by(EnrichmentRun.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(page.scalars().all()), int(total or 0)


class EnrichmentAttemptRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, **kwargs: Any) -> EnrichmentAttempt:
        attempt = EnrichmentAttempt(**kwargs)
        self.session.add(attempt)
        await self.session.flush()
        return attempt

    async def list_for_run(
        self,
        run_id: uuid.UUID,
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[EnrichmentAttempt], int]:
        total = await self.session.scalar(
            select(func.count()).select_from(EnrichmentAttempt).where(EnrichmentAttempt.run_id == run_id)
        )
        page = await self.session.execute(
            select(EnrichmentAttempt)
            .where(EnrichmentAttempt.run_id == run_id)
            .order_by(EnrichmentAttempt.created_at.asc())
            .limit(limit)
            .offset(offset)
        )
        return list(page.scalars().all()), int(total or 0)


class CellProvenanceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def upsert(
        self,
        *,
        table_id: uuid.UUID,
        row_id: uuid.UUID,
        column_id: uuid.UUID,
        run_id: uuid.UUID,
        attempt_id: uuid.UUID,
        provider_id: str,
        operation: str,
        source_label: str,
        source_url: str | None,
        retrieved_at: datetime,
        confidence: float | None,
        credits_charged: int,
        extra: dict[str, Any],
    ) -> CellProvenance:
        now = utc_now()
        stmt = insert(CellProvenance).values(
            table_id=table_id,
            row_id=row_id,
            column_id=column_id,
            run_id=run_id,
            attempt_id=attempt_id,
            provider_id=provider_id,
            operation=operation,
            source_label=source_label,
            source_url=source_url,
            retrieved_at=retrieved_at,
            confidence=confidence,
            credits_charged=credits_charged,
            extra=extra,
            created_at=now,
            updated_at=now,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_cell_provenance_row_column",
            set_={
                "run_id": run_id,
                "attempt_id": attempt_id,
                "provider_id": provider_id,
                "operation": operation,
                "source_label": source_label,
                "source_url": source_url,
                "retrieved_at": retrieved_at,
                "confidence": confidence,
                "credits_charged": credits_charged,
                "metadata": extra,
                "updated_at": now,
            },
        )
        await self.session.execute(stmt)
        await self.session.flush()
        result = await self.session.execute(
            select(CellProvenance).where(CellProvenance.row_id == row_id, CellProvenance.column_id == column_id)
        )
        return result.scalar_one()

    async def get(self, row_id: uuid.UUID, column_id: uuid.UUID) -> CellProvenance | None:
        result = await self.session.execute(
            select(CellProvenance).where(CellProvenance.row_id == row_id, CellProvenance.column_id == column_id)
        )
        return result.scalar_one_or_none()
