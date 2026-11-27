import json
import re
import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import Text, cast, func, literal_column, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.table import TableColumn, TableRow, WorkspaceTable
from app.schemas.assistant import AssistantSource

WORD = re.compile(r"[^\W_]+", re.UNICODE)
CATALOG_QUESTION = re.compile(r"таблиц\w*.*(?:есть|доступн)|(?:какие|список|сколько)\s+таблиц|(?:list|which|how many)\s+tables", re.IGNORECASE)
STOP_WORDS = {
    "найди", "найти", "поиск", "покажи", "расскажи", "напиши", "скажи", "данные", "информация",
    "информацию", "таблица", "таблице", "таблицах", "таблицу", "таблицы", "есть", "это", "меня",
    "мне", "что", "где", "как", "какие", "какая", "какой", "сколько", "про", "для", "кто",
    "или", "его", "неё", "нее", "него", "чем", "все", "всех", "найдено", "строк", "строки",
    "find", "show", "the", "about", "what", "which", "who", "from", "table", "tables", "information",
}
TABLE_VECTOR = literal_column(
    """(jsonb_to_tsvector('simple'::regconfig, table_rows.data, '["string", "numeric", "boolean"]'::jsonb) ||
        jsonb_to_tsvector('russian'::regconfig, table_rows.data, '["string", "numeric", "boolean"]'::jsonb))"""
)
ROW_LIMIT = 10
CATALOG_LIMIT = 30


def terms(question: str) -> list[str]:
    unique = dict.fromkeys(
        word for word in WORD.findall(question.casefold())
        if (len(word) >= 3 or word.isdecimal()) and word not in STOP_WORDS
    )
    return list(unique)[:16]


async def validate_table(session: AsyncSession, workspace_id: uuid.UUID, table_id: uuid.UUID) -> None:
    table = await session.scalar(select(WorkspaceTable.id).where(
        WorkspaceTable.workspace_id == workspace_id, WorkspaceTable.id == table_id,
    ))
    if table is None:
        raise AppError("ASSISTANT_TABLE_NOT_FOUND", "Выбранная таблица недоступна. Выберите другую таблицу.", 404)


