"""tables columns rows

Revision ID: 0003_tables
Revises: 0002_auth_workspaces
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_tables"
down_revision = "0002_auth_workspaces"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tables",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("object_type", sa.String(length=32), nullable=False, server_default="custom"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], name="fk_tables_workspace_id_workspaces", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], name="fk_tables_created_by_users", ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name="pk_tables"),
    )
    op.create_index("ix_tables_workspace_id", "tables", ["workspace_id"], unique=False)
    op.create_index("ix_tables_created_by", "tables", ["created_by"], unique=False)
    op.create_index("ix_tables_workspace_id_updated_at", "tables", ["workspace_id", "updated_at"], unique=False)

    op.create_table(
        "table_columns",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("table_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["table_id"], ["tables.id"], name="fk_table_columns_table_id_tables", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_table_columns"),
    )
    op.create_index("ix_table_columns_table_id", "table_columns", ["table_id"], unique=False)
    op.create_index("ix_table_columns_table_id_position", "table_columns", ["table_id", "position"], unique=False)

    op.create_table(
        "table_rows",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("table_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.BigInteger(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["table_id"], ["tables.id"], name="fk_table_rows_table_id_tables", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_table_rows"),
    )
    op.create_index("ix_table_rows_table_id", "table_rows", ["table_id"], unique=False)
    op.create_index("ix_table_rows_table_id_position", "table_rows", ["table_id", "position"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_table_rows_table_id_position", table_name="table_rows")
    op.drop_index("ix_table_rows_table_id", table_name="table_rows")
    op.drop_table("table_rows")
    op.drop_index("ix_table_columns_table_id_position", table_name="table_columns")
    op.drop_index("ix_table_columns_table_id", table_name="table_columns")
    op.drop_table("table_columns")
    op.drop_index("ix_tables_workspace_id_updated_at", table_name="tables")
    op.drop_index("ix_tables_created_by", table_name="tables")
    op.drop_index("ix_tables_workspace_id", table_name="tables")
    op.drop_table("tables")
