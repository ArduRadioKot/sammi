import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TableCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    object_type: str = Field(default="custom", max_length=32)
    description: str | None = None


class TableUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None


class ColumnCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    type: str = Field(min_length=1, max_length=32)
    config: dict[str, Any] = Field(default_factory=dict)


class ColumnUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    config: dict[str, Any] | None = None


class ColumnReorder(BaseModel):
    column_ids: list[uuid.UUID] = Field(min_length=1)


class ColumnRead(BaseModel):
    id: uuid.UUID
    table_id: uuid.UUID
    name: str
    type: str
    position: int
    config: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TableRead(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    created_by: uuid.UUID
    name: str
    description: str | None
    object_type: str
    relationship_source_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    row_count: int
    column_count: int
    columns: list[ColumnRead] | None = None

    model_config = {"from_attributes": True}


class TableListResponse(BaseModel):
    items: list[TableRead]


class ColumnListResponse(BaseModel):
    items: list[ColumnRead]


class RowCreate(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)


class RowUpdate(BaseModel):
    data: dict[str, Any]


class RowRead(BaseModel):
    id: uuid.UUID
    table_id: uuid.UUID
    position: int
    data: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaginatedRows(BaseModel):
    items: list[RowRead]
    total: int
    limit: int
    offset: int


class RowBulkDelete(BaseModel):
    row_ids: list[uuid.UUID] = Field(min_length=1)
