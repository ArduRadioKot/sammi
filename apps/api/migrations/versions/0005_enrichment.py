"""enrichment runs, attempts, cell provenance

Revision ID: 0005_enrichment
Revises: 0004_credits
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_enrichment"
down_revision = "0004_credits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "enrichment_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("table_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_column_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_id", sa.String(length=64), nullable=False),
        sa.Column("operation", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("total_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("success_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("not_found_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reserved_credits", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("charged_credits", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], name="fk_enrichment_runs_workspace_id_workspaces", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["table_id"], ["tables.id"], name="fk_enrichment_runs_table_id_tables", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["target_column_id"],
            ["table_columns.id"],
            name="fk_enrichment_runs_target_column_id_table_columns",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"], ["users.id"], name="fk_enrichment_runs_created_by_user_id_users", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_enrichment_runs"),
    )
    op.create_index("ix_enrichment_runs_workspace_id", "enrichment_runs", ["workspace_id"])
    op.create_index("ix_enrichment_runs_table_id", "enrichment_runs", ["table_id"])
    op.create_index("ix_enrichment_runs_target_column_id", "enrichment_runs", ["target_column_id"])
    op.create_index("ix_enrichment_runs_table_id_created_at", "enrichment_runs", ["table_id", "created_at"])
    op.create_index("ix_enrichment_runs_workspace_id_created_at", "enrichment_runs", ["workspace_id", "created_at"])
    op.create_index(
        "uq_enrichment_runs_workspace_idempotency",
        "enrichment_runs",
        ["workspace_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    op.create_table(
        "enrichment_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("row_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_id", sa.String(length=64), nullable=False),
        sa.Column("operation", sa.String(length=64), nullable=False),
        sa.Column("attempt_index", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("input_value", sa.Text(), nullable=True),
        sa.Column("normalized_result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "provider_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("credits_charged", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["run_id"], ["enrichment_runs.id"], name="fk_enrichment_attempts_run_id_enrichment_runs", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["row_id"], ["table_rows.id"], name="fk_enrichment_attempts_row_id_table_rows", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_enrichment_attempts"),
    )
    op.create_index("ix_enrichment_attempts_run_id", "enrichment_attempts", ["run_id"])
    op.create_index("ix_enrichment_attempts_row_id", "enrichment_attempts", ["row_id"])

    op.create_table(
        "cell_provenance",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("table_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("row_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("column_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("attempt_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("provider_id", sa.String(length=64), nullable=False),
        sa.Column("operation", sa.String(length=64), nullable=False),
        sa.Column("source_label", sa.String(length=128), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("credits_charged", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["table_id"], ["tables.id"], name="fk_cell_provenance_table_id_tables", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["row_id"], ["table_rows.id"], name="fk_cell_provenance_row_id_table_rows", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["column_id"], ["table_columns.id"], name="fk_cell_provenance_column_id_table_columns", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["run_id"], ["enrichment_runs.id"], name="fk_cell_provenance_run_id_enrichment_runs", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"],
            ["enrichment_attempts.id"],
            name="fk_cell_provenance_attempt_id_enrichment_attempts",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cell_provenance"),
        sa.UniqueConstraint("row_id", "column_id", name="uq_cell_provenance_row_column"),
    )
    op.create_index("ix_cell_provenance_table_id", "cell_provenance", ["table_id"])
    op.create_index("ix_cell_provenance_row_id_column_id", "cell_provenance", ["row_id", "column_id"])


def downgrade() -> None:
    op.drop_index("ix_cell_provenance_row_id_column_id", table_name="cell_provenance")
    op.drop_index("ix_cell_provenance_table_id", table_name="cell_provenance")
    op.drop_table("cell_provenance")
    op.drop_index("ix_enrichment_attempts_row_id", table_name="enrichment_attempts")
    op.drop_index("ix_enrichment_attempts_run_id", table_name="enrichment_attempts")
    op.drop_table("enrichment_attempts")
    op.drop_index("uq_enrichment_runs_workspace_idempotency", table_name="enrichment_runs")
    op.drop_index("ix_enrichment_runs_workspace_id_created_at", table_name="enrichment_runs")
    op.drop_index("ix_enrichment_runs_table_id_created_at", table_name="enrichment_runs")
    op.drop_index("ix_enrichment_runs_target_column_id", table_name="enrichment_runs")
    op.drop_index("ix_enrichment_runs_table_id", table_name="enrichment_runs")
    op.drop_index("ix_enrichment_runs_workspace_id", table_name="enrichment_runs")
    op.drop_table("enrichment_runs")
