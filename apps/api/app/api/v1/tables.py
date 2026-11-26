import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.table import (
    ColumnCreate,
    ColumnListResponse,
    ColumnRead,
    ColumnReorder,
    ColumnUpdate,
    PaginatedRows,
    RowBulkDelete,
    RowCreate,
    RowRead,
    RowUpdate,
    TableCreate,
    TableListResponse,
    TableRead,
    TableUpdate,
)
from app.services.table import DEFAULT_ROW_LIMIT, ColumnService, RowService, TableService

router = APIRouter(tags=["tables"])


def _table_read(table, column_count: int, row_count: int, columns=None) -> TableRead:
    payload = TableRead(
        id=table.id,
        workspace_id=table.workspace_id,
        created_by=table.created_by,
        name=table.name,
        description=table.description,
        object_type=table.object_type,
        relationship_source_id=table.relationship_source_id,
        created_at=table.created_at,
        updated_at=table.updated_at,
        column_count=column_count,
        row_count=row_count,
        columns=[ColumnRead.model_validate(column) for column in columns] if columns is not None else None,
    )
    return payload


@router.get(
    "/workspaces/{workspace_id}/tables",
    response_model=TableListResponse,
    summary="List workspace tables",
)
async def list_tables(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> TableListResponse:
    rows = await TableService(session).list_for_workspace(workspace_id, user)
    return TableListResponse(
        items=[_table_read(table, column_count, row_count) for table, column_count, row_count in rows]
    )


@router.post(
    "/workspaces/{workspace_id}/tables",
    response_model=TableRead,
    status_code=201,
    summary="Create table",
)
async def create_table(
    workspace_id: uuid.UUID,
    body: TableCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> TableRead:
    table = await TableService(session).create(
        workspace_id,
        user,
        name=body.name,
        object_type=body.object_type,
        description=body.description,
    )
    return _table_read(table, 0, 0, columns=[])


@router.get("/tables/{table_id}", response_model=TableRead, summary="Get table")
async def get_table(
    table_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> TableRead:
    table, columns, column_count, row_count = await TableService(session).get(table_id, user)
    return _table_read(table, column_count, row_count, columns)


@router.patch("/tables/{table_id}", response_model=TableRead, summary="Update table")
async def update_table(
    table_id: uuid.UUID,
    body: TableUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> TableRead:
    table = await TableService(session).update(table_id, user, name=body.name, description=body.description)
    column_count, row_count = await TableService(session).tables.counts(table.id)
    return _table_read(table, column_count, row_count)


@router.delete("/tables/{table_id}", status_code=204, summary="Delete table")
async def delete_table(
    table_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Response:
    await TableService(session).delete(table_id, user)
    return Response(status_code=204)


@router.get("/tables/{table_id}/columns", response_model=ColumnListResponse, summary="List columns")
async def list_columns(
    table_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ColumnListResponse:
    columns = await ColumnService(session).list_for_table(table_id, user)
    return ColumnListResponse(items=[ColumnRead.model_validate(column) for column in columns])


@router.post(
    "/tables/{table_id}/columns",
    response_model=ColumnRead,
    status_code=201,
    summary="Create column",
)
async def create_column(
    table_id: uuid.UUID,
    body: ColumnCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ColumnRead:
    column = await ColumnService(session).create(table_id, user, name=body.name, type=body.type, config=body.config)
    return ColumnRead.model_validate(column)


@router.post(
    "/tables/{table_id}/columns/reorder",
    response_model=ColumnListResponse,
    summary="Reorder columns",
)
async def reorder_columns(
    table_id: uuid.UUID,
    body: ColumnReorder,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ColumnListResponse:
    columns = await ColumnService(session).reorder(table_id, user, body.column_ids)
    return ColumnListResponse(items=[ColumnRead.model_validate(column) for column in columns])


@router.patch(
    "/tables/{table_id}/columns/{column_id}",
    response_model=ColumnRead,
    summary="Update column",
)
async def update_column(
    table_id: uuid.UUID,
    column_id: uuid.UUID,
    body: ColumnUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ColumnRead:
    column = await ColumnService(session).update(
        table_id,
        column_id,
        user,
        name=body.name,
        config=body.config,
    )
    return ColumnRead.model_validate(column)


@router.delete("/tables/{table_id}/columns/{column_id}", status_code=204, summary="Delete column")
async def delete_column(
    table_id: uuid.UUID,
    column_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Response:
    await ColumnService(session).delete(table_id, column_id, user)
    return Response(status_code=204)


@router.get("/tables/{table_id}/rows", response_model=PaginatedRows, summary="List rows")
async def list_rows(
    table_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    limit: int = Query(default=DEFAULT_ROW_LIMIT, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> PaginatedRows:
    rows, total, _columns = await RowService(session).list_for_table(table_id, user, limit=limit, offset=offset)
    return PaginatedRows(
        items=[RowRead.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/tables/{table_id}/rows", response_model=RowRead, status_code=201, summary="Create row")
async def create_row(
    table_id: uuid.UUID,
    body: RowCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> RowRead:
    row = await RowService(session).create(table_id, user, body.data)
    return RowRead.model_validate(row)


@router.post("/tables/{table_id}/rows/bulk-delete", status_code=204, summary="Bulk delete rows")
async def bulk_delete_rows(
    table_id: uuid.UUID,
    body: RowBulkDelete,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Response:
    await RowService(session).bulk_delete(table_id, user, body.row_ids)
    return Response(status_code=204)


@router.get("/tables/{table_id}/rows/{row_id}", response_model=RowRead, summary="Get source row")
async def get_row(
    table_id: uuid.UUID,
    row_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> RowRead:
    return await RowService(session).get(table_id, row_id, user)


@router.patch("/tables/{table_id}/rows/{row_id}", response_model=RowRead, summary="Patch row cells")
async def update_row(
    table_id: uuid.UUID,
    row_id: uuid.UUID,
    body: RowUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> RowRead:
    row = await RowService(session).update(table_id, row_id, user, body.data)
    return RowRead.model_validate(row)


@router.delete("/tables/{table_id}/rows/{row_id}", status_code=204, summary="Delete row")
async def delete_row(
    table_id: uuid.UUID,
    row_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> Response:
    await RowService(session).delete(table_id, row_id, user)
    return Response(status_code=204)
