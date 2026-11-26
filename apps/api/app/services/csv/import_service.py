from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.models.table import TableColumn, TableRow, WorkspaceTable
from app.models.user import User
from app.services.csv.parser import BOOL_FALSE, BOOL_TRUE, NUMBER_RE, RU_DATE_RE, parse_csv, suggested_table_name
from app.services.csv.types import (
    CSV_CREATE_TYPES,
    ImportPlan,
    ImportResult,
    MappingColumn,
    ParsedCsv,
    delimiter_label,
)
from app.services.table import (
    TableAccess,
    normalize_object_type,
    require_workspace_write,
    require_table_write,
    validate_cell_value,
    validate_column_type,
)

logger = get_logger("app.csv")

BULK_CHUNK = 500
MAX_VALIDATION_ERRORS = 50
MAX_ERROR_VALUE_LEN = 80


@dataclass
class ResolvedTarget:
    csv_index: int
    action: str
    name: str
    column_type: str
    column: TableColumn | None = None
    create_order: int | None = None


class CsvImportService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.access = TableAccess(session)
        self.settings = get_settings()

    async def preview_workspace(
        self,
        workspace_id: uuid.UUID,
        user: User,
        data: bytes,
        filename: str | None,
        delimiter: str | None,
    ) -> dict:
        await self.access.workspace_member(workspace_id, user)
        return self._preview_payload(self.parse_file(data, filename, delimiter))

    async def preview_table(
        self,
        table_id: uuid.UUID,
        user: User,
        data: bytes,
        filename: str | None,
        delimiter: str | None,
    ) -> dict:
        table, _member = await self.access.table_for_user(table_id, user)
        payload = self._preview_payload(self.parse_file(data, filename, delimiter))
        columns = await self.access.columns.list_for_table(table.id)
        payload["existing_columns"] = [
            {"id": str(column.id), "name": column.name, "type": column.type} for column in columns
        ]
        return payload

    def parse_file(self, data: bytes, filename: str | None, delimiter: str | None) -> ParsedCsv:
        max_bytes = self.settings.csv_max_file_size_mb * 1024 * 1024
        if len(data) > max_bytes:
            raise AppError(
                "CSV_FILE_TOO_LARGE",
                f"CSV exceeds {self.settings.csv_max_file_size_mb} MB",
                status_code=400,
            )
        return parse_csv(
            data,
            filename=filename,
            delimiter=delimiter,
            max_rows=self.settings.csv_max_rows,
            preview_rows=self.settings.csv_preview_rows,
        )

    def _preview_payload(self, parsed: ParsedCsv) -> dict:
        return {
            "filename": parsed.filename,
            "encoding": parsed.encoding,
            "delimiter": delimiter_label(parsed.delimiter),
            "file_signature": parsed.signature,
            "row_count": parsed.row_count,
            "suggested_table_name": suggested_table_name(parsed.filename),
            "headers": [
                {"index": header.index, "name": header.name, "suggested_type": header.suggested_type}
                for header in parsed.headers
            ],
            "sample_rows": parsed.rows[: self.settings.csv_preview_rows],
            "warnings": parsed.warnings,
        }

    async def import_new_table(
        self,
        workspace_id: uuid.UUID,
        user: User,
        data: bytes,
        filename: str | None,
        mapping_json: str,
        options_json: str | None,
        delimiter: str | None,
        request_id: str | None = None,
    ) -> ImportResult:
        member = await self.access.workspace_member(workspace_id, user)
        require_workspace_write(member)
        started = time.perf_counter()
        parsed: ParsedCsv | None = None
        try:
            options = _parse_options(options_json)
            parsed = self._parse_verified(data, filename, delimiter or options.get("delimiter"), options)
            plan = _parse_mapping(mapping_json, len(parsed.headers))
            name = (options.get("table_name") or suggested_table_name(parsed.filename)).strip()
            if not name:
                raise AppError("CSV_MAPPING_INVALID", "Table name is required", status_code=400)
            object_type = normalize_object_type(str(options.get("object_type") or "custom"))
            targets = _resolve_targets(parsed, plan, [])
            row_payloads = _validate_rows(parsed, targets)
            table = await self.access.tables.create(
                workspace_id=workspace_id,
                created_by=user.id,
                name=name[:200],
                object_type=object_type,
            )
            created = await self._create_columns(table, targets)
            await self._persist_rows(table, row_payloads, targets, created)
            await self.access.tables.touch(table)
            result = _result(table, plan, parsed.row_count, len(created))
            result.analyze_relationships = options.get("analyze_relationships", False) is True
            self._log(True, request_id, user.id, workspace_id, table.id, parsed, time.perf_counter() - started)
            return result
        except AppError:
            self._log(False, request_id, user.id, workspace_id, None, parsed, time.perf_counter() - started, filename)
            raise
        except Exception as exc:
            self._log(False, request_id, user.id, workspace_id, None, parsed, time.perf_counter() - started, filename)
            raise AppError("CSV_IMPORT_FAILED", "CSV import failed", status_code=500) from exc

    async def import_existing_table(
        self,
        table_id: uuid.UUID,
        user: User,
        data: bytes,
        filename: str | None,
        mapping_json: str,
        options_json: str | None,
        delimiter: str | None,
        request_id: str | None = None,
    ) -> ImportResult:
        table, member = await self.access.table_for_user(table_id, user)
        require_table_write(table, member)
        started = time.perf_counter()
        parsed: ParsedCsv | None = None
        try:
            options = _parse_options(options_json)
            parsed = self._parse_verified(data, filename, delimiter or options.get("delimiter"), options)
            plan = _parse_mapping(mapping_json, len(parsed.headers))
            existing = await self.access.columns.list_for_table(table.id)
            targets = _resolve_targets(parsed, plan, existing)
            row_payloads = _validate_rows(parsed, targets)
            created = await self._create_columns(table, targets)
            await self._persist_rows(table, row_payloads, targets, created)
            await self.access.tables.touch(table)
            result = _result(table, plan, parsed.row_count, len(existing) + len(created))
            self._log(
                True, request_id, user.id, table.workspace_id, table.id, parsed, time.perf_counter() - started
            )
            return result
        except AppError:
            self._log(
                False, request_id, user.id, table.workspace_id, table.id, parsed, time.perf_counter() - started, filename
            )
            raise
        except Exception as exc:
            self._log(
                False, request_id, user.id, table.workspace_id, table.id, parsed, time.perf_counter() - started, filename
            )
            raise AppError("CSV_IMPORT_FAILED", "CSV import failed", status_code=500) from exc

    def _parse_verified(
        self,
        data: bytes,
        filename: str | None,
        delimiter: str | None,
        options: dict,
    ) -> ParsedCsv:
        parsed = self.parse_file(data, filename, delimiter)
        expected = options.get("file_signature")
        if not expected or expected != parsed.signature:
            raise AppError("CSV_FILE_CHANGED", "CSV file changed between preview and import", status_code=400)
        return parsed

    async def _create_columns(self, table: WorkspaceTable, targets: list[ResolvedTarget]) -> list[TableColumn]:
        created: list[TableColumn] = []
        position = await self.access.columns.max_position(table.id)
        for target in targets:
            if target.action != "create":
                continue
            position += 1
            column = await self.access.columns.create(
                table_id=table.id,
                name=target.name[:200],
                type=validate_column_type(target.column_type),
                position=position,
                config={},
            )
            target.column = column
            created.append(column)
        return created

    async def _persist_rows(
        self,
        table: WorkspaceTable,
        row_payloads: list[dict],
        targets: list[ResolvedTarget],
        created: list[TableColumn],
    ) -> None:
        del created
        mapped_rows = _assign_column_ids(row_payloads, targets)
        start = await self.access.rows.max_position(table.id)
        for offset in range(0, len(mapped_rows), BULK_CHUNK):
            chunk = mapped_rows[offset : offset + BULK_CHUNK]
            rows = [
                TableRow(table_id=table.id, position=start + offset + index + 1, data=data)
                for index, data in enumerate(chunk)
            ]
            await self.access.rows.insert_many(rows)

    def _log(
        self,
        success: bool,
        request_id: str | None,
        user_id: uuid.UUID,
        workspace_id: uuid.UUID | None,
        table_id: uuid.UUID | None,
        parsed: ParsedCsv | None,
        duration: float,
        filename: str | None = None,
    ) -> None:
        logger.info(
            "csv_import %s request_id=%s user_id=%s workspace_id=%s table_id=%s filename=%s columns=%s rows_processed=%s duration_ms=%.1f",
            "success" if success else "failure",
            request_id,
            user_id,
            workspace_id,
            table_id,
            parsed.filename if parsed else (filename or "upload.csv"),
            len(parsed.headers) if parsed else 0,
            parsed.row_count if parsed else 0,
            duration * 1000,
        )


