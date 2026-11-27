"""Store assistant threads and their turns."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010_assistant_history"
down_revision = "0009_relationship_datasets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_threads",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_assistant_threads_owner_updated", "assistant_threads", ["workspace_id", "user_id", "updated_at"])
    op.create_table(
        "assistant_turns",
        sa.Column("thread_id", sa.Uuid(), sa.ForeignKey("assistant_threads.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("model", sa.String(200), nullable=True),
        sa.Column("search_tables", sa.Boolean(), nullable=False),
        sa.Column("table_id", sa.Uuid(), nullable=True),
        sa.Column("sources", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_assistant_turns_thread_created", "assistant_turns", ["thread_id", "created_at", "id"])
    op.execute("""
        CREATE INDEX ix_table_rows_assistant_search ON table_rows USING gin ((
            jsonb_to_tsvector('simple'::regconfig, data, '["string", "numeric", "boolean"]'::jsonb) ||
            jsonb_to_tsvector('russian'::regconfig, data, '["string", "numeric", "boolean"]'::jsonb)
        ))
    """)


def downgrade() -> None:
    op.drop_index("ix_table_rows_assistant_search", table_name="table_rows")
    op.drop_table("assistant_turns")
    op.drop_table("assistant_threads")
