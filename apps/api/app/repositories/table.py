import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.table import TableColumn, TableRow, WorkspaceTable
from app.models.user import utc_now


class TableRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(
        self,
        *,
        workspace_id: uuid.UUID,
        created_by: uuid.UUID,
        name: str,
        object_type: str,
        description: str | None = None,
    ) -> WorkspaceTable:
        table = WorkspaceTable(
            workspace_id=workspace_id,
            created_by=created_by,
            name=name,
            object_type=object_type,
            description=description,
        )
        self.session.add(table)
        await self.session.flush()
        return table

    async def get_by_id(self, table_id: uuid.UUID) -> WorkspaceTable | None:
        return await self.session.get(WorkspaceTable, table_id)

    async def list_for_workspace(self, workspace_id: uuid.UUID) -> list[tuple[WorkspaceTable, int, int]]:
        column_count = (
            select(func.count(TableColumn.id))
            .where(TableColumn.table_id == WorkspaceTable.id)
            .correlate(WorkspaceTable)
            .scalar_subquery()
        )
        row_count = (
            select(func.count(TableRow.id))
            .where(TableRow.table_id == WorkspaceTable.id)
            .correlate(WorkspaceTable)
            .scalar_subquery()
        )
        result = await self.session.execute(
            select(WorkspaceTable, column_count, row_count)
            .where(WorkspaceTable.workspace_id == workspace_id)
            .order_by(WorkspaceTable.updated_at.desc())
        )
        return [(row[0], int(row[1] or 0), int(row[2] or 0)) for row in result.all()]

    async def counts(self, table_id: uuid.UUID) -> tuple[int, int]:
        columns = await self.session.scalar(
            select(func.count()).select_from(TableColumn).where(TableColumn.table_id == table_id)
        )
        rows = await self.session.scalar(
            select(func.count()).select_from(TableRow).where(TableRow.table_id == table_id)
        )
        return int(columns or 0), int(rows or 0)

    async def update(
        self,
        table: WorkspaceTable,
        *,
        name: str | None = None,
        description: str | None = None,
    ) -> WorkspaceTable:
        if name is not None:
            table.name = name
        if description is not None:
            table.description = description
        table.updated_at = utc_now()
        await self.session.flush()
        return table

    async def touch(self, table: WorkspaceTable) -> None:
        table.updated_at = utc_now()
        await self.session.flush()

    async def delete(self, table: WorkspaceTable) -> None:
        await self.session.delete(table)
        await self.session.flush()


class TableColumnRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_for_table(self, table_id: uuid.UUID) -> list[TableColumn]:
        result = await self.session.execute(
            select(TableColumn).where(TableColumn.table_id == table_id).order_by(TableColumn.position.asc())
        )
        return list(result.scalars().all())

    async def get_by_id(self, column_id: uuid.UUID) -> TableColumn | None:
        return await self.session.get(TableColumn, column_id)

    async def max_position(self, table_id: uuid.UUID) -> int:
        value = await self.session.scalar(
            select(func.max(TableColumn.position)).where(TableColumn.table_id == table_id)
        )
        return int(value or 0)

    async def create(
        self,
        *,
        table_id: uuid.UUID,
        name: str,
        type: str,
        position: int,
        config: dict[str, Any],
    ) -> TableColumn:
        column = TableColumn(
            table_id=table_id,
            name=name,
            type=type,
            position=position,
            config=config,
        )
        self.session.add(column)
        await self.session.flush()
        return column

    async def update(
        self,
        column: TableColumn,
        *,
        name: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> TableColumn:
        if name is not None:
            column.name = name
        if config is not None:
            column.config = config
        column.updated_at = utc_now()
        await self.session.flush()
        return column

    async def delete(self, column: TableColumn) -> None:
        await self.session.delete(column)
        await self.session.flush()

    async def reorder(self, table_id: uuid.UUID, column_ids: list[uuid.UUID]) -> None:
        now = utc_now()
        for index, column_id in enumerate(column_ids, start=1):
            await self.session.execute(
                update(TableColumn)
                .where(TableColumn.id == column_id, TableColumn.table_id == table_id)
                .values(position=index, updated_at=now)
            )
        await self.session.flush()


class TableRowRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_for_table(
        self,
        table_id: uuid.UUID,
        *,
        limit: int,
        offset: int,
    ) -> tuple[list[TableRow], int]:
        total = await self.session.scalar(
            select(func.count()).select_from(TableRow).where(TableRow.table_id == table_id)
        )
        result = await self.session.execute(
            select(TableRow)
            .where(TableRow.table_id == table_id)
            .order_by(TableRow.position.asc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), int(total or 0)

    async def get_by_id(self, row_id: uuid.UUID) -> TableRow | None:
        return await self.session.get(TableRow, row_id)

    async def get_by_ids(self, table_id: uuid.UUID, row_ids: list[uuid.UUID]) -> list[TableRow]:
        if not row_ids:
            return []
        result = await self.session.execute(
            select(TableRow).where(TableRow.table_id == table_id, TableRow.id.in_(row_ids))
        )
        return list(result.scalars().all())

    async def max_position(self, table_id: uuid.UUID) -> int:
        value = await self.session.scalar(select(func.max(TableRow.position)).where(TableRow.table_id == table_id))
        return int(value or 0)

    async def create(
        self,
        *,
        table_id: uuid.UUID,
        position: int,
        data: dict[str, Any],
    ) -> TableRow:
        row = TableRow(table_id=table_id, position=position, data=data)
        self.session.add(row)
        await self.session.flush()
        return row

    async def insert_many(self, rows: list[TableRow]) -> None:
        if not rows:
            return
        self.session.add_all(rows)
        await self.session.flush()

    async def iterate_chunks(self, table_id: uuid.UUID, *, chunk_size: int = 500):
        offset = 0
        while True:
            result = await self.session.execute(
                select(TableRow)
                .where(TableRow.table_id == table_id)
                .order_by(TableRow.position.asc())
                .limit(chunk_size)
                .offset(offset)
            )
            rows = list(result.scalars().all())
            if not rows:
                break
            yield rows
            if len(rows) < chunk_size:
                break
            offset += len(rows)

    async def update(self, row: TableRow, data: dict[str, Any]) -> TableRow:
        row.data = data
        row.updated_at = utc_now()
        await self.session.flush()
        return row

    async def delete(self, row: TableRow) -> None:
        await self.session.delete(row)
        await self.session.flush()

    async def delete_many(self, table_id: uuid.UUID, row_ids: list[uuid.UUID]) -> int:
        result = await self.session.execute(
            delete(TableRow).where(TableRow.table_id == table_id, TableRow.id.in_(row_ids))
        )
        await self.session.flush()
        return int(result.rowcount or 0)

    async def drop_column_key(self, table_id: uuid.UUID, column_id: uuid.UUID, now: datetime) -> None:
        await self.session.execute(
            text(
                "UPDATE table_rows SET data = data - CAST(:key AS text), updated_at = :now "
                "WHERE table_id = :table_id"
            ),
            {"key": str(column_id), "now": now, "table_id": table_id},
        )
        await self.session.flush()