def _assign_column_ids(row_payloads: list[dict], targets: list[ResolvedTarget]) -> list[dict]:
    mapped: list[dict] = []
    for payload in row_payloads:
        data: dict[str, object] = {}
        for target in targets:
            if target.action == "skip" or target.column is None:
                continue
            key = _target_key(target)
            if key in payload and payload[key] is not None:
                data[str(target.column.id)] = payload[key]
        mapped.append(data)
    return mapped


def _target_key(target: ResolvedTarget) -> int:
    if target.action == "create":
        return int(target.create_order or 0)
    return target.csv_index + 10000


def _resolve_targets(parsed: ParsedCsv, plan: ImportPlan, existing: list[TableColumn]) -> list[ResolvedTarget]:
    by_id = {column.id: column for column in existing}
    targets: list[ResolvedTarget] = []
    create_order = 0
    for item in plan.columns:
        header_name = parsed.headers[item.csv_index].name
        if item.action == "skip":
            targets.append(ResolvedTarget(item.csv_index, "skip", header_name, "text"))
            continue
        if item.action == "existing":
            try:
                column_id = uuid.UUID(item.column_id or "")
            except ValueError as exc:
                raise AppError("CSV_MAPPING_INVALID", f"Invalid column_id for csv_index {item.csv_index}", status_code=400) from exc
            column = by_id.get(column_id)
            if column is None:
                raise AppError("CSV_MAPPING_INVALID", f"Unknown column_id for csv_index {item.csv_index}", status_code=400)
            targets.append(
                ResolvedTarget(item.csv_index, "existing", column.name, column.type, column=column)
            )
            continue
        targets.append(
            ResolvedTarget(
                item.csv_index,
                "create",
                (item.name or header_name).strip(),
                item.type or "text",
                create_order=create_order,
            )
        )
        create_order += 1
    return targets


