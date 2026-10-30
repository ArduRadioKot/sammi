"""geocode cache for contact map

Revision ID: 0006_geocode_cache
Revises: 0005_enrichment
Create Date: 2026-10-30
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_geocode_cache"
down_revision = "0005_enrichment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "geocode_cache",
        sa.Column("query_hash", sa.String(length=64), nullable=False),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(length=64), nullable=False, server_default="nominatim"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("query_hash", name="pk_geocode_cache"),
    )


def downgrade() -> None:
    op.drop_table("geocode_cache")
