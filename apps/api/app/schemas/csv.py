import uuid
from typing import Any

from pydantic import BaseModel, Field


class CsvPreviewHeader(BaseModel):
    index: int
    name: str
    suggested_type: str


class CsvExistingColumn(BaseModel):
    id: uuid.UUID
    name: str
    type: str


class CsvPreviewResponse(BaseModel):
    filename: str
    encoding: str
    delimiter: str
    file_signature: str
    row_count: int
    suggested_table_name: str
    headers: list[CsvPreviewHeader]
    sample_rows: list[list[str]]
    warnings: list[str] = Field(default_factory=list)
    existing_columns: list[CsvExistingColumn] | None = None


class CsvImportResponse(BaseModel):
    table_id: uuid.UUID
    table_name: str
    rows_imported: int
    columns_created: int
    columns_mapped: int
    columns_skipped: int
    column_count: int
    analysis_started: bool = False
    analysis_error: str | None = None
    details: dict[str, Any] | None = None
