import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Question = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class ArchivedTurn(BaseModel):
    question: Question
    answer: str | None = Field(default=None, max_length=12000)


class AssistantThreadCreate(BaseModel):
    id: uuid.UUID
    first_question: Question
    history: list[ArchivedTurn] = Field(default_factory=list, max_length=30)


class AssistantThreadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    updated_at: datetime


class AssistantThreadList(BaseModel):
    items: list[AssistantThreadRead]
    has_more: bool


class AssistantTurnCreate(BaseModel):
    question: Question
    search_tables: bool = True
    table_id: uuid.UUID | None = None


class AssistantSource(BaseModel):
    table_id: uuid.UUID
    row_id: uuid.UUID | None = None
    label: str


class AssistantTurnRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question: str
    answer: str | None
    model: str | None
    search_tables: bool
    table_id: uuid.UUID | None
    sources: list[AssistantSource]
    created_at: datetime


class AssistantThreadDetail(AssistantThreadRead):
    turns: list[AssistantTurnRead]
