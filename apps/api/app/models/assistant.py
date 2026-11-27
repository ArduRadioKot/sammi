import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.user import utc_now


class AssistantThread(Base):
    __tablename__ = "assistant_threads"
    __table_args__ = (Index("ix_assistant_threads_owner_updated", "workspace_id", "user_id", "updated_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(160))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AssistantTurn(Base):
    __tablename__ = "assistant_turns"
    __table_args__ = (Index("ix_assistant_turns_thread_created", "thread_id", "created_at", "id"),)

    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assistant_threads.id", ondelete="CASCADE"), primary_key=True)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(String(200))
    search_tables: Mapped[bool] = mapped_column(Boolean)
    table_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    sources: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