def _validate_rows(parsed: ParsedCsv, targets: list[ResolvedTarget]) -> list[dict]:
    errors: list[dict] = []
    payloads: list[dict] = []
    dummy_id = uuid.uuid4()
    for row_index, raw_row in enumerate(parsed.rows):
        csv_row_number = row_index + 2
        data: dict = {}
        row_failed = False
        for target in targets:
            if target.action == "skip":
                continue
            cell = raw_row[target.csv_index] if target.csv_index < len(raw_row) else ""
            try:
                coerced = coerce_csv_value(target.column_type, cell)
                probe = target.column or TableColumn(
                    id=dummy_id,
                    table_id=dummy_id,
                    name=target.name,
                    type=target.column_type,
                    position=0,
                    config={},
                )
                coerced = validate_cell_value(probe, coerced)
            except AppError as exc:
                row_failed = True
                errors.append(
                    {
                        "row": csv_row_number,
                        "column": target.name,
                        "value": _truncate(str(cell)),
                        "reason": exc.message if exc.code == "INVALID_CELL_VALUE" else _reason_for_type(target.column_type),
                    }
                )
                continue
            data[_target_key(target)] = coerced
        if not row_failed:
            payloads.append(data)
    if errors:
        raise AppError(
            "CSV_VALIDATION_FAILED",
            "CSV contains invalid values",
            status_code=400,
            details={"total_errors": len(errors), "items": errors[:MAX_VALIDATION_ERRORS]},
        )
    return payloads


def _reason_for_type(column_type: str) -> str:
    labels = {
        "number": "Expected number",
        "boolean": "Expected boolean",
        "date": "Expected date",
        "email": "Expected email",
        "url": "Expected url",
        "phone": "Expected phone",
    }
    return labels.get(column_type, "Invalid value")


def _truncate(value: str) -> str:
    if len(value) <= MAX_ERROR_VALUE_LEN:
        return value
    return value[: MAX_ERROR_VALUE_LEN - 1] + "…"


def _parse_options(raw: str | None) -> dict:
    if not raw or not raw.strip():
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AppError("CSV_MAPPING_INVALID", "options_json is not valid JSON", status_code=400) from exc
    if not isinstance(payload, dict):
        raise AppError("CSV_MAPPING_INVALID", "options_json must be an object", status_code=400)
    return payload


