"""Schedule rechecks of public feeds.

Revision ID: 0008_relationship_refresh
Revises: 0007_relationship_analysis
"""

import sqlalchemy as sa
from alembic import op

revision = "0008_relationship_refresh"
down_revision = "0007_relationship_analysis"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("relationship_analysis_runs", sa.Column("refresh_hours", sa.Integer(), nullable=True))
    op.add_column("relationship_analysis_runs", sa.Column("next_refresh_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_relationship_analysis_runs_next_refresh_at", "relationship_analysis_runs", ["next_refresh_at"])


def downgrade() -> None:
    op.drop_index("ix_relationship_analysis_runs_next_refresh_at", table_name="relationship_analysis_runs")
    op.drop_column("relationship_analysis_runs", "next_refresh_at")
    op.drop_column("relationship_analysis_runs", "refresh_hours")
