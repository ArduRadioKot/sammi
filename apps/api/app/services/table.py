import re
import uuid
from datetime import date
from typing import Any

from sqlalchemy.orm.attributes import flag_modified

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.logging import get_logger
from app.models.table import TableColumn, TableRow, WorkspaceTable
from app.models.user import User, utc_now
from app.models.workspace import WorkspaceMember, WorkspaceRole
from app.repositories.table import TableColumnRepository, TableRepository, TableRowRepository
from app.repositories.workspace import WorkspaceMemberRepository
from app.schemas.table import RowRead
from app.schemas.relationship import OUTPUT_CONFIG_KEY
from app.services.workspace import WorkspaceService

logger = get_logger("app.tables")

ALLOWED_OBJECT_TYPES = {"company", "person", "custom"}
ALLOWED_COLUMN_TYPES = {"text", "number", "boolean", "date", "url", "email", "phone", "select", "enrichment"}
WRITE_ROLES = {WorkspaceRole.owner, WorkspaceRole.admin, WorkspaceRole.member}
DELETE_TABLE_ROLES = {WorkspaceRole.owner, WorkspaceRole.admin}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
URL_RE = re.compile(r"^(https?://)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(/.*)?$")
PHONE_RE = re.compile(r"^\+?[0-9()\s-]{5,32}$")
DEFAULT_ROW_LIMIT = 200
MAX_ROW_LIMIT = 500


def _not_found() -> AppError:
    return AppError("TABLE_NOT_FOUND", "Table not found", status_code=404)


def _column_not_found() -> AppError:
    return AppError("COLUMN_NOT_FOUND", "Column not found", status_code=404)


def _row_not_found() -> AppError:
    return AppError("ROW_NOT_FOUND", "Row not found", status_code=404)


def _write_denied() -> AppError:
    return AppError("TABLE_ACCESS_DENIED", "Write access denied", status_code=403)


def _workspace_write_denied() -> AppError:
    return AppError("WORKSPACE_ACCESS_DENIED", "Write access denied", status_code=403)


def require_write(member: WorkspaceMember) -> None:
    if member.role not in WRITE_ROLES:
        raise _write_denied()


def require_table_write(table: WorkspaceTable, member: WorkspaceMember) -> None:
    require_write(member)
    if table.relationship_source_id is not None:
        raise AppError("RELATIONSHIP_DATASET_READ_ONLY", "Редактируйте данные в исходной таблице анализа.", 409)


def require_delete_table(member: WorkspaceMember) -> None:
    if member.role not in DELETE_TABLE_ROLES:
        raise _write_denied()


def require_workspace_write(member: WorkspaceMember) -> None:
    if member.role not in WRITE_ROLES:
        raise _workspace_write_denied()


def normalize_object_type(value: str) -> str:
    mapping = {"companies": "company", "people": "person"}
    object_type = mapping.get(value, value)
    if object_type not in ALLOWED_OBJECT_TYPES:
        raise AppError("INVALID_REQUEST", f"Unsupported object_type: {value}", status_code=400)
    return object_type


def validate_column_type(column_type: str) -> str:
    if column_type not in ALLOWED_COLUMN_TYPES:
        raise AppError("INVALID_COLUMN_TYPE", f"Unsupported column type: {column_type}", status_code=400)
    return column_type


def _parse_column_id(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(raw))
    except ValueError as exc:
        raise AppError("COLUMN_NOT_FOUND", f"Unknown column: {raw}", status_code=400) from exc


def _as_null(value: Any) -> bool:
    return value is None or value == ""


def validate_cell_value(column: TableColumn, value: Any) -> Any:
    if _as_null(value):
        return None
    column_type = column.type
    if column_type == "boolean":
        if not isinstance(value, bool):
            raise AppError("INVALID_CELL_VALUE", f"Column {column.name} expects boolean", status_code=400)
        return value
    if column_type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise AppError("INVALID_CELL_VALUE", f"Column {column.name} expects number", status_code=400)
        return value
    if column_type == "date":
        if not isinstance(value, str):
            raise AppError("INVALID_CELL_VALUE", f"Column {column.name} expects ISO date", status_code=400)
        try:
            date.fromisoformat(value[:10])
        except ValueError as exc:
            raise AppError("INVALID_CELL_VALUE", f"Column {column.name} expects ISO date", status_code=400) from exc
        return value
    if column_type == "enrichment":
        if isinstance(value, bool):
            raise AppError("INVALID_CELL_VALUE", f"Column {column.name} expects text", status_code=400)
        if isinstance(value, int):
            return str(value)
        if isinstance(value, float):
            return str(int(value)) if value.is_integer() else str(value)
        if not isinstance(value, str):
            raise AppError("INVALID_CELL_VALUE", f"Column {column.name} expects text", status_code=400)
        return value
    if not isinstance(value, str):
        raise AppError("INVALID_CELL_VALUE", f"Column {column.name} expects text", status_code=400)
    if column_type == "email" and not EMAIL_RE.match(value):
        raise AppError("INVALID_CELL_VALUE", f"Column {column.name} expects email", status_code=400)
    if column_type == "url" and not URL_RE.match(value):
        raise AppError("INVALID_CELL_VALUE", f"Column {column.name} expects url", status_code=400)
    if column_type == "phone" and not PHONE_RE.match(value):
        raise AppError("INVALID_CELL_VALUE", f"Column {column.name} expects phone", status_code=400)
    if column_type == "select":
        options = column.config.get("options") if isinstance(column.config, dict) else None
        if isinstance(options, list) and options:
            labels = {item if isinstance(item, str) else str(item.get("label", item.get("id", ""))) for item in options if item}
            if labels and value not in labels:
                raise AppError("INVALID_CELL_VALUE", f"Column {column.name} expects a select option", status_code=400)
        return value
    return value


