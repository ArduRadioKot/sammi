import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class EnrichmentFieldRead(BaseModel):
    id: str
    label: str


class EnrichmentOperationRead(BaseModel):
    id: str
    label: str
    inputs: list[str]
    outputs: list[EnrichmentFieldRead]
    credits_per_success: int


class EnrichmentProviderRead(BaseModel):
    id: str
    name: str
    configured: bool
    available: bool | None = None
    region: str
    operations: list[EnrichmentOperationRead]


class EnrichmentProviderListResponse(BaseModel):
    items: list[EnrichmentProviderRead]


class DaDataCheckRequest(BaseModel):
    query: str = Field(min_length=1, max_length=32)


class DaDataCheckResponse(BaseModel):
    status: str
    configured: bool
    available: bool
    value: Any = None
    data: dict[str, Any] = Field(default_factory=dict)
    error_code: str | None = None
    error_message: str | None = None


class EnrichmentColumnCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    provider_id: str = Field(min_length=1, max_length=64)
    operation: str = Field(min_length=1, max_length=64)
    input_column_id: uuid.UUID
    output_field: str = Field(min_length=1, max_length=64)


class EnrichmentRunCreate(BaseModel):
    column_id: uuid.UUID
    row_ids: list[uuid.UUID] | None = None


class EnrichmentRunRead(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    table_id: uuid.UUID
    target_column_id: uuid.UUID
    provider_id: str
    operation: str
    status: str
    total_rows: int
    processed_rows: int
    success_count: int
    not_found_count: int
    error_count: int
    skipped_count: int
    reserved_credits: int
    charged_credits: int
    config: dict[str, Any]
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EnrichmentRunListResponse(BaseModel):
    items: list[EnrichmentRunRead]
    total: int
    limit: int
    offset: int


class EnrichmentAttemptRead(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    row_id: uuid.UUID
    provider_id: str
    operation: str
    attempt_index: int
    status: str
    input_value: str | None
    normalized_result: dict[str, Any] | None
    provider_metadata: dict[str, Any]
    credits_charged: int
    duration_ms: int | None
    error_code: str | None
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EnrichmentAttemptListResponse(BaseModel):
    items: list[EnrichmentAttemptRead]
    total: int
    limit: int
    offset: int


class CellProvenanceRead(BaseModel):
    id: uuid.UUID
    table_id: uuid.UUID
    row_id: uuid.UUID
    column_id: uuid.UUID
    run_id: uuid.UUID | None
    attempt_id: uuid.UUID | None
    provider_id: str
    operation: str
    source_label: str
    source_url: str | None
    retrieved_at: datetime
    confidence: float | None
    credits_charged: int
    metadata: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
