from __future__ import annotations

import csv
import io
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from urllib.parse import quote
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.logging import get_logger
from app.models.user import User
from app.repositories.table import TableRowRepository
from app.services.csv.types import normalize_delimiter
from app.services.table import TableAccess

logger = get_logger("app.csv")

FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
EXPORT_CHUNK = 500


@dataclass(frozen=True)
class ExportColumn:
    id: str
    name: str
    type: str


@dataclass(frozen=True)
class ExportSpec:
    table_id: UUID
    name: str
    columns: list[ExportColumn]


def sanitize_export_filename(name: str) -> str:
    base = re.sub(r"[\\/]+", "", name).strip() or "table"
    base = re.sub(r"[\x00-\x1f]+", "", base)
    base = base[:80].rstrip(". ")
    if not base:
        base = "table"
    if not base.lower().endswith(".csv"):
        base = f"{base}.csv"
    return base


def content_disposition(filename: str) -> str:
    ascii_name = re.sub(r"[^A-Za-z0-9._-]+", "_", filename) or "table.csv"
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"


def format_export_value(value, *, column_type: str, safe: bool) -> str:
    if value is None:
        return ""
    if column_type == "boolean":
        text = "true" if value is True else "false" if value is False else str(value)
        return text
    if column_type == "number":
        return str(value)
    if column_type == "date":
        text = str(value)[:10]
    else:
        text = str(value)
    if safe and _looks_like_formula(text):
        return f"'{text}"
    return text


def _looks_like_formula(value: str) -> bool:
    return bool(value) and value[0] in FORMULA_PREFIXES


class CsvExportService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.access = TableAccess(session)

    async def prepare(self, table_id: UUID, user: User) -> ExportSpec:
        table, _member = await self.access.table_for_user(table_id, user)
        columns = await self.access.columns.list_for_table(table.id)
        return ExportSpec(
            table_id=table.id,
            name=table.name,
            columns=[ExportColumn(id=str(column.id), name=column.name, type=column.type) for column in columns],
        )


async def stream_csv(
    session: AsyncSession,
    spec: ExportSpec,
    *,
    delimiter: str,
    include_bom: bool,
    safe_for_spreadsheets: bool,
) -> AsyncIterator[bytes]:
    try:
        delim = normalize_delimiter(delimiter) or ","
    except ValueError as exc:
        raise AppError("CSV_EXPORT_FAILED", "Unsupported export delimiter", status_code=400) from exc
    if include_bom:
        yield b"\xef\xbb\xbf"

    def dump_row(values: list[str]) -> bytes:
        buffer = io.StringIO()
        writer = csv.writer(buffer, delimiter=delim, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(values)
        return buffer.getvalue().encode("utf-8")

    yield dump_row([column.name for column in spec.columns])
    repo = TableRowRepository(session)
    async for chunk in repo.iterate_chunks(spec.table_id, chunk_size=EXPORT_CHUNK):
        for row in chunk:
            data = row.data or {}
            values = [
                format_export_value(data.get(column.id), column_type=column.type, safe=safe_for_spreadsheets)
                for column in spec.columns
            ]
            yield dump_row(values)
