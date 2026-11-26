"""Persist local relationship analysis and background progress.

Revision ID: 0007_relationship_analysis
Revises: 0006_geocode_cache
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_relationship_analysis"
down_revision = "0006_geocode_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "relationship_analysis_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("table_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tables.id", ondelete="CASCADE"),
                  unique=True, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("table_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_token", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("error", sa.String(80), nullable=True),
        sa.Column("column_mapping", postgresql.JSONB(), nullable=False),
        sa.Column("corpus", postgresql.JSONB(), nullable=False),
        sa.Column("report", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("relationship_analysis_runs")