def validate_row_data(columns: list[TableColumn], data: dict[str, Any]) -> dict[str, Any]:
    by_id = {column.id: column for column in columns}
    cleaned: dict[str, Any] = {}
    for raw_key, value in data.items():
        column_id = _parse_column_id(raw_key)
        column = by_id.get(column_id)
        if column is None:
            raise AppError("COLUMN_NOT_FOUND", f"Unknown column: {raw_key}", status_code=400)
        cleaned[str(column_id)] = validate_cell_value(column, value)
    return cleaned


def public_row_data(columns: list[TableColumn], data: dict[str, Any] | None) -> dict[str, Any]:
    allowed = {str(column.id) for column in columns}
    source = data or {}
    return {key: source[key] for key in source if key in allowed}


class TableAccess:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.tables = TableRepository(session)
        self.columns = TableColumnRepository(session)
        self.rows = TableRowRepository(session)
        self.members = WorkspaceMemberRepository(session)
        self.workspaces = WorkspaceService(session)

    async def workspace_member(self, workspace_id: uuid.UUID, user: User) -> WorkspaceMember:
        _workspace, member = await self.workspaces.get_workspace_for_user(workspace_id, user.id)
        return member

    async def table_for_user(self, table_id: uuid.UUID, user: User) -> tuple[WorkspaceTable, WorkspaceMember]:
        table = await self.tables.get_by_id(table_id)
        if table is None:
            raise _not_found()
        member = await self.members.get(table.workspace_id, user.id)
        if member is None:
            raise _not_found()
        return table, member


class TableService:
    def __init__(self, session: AsyncSession) -> None:
        self.access = TableAccess(session)
        self.tables = self.access.tables

    async def list_for_workspace(self, workspace_id: uuid.UUID, user: User) -> list[tuple[WorkspaceTable, int, int]]:
        await self.access.workspace_member(workspace_id, user)
        return await self.tables.list_for_workspace(workspace_id)

    async def create(self, workspace_id: uuid.UUID, user: User, *, name: str, object_type: str, description: str | None) -> WorkspaceTable:
        member = await self.access.workspace_member(workspace_id, user)
        require_workspace_write(member)
        table = await self.tables.create(
            workspace_id=workspace_id,
            created_by=user.id,
            name=name.strip(),
            object_type=normalize_object_type(object_type),
            description=description,
        )
        logger.info("table created table_id=%s workspace_id=%s user_id=%s", table.id, workspace_id, user.id)
        return table

    async def get(self, table_id: uuid.UUID, user: User) -> tuple[WorkspaceTable, list[TableColumn], int, int]:
        table, _member = await self.access.table_for_user(table_id, user)
        columns = await self.access.columns.list_for_table(table.id)
        column_count, row_count = await self.tables.counts(table.id)
        return table, columns, column_count, row_count

    async def update(self, table_id: uuid.UUID, user: User, *, name: str | None, description: str | None) -> WorkspaceTable:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        return await self.tables.update(table, name=name.strip() if name is not None else None, description=description)

    async def delete(self, table_id: uuid.UUID, user: User) -> None:
        table, member = await self.access.table_for_user(table_id, user)
        require_delete_table(member)
        require_table_write(table, member)
        logger.info("table deleted table_id=%s workspace_id=%s user_id=%s", table.id, table.workspace_id, user.id)
        await self.tables.delete(table)