async def retrieve(
    session: AsyncSession, workspace_id: uuid.UUID, table_id: uuid.UUID | None,
    question: str, previous_questions: list[str],
) -> tuple[dict, list[AssistantSource]]:
    await session.execute(text("SET LOCAL statement_timeout = '8s'"))
    table_filter = [WorkspaceTable.workspace_id == workspace_id]
    if table_id:
        table_filter.append(WorkspaceTable.id == table_id)
    total_tables = await session.scalar(select(func.count()).select_from(WorkspaceTable).where(*table_filter))
    joined = TableRow.__table__.join(WorkspaceTable, TableRow.table_id == WorkspaceTable.id)
    projection = select(TableRow.id, TableRow.table_id, TableRow.data).select_from(joined).where(*table_filter)

    matches = []
    query_words = terms(question)
    # With an explicit table, its name should not compete with the person's name or identifier.
    for words in [query_words, *(terms(previous) for previous in previous_questions[-2:][::-1])]:
        if not words:
            continue
        expression = " | ".join(f"{word}:*" for word in words)
        query = func.to_tsquery(literal_column("'simple'::regconfig"), expression).op("||")(
            func.to_tsquery(literal_column("'russian'::regconfig"), expression)
        )
        matches = (await session.execute(projection.where(TABLE_VECTOR.bool_op("@@")(query)).order_by(
            func.ts_rank_cd(TABLE_VECTOR, query).desc(), TableRow.position, TableRow.id,
        ).limit(ROW_LIMIT))).all()
        if matches:
            break

    catalog = (await session.execute(
        select(WorkspaceTable.id, WorkspaceTable.name)
        .where(*table_filter).order_by(WorkspaceTable.updated_at.desc(), WorkspaceTable.id).limit(CATALOG_LIMIT)
    )).all()
    # Keep matching tables in the catalog even if their last edit was long ago.
    names_in_question = (await session.execute(
        select(WorkspaceTable.id, WorkspaceTable.name)
        .where(*table_filter, func.length(WorkspaceTable.name) >= 4,
               func.strpos(func.lower(cast(question, Text)), func.lower(WorkspaceTable.name)) > 0)
        .order_by(func.length(WorkspaceTable.name).desc()).limit(6)
    )).all()
    names = {table.id: table for table in [*names_in_question, *catalog]}
    match_ids = {row.table_id for row in matches}
    missing = match_ids - names.keys()
    if missing:
        names.update({table.id: table for table in (await session.execute(
            select(WorkspaceTable.id, WorkspaceTable.name)
            .where(*table_filter, WorkspaceTable.id.in_(missing))
        )).all()})
    if table_id and not names:
        raise AppError("ASSISTANT_TABLE_NOT_FOUND", "Выбранная таблица недоступна. Выберите другую таблицу.", 404)

    sample_ids = {table_id} if table_id else {table.id for table in names_in_question[:1]}
    samples = []
    if not matches and sample_ids:
        samples = (await session.execute(projection.where(TableRow.table_id.in_(sample_ids))
                                         .order_by(TableRow.position, TableRow.id).limit(4))).all()

    detailed_ids = match_ids | sample_ids
    counts: dict[uuid.UUID, int] = {}
    columns: dict[uuid.UUID, list[tuple[str, str]]] = defaultdict(list)
    if detailed_ids:
        counts = dict((await session.execute(
            select(TableRow.table_id, func.count()).select_from(joined)
            .where(*table_filter, TableRow.table_id.in_(detailed_ids)).group_by(TableRow.table_id)
        )).tuples().all())
        for column_id, source_table, label in (await session.execute(
            select(TableColumn.id, TableColumn.table_id, TableColumn.name)
            .join(WorkspaceTable, TableColumn.table_id == WorkspaceTable.id)
            .where(*table_filter, TableColumn.table_id.in_(detailed_ids)).order_by(TableColumn.position)
        )).all():
            columns[source_table].append((str(column_id), label))

    sources: list[AssistantSource] = []
    rows_context = []
    context_budget = 8000
    for row in [*matches, *samples]:
        table = names.get(row.table_id)
        if not table:
            continue
        fields: list[dict[str, Any]] = []
        for column_id, label in columns[row.table_id]:
            value = row.data.get(column_id)
            if value is None or value == "":
                continue
            if isinstance(value, (list, dict)):
                value = json.dumps(value, ensure_ascii=False)
            if isinstance(value, str):
                value = value[:280]
            fields.append({"column": label, "value": value})
        fields.sort(key=lambda field: not any(word in str(field["value"]).casefold() for word in query_words))
        if not fields:
            continue
        entry = {"ref": len(sources) + 1, "table": table.name, "fields": fields[:12]}
        size = len(json.dumps(entry, ensure_ascii=False))
        if size > context_budget:
            continue
        context_budget -= size
        sources.append(AssistantSource(table_id=row.table_id, row_id=row.id, label=table.name))
        rows_context.append(entry)

    table_context = []
    for source_table, table in names.items():
        entry = {"name": table.name}
        if source_table in detailed_ids:
            sources.append(AssistantSource(table_id=source_table, label=table.name))
            entry.update(ref=len(sources), row_count=counts.get(source_table, 0),
                         columns=[label for _, label in columns[source_table]][:36])
        elif CATALOG_QUESTION.search(question):
            sources.append(AssistantSource(table_id=source_table, label=table.name))
            entry["ref"] = len(sources)
        table_context.append(entry)
    return {
        "total_tables": total_tables or 0,
        "tables": table_context,
        "matching_rows": rows_context if matches else [],
        "example_rows": rows_context if samples else [],
    }, sources
