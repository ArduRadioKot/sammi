import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CreditBalanceResponse(BaseModel):
    available: int
    reserved: int
    total: int


class CreditTransactionRead(BaseModel):
    id: uuid.UUID
    type: str
    amount: int
    available_delta: int
    reserved_delta: int
    available_after: int
    reserved_after: int
    reference_type: str | None = None
    reference_id: str | None = None
    description: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CreditTransactionListResponse(BaseModel):
    items: list[CreditTransactionRead]
    total: int
    limit: int
    offset: int


class CreditGrantRequest(BaseModel):
    amount: int = Field(gt=0)
    description: str | None = Field(default=None, max_length=500)
