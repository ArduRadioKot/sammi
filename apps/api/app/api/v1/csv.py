import uuid

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.errors import AppError
from app.db.session import SessionLocal, get_db
from app.models.user import User
from app.schemas.csv import CsvImportResponse, CsvPreviewResponse
from app.schemas.relationship import AnalysisRequest
from app.services.csv.export_service import CsvExportService, content_disposition, sanitize_export_filename, stream_csv
from app.services.csv.import_service import CsvImportService
from app.services.csv.types import normalize_delimiter
from app.services.relationship.runs import AnalysisService
from app.services.relationship import web_search
from app.services.relationship.publications import PublicationError

router = APIRouter(tags=["csv"])


async def _read_upload(file: UploadFile) -> tuple[bytes, str]:
    data = await file.read()
    return data, file.filename or "upload.csv"


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


@router.post(
    "/workspaces/{workspace_id}/imports/csv/preview",
    response_model=CsvPreviewResponse,
    summary="Preview CSV before creating a table",
)
async def preview_workspace_csv(
    workspace_id: uuid.UUID,
    file: UploadFile = File(..., description="CSV file"),
    delimiter: str | None = Form(default=None, description="comma, semicolon, or tab"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CsvPreviewResponse:
    data, filename = await _read_upload(file)
    payload = await CsvImportService(session).preview_workspace(
        workspace_id, user, data, filename, delimiter
    )
    return CsvPreviewResponse.model_validate(payload)


@router.post(
    "/workspaces/{workspace_id}/imports/csv",
    response_model=CsvImportResponse,
    summary="Create a table from CSV",
)
async def import_workspace_csv(
    request: Request,
    workspace_id: uuid.UUID,
    file: UploadFile = File(..., description="CSV file"),
    mapping_json: str = Form(..., description='{"columns":[{"csv_index":0,"action":"create","name":"Company","type":"text"}]}'),
    options_json: str | None = Form(default="{}", description='{"file_signature":"...","table_name":"...","object_type":"custom"}'),
    delimiter: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CsvImportResponse:
    data, filename = await _read_upload(file)
    result = await CsvImportService(session).import_new_table(
        workspace_id,
        user,
        data,
        filename,
        mapping_json,
        options_json,
        delimiter,
        request_id=_request_id(request),
    )
    analysis_started = False
    analysis_error = None
    if result.analyze_relationships:
        await session.commit()
        try:
            web_search.search_endpoint()
            search = True
        except PublicationError:
            search = False
        try:
            await AnalysisService(session).start(result.table_id, user, AnalysisRequest(
                web_search=search, fetch_csv_urls=True, refresh_hours=24 if search else None,
            ), [])
            analysis_started = True
        except AppError as exc:
            await session.rollback()
            analysis_error = exc.message
    return CsvImportResponse(
        table_id=result.table_id,
        table_name=result.table_name,
        rows_imported=result.rows_imported,
        columns_created=result.columns_created,
        columns_mapped=result.columns_mapped,
        columns_skipped=result.columns_skipped,
        column_count=result.column_count,
        analysis_started=analysis_started,
        analysis_error=analysis_error,
    )


@router.post(
    "/tables/{table_id}/imports/csv/preview",
    response_model=CsvPreviewResponse,
    summary="Preview CSV before importing into an existing table",
)
async def preview_table_csv(
    table_id: uuid.UUID,
    file: UploadFile = File(..., description="CSV file"),
    delimiter: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CsvPreviewResponse:
    data, filename = await _read_upload(file)
    payload = await CsvImportService(session).preview_table(table_id, user, data, filename, delimiter)
    return CsvPreviewResponse.model_validate(payload)


@router.post(
    "/tables/{table_id}/imports/csv",
    response_model=CsvImportResponse,
    summary="Append CSV rows to an existing table",
)
async def import_table_csv(
    request: Request,
    table_id: uuid.UUID,
    file: UploadFile = File(..., description="CSV file"),
    mapping_json: str = Form(...),
    options_json: str | None = Form(default="{}"),
    delimiter: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> CsvImportResponse:
    data, filename = await _read_upload(file)
    result = await CsvImportService(session).import_existing_table(
        table_id,
        user,
        data,
        filename,
        mapping_json,
        options_json,
        delimiter,
        request_id=_request_id(request),
    )
    return CsvImportResponse(
        table_id=result.table_id,
        table_name=result.table_name,
        rows_imported=result.rows_imported,
        columns_created=result.columns_created,
        columns_mapped=result.columns_mapped,
        columns_skipped=result.columns_skipped,
        column_count=result.column_count,
    )


@router.get(
    "/tables/{table_id}/export.csv",
    summary="Export table as CSV",
    response_class=StreamingResponse,
)
async def export_table_csv(
    table_id: uuid.UUID,
    user: User = Depends(get_current_user),
    delimiter: str = Query(default="comma", description="comma or semicolon. Default: comma."),
    bom: bool = Query(default=True, description="UTF-8 BOM for Excel"),
    safe_for_spreadsheets: bool = Query(default=True, description="Prefix formula-like values with '"),
) -> StreamingResponse:
    try:
        normalize_delimiter(delimiter)
    except ValueError as exc:
        raise AppError("CSV_EXPORT_FAILED", "Unsupported export delimiter", status_code=400) from exc

    async with SessionLocal() as session:
        spec = await CsvExportService(session).prepare(table_id, user)
    filename = sanitize_export_filename(spec.name)

    async def body():
        async with SessionLocal() as stream_session:
            async for chunk in stream_csv(
                stream_session,
                spec,
                delimiter=delimiter,
                include_bom=bom,
                safe_for_spreadsheets=safe_for_spreadsheets,
            ):
                yield chunk

    return StreamingResponse(
        body(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": content_disposition(filename)},
    )
