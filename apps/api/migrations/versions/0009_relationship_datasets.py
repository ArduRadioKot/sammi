"""Link generated relationship tables to their source table."""

import sqlalchemy as sa
from alembic import op

revision = "0009_relationship_datasets"
down_revision = "0008_relationship_refresh"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tables", sa.Column("relationship_source_id", sa.Uuid(), nullable=True))
    op.add_column("tables", sa.Column("relationship_entity", sa.String(24), nullable=True))
    op.create_foreign_key("fk_tables_relationship_source", "tables", "tables",
                          ["relationship_source_id"], ["id"], ondelete="CASCADE")
    op.create_index("ix_tables_relationship_dataset", "tables", ["relationship_source_id", "relationship_entity"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_tables_relationship_dataset", table_name="tables")
    op.drop_constraint("fk_tables_relationship_source", "tables", type_="foreignkey")
    op.drop_column("tables", "relationship_entity")
    op.drop_column("tables", "relationship_source_id")
