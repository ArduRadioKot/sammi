import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.errors import AppError
from app.db.session import get_db
from app.models.assistant import AssistantThread, AssistantTurn
from app.models.user import User, utc_now
from app.schemas.assistant import (
    AssistantThreadCreate, AssistantThreadDetail, AssistantThreadList, AssistantThreadRead,
    AssistantTurnCreate, AssistantTurnRead,
)
from app.services.assistant_generation import generate_assistant
from app.services.assistant_search import retrieve, validate_table
from app.services.workspace import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/assistant/threads", tags=["assistant"])


def _owned(workspace_id: uuid.UUID, user: User):
    return select(AssistantThread).where(AssistantThread.workspace_id == workspace_id, AssistantThread.user_id == user.id)


async def _thread(session: AsyncSession, workspace_id: uuid.UUID, user: User, thread_id: uuid.UUID, *, lock: bool = False):
    statement = _owned(workspace_id, user).where(AssistantThread.id == thread_id)
    thread = await session.scalar(statement.with_for_update() if lock else statement)
    if thread is None:
        raise AppError("ASSISTANT_THREAD_NOT_FOUND", "Чат не найден.", 404)
    return thread


@router.get("", response_model=AssistantThreadList)
async def list_threads(
    workspace_id: uuid.UUID, offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100),
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db),
):
    await WorkspaceService(session).get_workspace_for_user(workspace_id, user.id)
    rows = (await session.scalars(_owned(workspace_id, user).order_by(
        AssistantThread.updated_at.desc(), AssistantThread.id.desc(),
    ).offset(offset).limit(limit + 1))).all()
    return AssistantThreadList(
        items=[AssistantThreadRead.model_validate(row) for row in rows[:limit]], has_more=len(rows) > limit,
    )


@router.post("", response_model=AssistantThreadRead)
async def create_thread(
    workspace_id: uuid.UUID, payload: AssistantThreadCreate,
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db),
):
    await WorkspaceService(session).get_workspace_for_user(workspace_id, user.id)
    title = " ".join(payload.first_question.split())
    title = title if len(title) <= 80 else title[:79].rstrip() + "…"
    now = utc_now()
    created = await session.scalar(insert(AssistantThread).values(
        id=payload.id, workspace_id=workspace_id, user_id=user.id, title=title, updated_at=now,
    ).on_conflict_do_nothing(index_elements=[AssistantThread.id]).returning(AssistantThread.id))
    thread = await _thread(session, workspace_id, user, payload.id)
    if created and payload.history:
        session.add_all([
            AssistantTurn(
                id=uuid.uuid4(), thread_id=thread.id, question=turn.question, answer=turn.answer,
                search_tables=False, created_at=now + timedelta(microseconds=index), sources=[],
            )
            for index, turn in enumerate(payload.history)
        ])
    await session.commit()
    return AssistantThreadRead.model_validate(thread)


@router.get("/{thread_id}", response_model=AssistantThreadDetail)
async def get_thread(
    workspace_id: uuid.UUID, thread_id: uuid.UUID, user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    await WorkspaceService(session).get_workspace_for_user(workspace_id, user.id)
    thread = await _thread(session, workspace_id, user, thread_id)
    turns = (await session.scalars(select(AssistantTurn).where(
        AssistantTurn.thread_id == thread_id,
    ).order_by(AssistantTurn.created_at, AssistantTurn.id))).all()
    return AssistantThreadDetail(
        **AssistantThreadRead.model_validate(thread).model_dump(),
        turns=[AssistantTurnRead.model_validate(turn) for turn in turns],
    )


@router.delete("/{thread_id}", status_code=204)
async def delete_thread(
    workspace_id: uuid.UUID, thread_id: uuid.UUID, user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    await WorkspaceService(session).get_workspace_for_user(workspace_id, user.id)
    thread = await _thread(session, workspace_id, user, thread_id, lock=True)
    await session.delete(thread)
    await session.commit()
    return Response(status_code=204)


@router.put("/{thread_id}/turns/{turn_id}", response_model=AssistantTurnRead)
async def answer_turn(
    workspace_id: uuid.UUID, thread_id: uuid.UUID, turn_id: uuid.UUID, payload: AssistantTurnCreate,
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db),
):
    await WorkspaceService(session).get_workspace_for_user(workspace_id, user.id)
    thread = await _thread(session, workspace_id, user, thread_id, lock=True)
    turn = await session.get(AssistantTurn, (thread.id, turn_id))
    selected_table = payload.table_id if payload.search_tables else None

    if turn is not None:
        if (turn.question, turn.search_tables, turn.table_id) != (payload.question, payload.search_tables, selected_table):
            raise AppError("ASSISTANT_TURN_CONFLICT", "В этом сообщении уже сохранён другой вопрос.", 409)
        if turn.answer is not None:
            return AssistantTurnRead.model_validate(turn)
    else:
        if selected_table:
            await validate_table(session, workspace_id, selected_table)
        turn = AssistantTurn(
            id=turn_id, thread_id=thread_id, question=payload.question, search_tables=payload.search_tables,
            table_id=selected_table,
        )
        session.add(turn)
        thread.updated_at = utc_now()
        await session.flush()

    previous = (await session.scalars(select(AssistantTurn).where(
        AssistantTurn.thread_id == thread_id,
        tuple_(AssistantTurn.created_at, AssistantTurn.id) < tuple_(turn.created_at, turn.id),
    ).order_by(AssistantTurn.created_at.desc(), AssistantTurn.id.desc()).limit(5))).all()
    await session.commit()

    context = None
    sources = []
    if turn.search_tables:
        try:
            context, sources = await retrieve(session, workspace_id, turn.table_id, turn.question,
                                              [item.question for item in reversed(previous)])
        except DBAPIError as exc:
            if getattr(exc.orig, "sqlstate", None) == "57014":
                raise AppError("ASSISTANT_SEARCH_TIMEOUT", "Поиск занял слишком много времени. Выберите одну таблицу.", 503) from exc
            raise
        await session.commit()

    messages = []
    for item in reversed(previous):
        messages.append({"role": "user", "content": item.question[:650]})
        if item.answer:
            messages.append({"role": "assistant", "content": item.answer[:650]})
    messages.append({"role": "user", "content": turn.question})
    result = await generate_assistant(messages, context=context)

    await WorkspaceService(session).get_workspace_for_user(workspace_id, user.id)
    await _thread(session, workspace_id, user, thread_id, lock=True)
    saved = await session.scalar(update(AssistantTurn).where(
        AssistantTurn.thread_id == thread_id, AssistantTurn.id == turn_id, AssistantTurn.answer.is_(None),
    ).values(
        answer=result.content, model=result.model,
        sources=[source.model_dump(mode="json") for source in sources],
    ).returning(AssistantTurn).execution_options(populate_existing=True))
    if saved is None:
        saved = await session.get(AssistantTurn, (thread_id, turn_id), populate_existing=True)
    await session.commit()
    return AssistantTurnRead.model_validate(saved)