class ColumnService:
    def __init__(self, session: AsyncSession) -> None:
        self.access = TableAccess(session)

    async def list_for_table(self, table_id: uuid.UUID, user: User) -> list[TableColumn]:
        table, _member = await self.access.table_for_user(table_id, user)
        return await self.access.columns.list_for_table(table.id)

    async def create(self, table_id: uuid.UUID, user: User, *, name: str, type: str, config: dict[str, Any]) -> TableColumn:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        column_type = validate_column_type(type)
        if not isinstance(config, dict):
            raise AppError("INVALID_REQUEST", "config must be an object", status_code=400)
        if OUTPUT_CONFIG_KEY in config:
            raise AppError("INVALID_REQUEST", "Используйте публикацию отчёта для создания столбцов анализа.", 400)
        if column_type == "enrichment":
            from app.services.enrichment import EnrichmentService

            existing = await self.access.columns.list_for_table(table.id)
            config = EnrichmentService(self.access.session).validate_config_payload(config, existing, table)
        position = await self.access.columns.max_position(table.id) + 1
        column = await self.access.columns.create(
            table_id=table.id,
            name=name.strip(),
            type=column_type,
            position=position,
            config=config,
        )
        await self.access.tables.touch(table)
        return column

    async def update(
        self,
        table_id: uuid.UUID,
        column_id: uuid.UUID,
        user: User,
        *,
        name: str | None,
        config: dict[str, Any] | None,
    ) -> TableColumn:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        column = await self.access.columns.get_by_id(column_id)
        if column is None or column.table_id != table.id:
            raise _column_not_found()
        if config is not None and not isinstance(config, dict):
            raise AppError("INVALID_REQUEST", "config must be an object", status_code=400)
        if config is not None:
            config = {key: value for key, value in config.items() if key != OUTPUT_CONFIG_KEY}
            if OUTPUT_CONFIG_KEY in column.config:
                config[OUTPUT_CONFIG_KEY] = column.config[OUTPUT_CONFIG_KEY]
        updated = await self.access.columns.update(
            column,
            name=name.strip() if name is not None else None,
            config=config,
        )
        await self.access.tables.touch(table)
        return updated

    async def delete(self, table_id: uuid.UUID, column_id: uuid.UUID, user: User) -> None:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        column = await self.access.columns.get_by_id(column_id)
        if column is None or column.table_id != table.id:
            raise _column_not_found()
        await self.access.rows.drop_column_key(table.id, column.id, utc_now())
        await self.access.columns.delete(column)
        await self.access.tables.touch(table)

    async def reorder(self, table_id: uuid.UUID, user: User, column_ids: list[uuid.UUID]) -> list[TableColumn]:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        existing = await self.access.columns.list_for_table(table.id)
        existing_ids = {column.id for column in existing}
        if len(column_ids) != len(set(column_ids)):
            raise AppError("INVALID_COLUMN_ORDER", "Duplicate column ids", status_code=400)
        if set(column_ids) != existing_ids:
            raise AppError("INVALID_COLUMN_ORDER", "column_ids must include every column exactly once", status_code=400)
        await self.access.columns.reorder(table.id, column_ids)
        await self.access.tables.touch(table)
        return await self.access.columns.list_for_table(table.id)


class RowService:
    def __init__(self, session: AsyncSession) -> None:
        self.access = TableAccess(session)

    async def list_for_table(
        self,
        table_id: uuid.UUID,
        user: User,
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[TableRow], int, list[TableColumn]]:
        table, _member = await self.access.table_for_user(table_id, user)
        safe_limit = min(max(limit, 1), MAX_ROW_LIMIT)
        safe_offset = max(offset, 0)
        columns = await self.access.columns.list_for_table(table.id)
        rows, total = await self.access.rows.list_for_table(table.id, limit=safe_limit, offset=safe_offset)
        for row in rows:
            row.data = public_row_data(columns, row.data)
        return rows, total, columns

    async def get(self, table_id: uuid.UUID, row_id: uuid.UUID, user: User) -> RowRead:
        table, _member = await self.access.table_for_user(table_id, user)
        row = await self.access.rows.get_by_id(row_id)
        if row is None or row.table_id != table.id:
            raise _row_not_found()
        columns = await self.access.columns.list_for_table(table.id)
        return RowRead.model_validate(row).model_copy(update={"data": public_row_data(columns, row.data)})

    async def create(self, table_id: uuid.UUID, user: User, data: dict[str, Any]) -> TableRow:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        columns = await self.access.columns.list_for_table(table.id)
        cleaned = validate_row_data(columns, data or {})
        position = await self.access.rows.max_position(table.id) + 1
        row = await self.access.rows.create(table_id=table.id, position=position, data=cleaned)
        await self.access.tables.touch(table)
        row.data = public_row_data(columns, row.data)
        return row

    async def update(self, table_id: uuid.UUID, row_id: uuid.UUID, user: User, patch: dict[str, Any]) -> TableRow:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        row = await self.access.rows.get_by_id(row_id)
        if row is None or row.table_id != table.id:
            raise _row_not_found()
        columns = await self.access.columns.list_for_table(table.id)
        incoming = validate_row_data(columns, patch)
        merged = dict(row.data or {})
        for key, value in incoming.items():
            if value is None:
                merged.pop(key, None)
            else:
                merged[key] = value
        row.data = merged
        flag_modified(row, "data")
        updated = await self.access.rows.update(row, merged)
        await self.access.tables.touch(table)
        updated.data = public_row_data(columns, updated.data)
        return updated

    async def delete(self, table_id: uuid.UUID, row_id: uuid.UUID, user: User) -> None:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        row = await self.access.rows.get_by_id(row_id)
        if row is None or row.table_id != table.id:
            raise _row_not_found()
        await self.access.rows.delete(row)
        await self.access.tables.touch(table)

    async def bulk_delete(self, table_id: uuid.UUID, user: User, row_ids: list[uuid.UUID]) -> int:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        unique_ids = list(dict.fromkeys(row_ids))
        deleted = await self.access.rows.delete_many(table.id, unique_ids)
        if deleted != len(unique_ids):
            raise _row_not_found()
        await self.access.tables.touch(table)
        return deleted
