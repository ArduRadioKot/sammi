import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.enrichment import CellProvenance
from app.models.user import User
from app.providers.enrichment.types import SUCCESS
from app.schemas.enrichment import (
    CellProvenanceRead,
    DaDataCheckRequest,
    DaDataCheckResponse,
    EnrichmentAttemptListResponse,
    EnrichmentAttemptRead,
    EnrichmentColumnCreate,
    EnrichmentProviderListResponse,
    EnrichmentProviderRead,
    EnrichmentRunCreate,
    EnrichmentRunListResponse,
    EnrichmentRunRead,
)
from app.schemas.table import ColumnRead
from app.services.enrichment import EnrichmentService

router = APIRouter(tags=["enrichment"])


def _run_read(run) -> EnrichmentRunRead:
    return EnrichmentRunRead.model_validate(run)


def _provenance_read(row: CellProvenance) -> CellProvenanceRead:
    return CellProvenanceRead(
        id=row.id,
        table_id=row.table_id,
        row_id=row.row_id,
        column_id=row.column_id,
        run_id=row.run_id,
        attempt_id=row.attempt_id,
        provider_id=row.provider_id,
        operation=row.operation,
        source_label=row.source_label,
        source_url=row.source_url,
        retrieved_at=row.retrieved_at,
        confidence=row.confidence,
        credits_charged=row.credits_charged,
        metadata=row.extra or {},
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/enrichment/providers", response_model=EnrichmentProviderListResponse)
async def list_enrichment_providers(
    _user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> EnrichmentProviderListResponse:
    items = EnrichmentService(session).list_providers()
    return EnrichmentProviderListResponse(items=[EnrichmentProviderRead.model_validate(item) for item in items])


@router.post("/enrichment/providers/dadata/check", response_model=DaDataCheckResponse)
async def check_dadata_provider(
    body: DaDataCheckRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> DaDataCheckResponse:
    result = await EnrichmentService(session).check_dadata(user, body.query)
    available = result.status == SUCCESS
    return DaDataCheckResponse(
        status=result.status,
        configured=True,
        available=available,
        value=result.value,
        data=result.data,
        error_code=result.error_code,
        error_message=result.error_message,
    )


@router.post("/tables/{table_id}/enrichment/columns", response_model=ColumnRead, status_code=201)
async def create_enrichment_column(
    table_id: uuid.UUID,
    body: EnrichmentColumnCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ColumnRead:
    column = await EnrichmentService(session).create_column(
        table_id,
        user,
        name=body.name,
        provider_id=body.provider_id,
        operation=body.operation,
        input_column_id=body.input_column_id,
        output_field=body.output_field,
    )
    return ColumnRead.model_validate(column)


@router.post("/tables/{table_id}/enrichment/runs", response_model=EnrichmentRunRead)
async def create_enrichment_run(
    table_id: uuid.UUID,
    body: EnrichmentRunCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> EnrichmentRunRead:
    run = await EnrichmentService(session).create_run(
        table_id,
        user,
        column_id=body.column_id,
        row_ids=body.row_ids,
        idempotency_key=idempotency_key.strip() if idempotency_key else None,
    )
    return _run_read(run)


@router.get("/tables/{table_id}/enrichment/runs", response_model=EnrichmentRunListResponse)
async def list_table_enrichment_runs(
    table_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> EnrichmentRunListResponse:
    items, total = await EnrichmentService(session).list_runs(table_id, user, limit=limit, offset=offset)
    return EnrichmentRunListResponse(
        items=[_run_read(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/enrichment/runs/{run_id}", response_model=EnrichmentRunRead)
async def get_enrichment_run(
    run_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> EnrichmentRunRead:
    run = await EnrichmentService(session).get_run(run_id, user)
    return _run_read(run)


@router.get("/enrichment/runs/{run_id}/attempts", response_model=EnrichmentAttemptListResponse)
async def list_enrichment_attempts(
    run_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> EnrichmentAttemptListResponse:
    items, total = await EnrichmentService(session).list_attempts(run_id, user, limit=limit, offset=offset)
    return EnrichmentAttemptListResponse(
        items=[EnrichmentAttemptRead.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/tables/{table_id}/rows/{row_id}/columns/{column_id}/provenance",
    response_model=CellProvenanceRead | None,
)
async def get_cell_provenance(
    table_id: uuid.UUID,
    row_id: uuid.UUID,
    column_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CellProvenanceRead | None:
    row = await EnrichmentService(session).get_provenance(table_id, row_id, column_id, user)
    if row is None:
        return None
    return _provenance_read(row)
