"""credit accounts and ledger

Revision ID: 0004_credits
Revises: 0003_tables
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_credits"
down_revision = "0003_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credit_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("available_credits", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("reserved_credits", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("available_credits >= 0", name="ck_credit_accounts_available_nonneg"),
        sa.CheckConstraint("reserved_credits >= 0", name="ck_credit_accounts_reserved_nonneg"),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="fk_credit_accounts_workspace_id_workspaces",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_credit_accounts"),
        sa.UniqueConstraint("workspace_id", name="uq_credit_accounts_workspace_id"),
    )

    op.create_table(
        "credit_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("credit_account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.BigInteger(), nullable=False),
        sa.Column("available_delta", sa.BigInteger(), nullable=False),
        sa.Column("reserved_delta", sa.BigInteger(), nullable=False),
        sa.Column("available_after", sa.BigInteger(), nullable=False),
        sa.Column("reserved_after", sa.BigInteger(), nullable=False),
        sa.Column("reference_type", sa.String(length=64), nullable=True),
        sa.Column("reference_id", sa.String(length=64), nullable=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["credit_account_id"],
            ["credit_accounts.id"],
            name="fk_credit_transactions_credit_account_id_credit_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name="fk_credit_transactions_workspace_id_workspaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_credit_transactions_created_by_user_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_credit_transactions"),
    )
    op.create_index("ix_credit_transactions_credit_account_id", "credit_transactions", ["credit_account_id"], unique=False)
    op.create_index("ix_credit_transactions_workspace_id", "credit_transactions", ["workspace_id"], unique=False)
    op.create_index(
        "ix_credit_transactions_workspace_id_created_at",
        "credit_transactions",
        ["workspace_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "uq_credit_transactions_account_idempotency",
        "credit_transactions",
        ["credit_account_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_credit_transactions_account_idempotency", table_name="credit_transactions")
    op.drop_index("ix_credit_transactions_workspace_id_created_at", table_name="credit_transactions")
    op.drop_index("ix_credit_transactions_workspace_id", table_name="credit_transactions")
    op.drop_index("ix_credit_transactions_credit_account_id", table_name="credit_transactions")
    op.drop_table("credit_transactions")
    op.drop_table("credit_accounts")