def _parse_mapping(raw: str, header_count: int) -> ImportPlan:
    if not raw or not raw.strip():
        raise AppError("CSV_MAPPING_INVALID", "mapping_json is required", status_code=400)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AppError("CSV_MAPPING_INVALID", "mapping_json is not valid JSON", status_code=400) from exc
    columns = payload.get("columns") if isinstance(payload, dict) else None
    if not isinstance(columns, list) or not columns:
        raise AppError("CSV_MAPPING_INVALID", "mapping.columns is required", status_code=400)
    seen: set[int] = set()
    mapped: list[MappingColumn] = []
    for item in columns:
        if not isinstance(item, dict):
            raise AppError("CSV_MAPPING_INVALID", "Each mapping item must be an object", status_code=400)
        try:
            csv_index = int(item.get("csv_index"))
        except (TypeError, ValueError) as exc:
            raise AppError("CSV_MAPPING_INVALID", "csv_index must be an integer", status_code=400) from exc
        if csv_index in seen:
            raise AppError("CSV_MAPPING_INVALID", f"Duplicate csv_index {csv_index}", status_code=400)
        if csv_index < 0 or csv_index >= header_count:
            raise AppError("CSV_MAPPING_INVALID", f"csv_index {csv_index} is out of range", status_code=400)
        seen.add(csv_index)
        action = str(item.get("action") or "")
        if action not in {"create", "existing", "skip"}:
            raise AppError("CSV_MAPPING_INVALID", f"Unsupported mapping action: {action}", status_code=400)
        name = item.get("name")
        column_type = item.get("type")
        column_id = item.get("column_id")
        if action == "create":
            if not isinstance(name, str) or not name.strip():
                raise AppError("CSV_MAPPING_INVALID", f"Name is required for csv_index {csv_index}", status_code=400)
            if column_type not in CSV_CREATE_TYPES:
                raise AppError(
                    "CSV_MAPPING_INVALID", f"Unsupported column type for csv_index {csv_index}", status_code=400
                )
        if action == "existing" and not column_id:
            raise AppError("CSV_MAPPING_INVALID", f"column_id is required for csv_index {csv_index}", status_code=400)
        mapped.append(
            MappingColumn(
                csv_index=csv_index,
                action=action,
                name=name.strip() if isinstance(name, str) else None,
                type=column_type if isinstance(column_type, str) else None,
                column_id=str(column_id) if column_id else None,
            )
        )
    if len(seen) != header_count:
        raise AppError("CSV_MAPPING_INVALID", "Mapping must include every CSV column exactly once", status_code=400)
    mapped.sort(key=lambda item: item.csv_index)
    return ImportPlan(columns=mapped)


def coerce_csv_value(column_type: str, raw: str | None):
    if raw is None:
        return None
    value = str(raw).strip()
    if value == "":
        return None
    if column_type == "boolean":
        lowered = value.lower()
        if lowered in BOOL_TRUE:
            return True
        if lowered in BOOL_FALSE:
            return False
        raise AppError("INVALID_CELL_VALUE", "Expected boolean", status_code=400)
    if column_type == "number":
        if not NUMBER_RE.match(value):
            raise AppError("INVALID_CELL_VALUE", "Expected number", status_code=400)
        return float(value) if "." in value else int(value)
    if column_type == "date":
        iso = _normalize_date(value)
        if iso is None:
            raise AppError("INVALID_CELL_VALUE", "Expected date", status_code=400)
        return iso
    return value


def _normalize_date(value: str) -> str | None:
    try:
        if len(value) == 10:
            return date.fromisoformat(value).isoformat()
        return datetime.fromisoformat(value).isoformat()
    except ValueError:
        pass
    match = RU_DATE_RE.match(value)
    if not match:
        return None
    day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def _result(table: WorkspaceTable, plan: ImportPlan, rows_imported: int, column_count: int) -> ImportResult:
    return ImportResult(
        table_id=table.id,
        table_name=table.name,
        rows_imported=rows_imported,
        columns_created=sum(1 for item in plan.columns if item.action == "create"),
        columns_mapped=sum(1 for item in plan.columns if item.action == "existing"),
        columns_skipped=sum(1 for item in plan.columns if item.action == "skip"),
        column_count=column_count,
    )
