import asyncio
import uuid
from collections import defaultdict
from contextlib import aclosing
from datetime import timedelta

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.models.relationship import RelationshipAnalysisRun
from app.models.table import TableRow, WorkspaceTable
from app.models.user import User, utc_now
from app.schemas.relationship import (
    OUTPUT_CONFIG_KEY, AnalysisAnswer, AnalysisRead, AnalysisReport, AnalysisRequest, AnalysisSetup, AskRequest,
    ContactCard, Corpus, Finding, LinkedPublication, PublishedAnalysis, PublicationReviewRequest, RefreshRequest,
    Relationship, RelationshipApproval,
    ReviewDecision, ReviewPreview, Verification,
)
from app.services.relationship import audio, discovery, inference, publications, web_search
from app.services.relationship.datasets import list_datasets, save_datasets
from app.services.relationship.metrics import build_report, find_path, key_role_coverage, publication_statuses
from app.services.relationship.output import OUTPUT_COLUMNS, contact_for_row, input_fields, output_values
from app.services.relationship.prepare import (
    MAX_ROWS, Document, attach_publication, attach_recording, chunk_source, detect_columns, prepare, read_crm_fields,
)
from app.services.table import WRITE_ROLES, TableAccess, require_write

logger = get_logger("app.relationship")
ACTIVE = {"queued", "running"}
RUN_SECONDS = 360
LEASE_SECONDS = RUN_SECONDS + 30


def _enabled() -> None:
    if not get_settings().relationship_ai_enabled:
        raise AppError("RELATIONSHIP_DISABLED", "Анализ отношений отключён в настройках API.", 503)


class AnalysisService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.access = TableAccess(session)

    async def _current(self, table_id: uuid.UUID, *, include_corpus: bool = False,
                       lock: bool = False) -> RelationshipAnalysisRun | None:
        statement = select(RelationshipAnalysisRun).where(RelationshipAnalysisRun.table_id == table_id)
        if not include_corpus:
            statement = statement.options(defer(RelationshipAnalysisRun.corpus))
        if lock:
            statement = statement.with_for_update()
        return await self.session.scalar(statement)

    async def _lock_table(self, table_id: uuid.UUID) -> WorkspaceTable:
        table = await self.session.scalar(
            select(WorkspaceTable).where(WorkspaceTable.id == table_id).with_for_update()
            .execution_options(populate_existing=True)
        )
        if table is None:
            raise AppError("TABLE_NOT_FOUND", "Таблица удалена.", 404)
        return table

    async def setup(self, table_id: uuid.UUID, user: User) -> AnalysisSetup:
        table, member = await self.access.table_for_user(table_id, user)
        columns = await self.access.columns.list_for_table(table_id)
        run = await self._current(table_id)
        mapping = detect_columns(columns)
        if run:
            valid_ids = {str(column.id) for column in columns if OUTPUT_CONFIG_KEY not in column.config}
            mapping.update({key: value for key, value in run.column_mapping.items() if value is None or value in valid_ids})
        return AnalysisSetup(
            model=inference.model_name(), enabled=get_settings().relationship_ai_enabled, can_write=member.role in WRITE_ROLES,
            company_hint=table.name, columns=mapping, run=await self._read_with_datasets(run, table),
            web_search_configured=bool(get_settings().relationship_search_base_url.strip()),
        )

    async def get(self, table_id: uuid.UUID, user: User) -> AnalysisRead | None:
        table, _ = await self.access.table_for_user(table_id, user)
        return await self._read_with_datasets(await self._current(table_id), table)

    async def _read_with_datasets(self, run: RelationshipAnalysisRun | None, table: WorkspaceTable) -> AnalysisRead | None:
        result = _read(run, table)
        if result is not None:
            result.datasets = await list_datasets(self.session, table.id)
        return result

    async def authorize_start(self, table_id: uuid.UUID, user: User) -> None:
        _, member = await self.access.table_for_user(table_id, user)
        require_write(member)
        _enabled()
        _ensure_idle(await self._current(table_id))

    async def start(self, table_id: uuid.UUID, user: User, body: AnalysisRequest, documents: list[Document]) -> AnalysisRead:
        table, member = await self.access.table_for_user(table_id, user)
        require_write(member)
        if table.relationship_source_id is not None:
            raise AppError("RELATIONSHIP_DATASET_READ_ONLY", "Откройте исходную таблицу для анализа.", 409)
        _enabled()
        if body.web_search:
            try:
                web_search.search_endpoint()
            except publications.PublicationError as exc:
                raise AppError("RELATIONSHIP_WEB_SEARCH_NOT_CONFIGURED", str(exc), 422) from exc
        columns = await self.access.columns.list_for_table(table_id)
        rows, total = await self.access.rows.list_for_table(table_id, limit=MAX_ROWS, offset=0)
        if total > MAX_ROWS:
            raise AppError("RELATIONSHIP_ROW_LIMIT", "Максимум 1000 строк в одном анализе.", 422)
        captured_at = table.updated_at
        await self.session.commit()
        corpus = await asyncio.to_thread(prepare, table.name, columns, rows, body, documents, utc_now())
        report = await asyncio.to_thread(build_report, corpus)
        locked = await self._lock_table(table_id)
        if locked.updated_at != captured_at:
            raise AppError("RELATIONSHIP_STALE_INPUT", "Таблица обновилась. Запустите анализ повторно.", 409)
        previous = await self._current(table_id)
        # A concurrent request may have created or updated the previous run after authorization.
        if previous is not None:
            await self.session.refresh(previous, attribute_names=["status"])
        _ensure_idle(previous)
        if previous is not None:
            await self.session.delete(previous)
            await self.session.flush()
        run = RelationshipAnalysisRun(
            table_id=table_id, status="queued", progress=10, model=inference.model_name(), created_at=corpus.collected_at,
            table_updated_at=captured_at, column_mapping={
                key: str(value) if value is not None else None
                for key, value in (detect_columns(columns) | body.columns).items()
            },
            corpus=corpus.model_dump(mode="json"), report=report.model_dump(mode="json"),
            refresh_hours=body.refresh_hours,
            next_refresh_at=corpus.collected_at + timedelta(hours=body.refresh_hours) if body.refresh_hours else None,
        )
        self.session.add(run)
        await self.session.flush()
        return await self._read_with_datasets(run, locked)

    async def contact_card(self, table_id: uuid.UUID, row_id: uuid.UUID, user: User) -> ContactCard | None:
        table, _ = await self.access.table_for_user(table_id, user)
        row = await self.access.rows.get_by_id(row_id)
        if row is None or row.table_id != table_id:
            raise AppError("ROW_NOT_FOUND", "Строка не найдена.", 404)
        run = await self._current(table_id, include_corpus=True)
        if run is None or not run.report:
            return None
        corpus = Corpus.model_validate(run.corpus)
        fields = input_fields(await self.access.columns.list_for_table(table_id), run.column_mapping)
        identity = contact_for_row(corpus, row, fields)
        if identity is None:
            return None
        report = AnalysisReport.model_validate(run.report)
        contact = next((item for item in report.contacts if item.id == identity.id), None)
        if contact is None:
            return None
        return ContactCard(contact=contact, generated_at=report.generated_at or run.created_at,
                           stale=run.table_updated_at != table.updated_at)

    async def publish(self, table_id: uuid.UUID, run_id: uuid.UUID, user: User) -> PublishedAnalysis:
        _, member = await self.access.table_for_user(table_id, user)
        require_write(member)
        # Row mutations in Table Editor acquire row locks before touching the parent table.
        rows = list((await self.session.scalars(
            select(TableRow).where(TableRow.table_id == table_id).order_by(TableRow.id)
            .limit(MAX_ROWS + 1).with_for_update()
        )).all())
        if len(rows) > MAX_ROWS:
            raise AppError("RELATIONSHIP_ROW_LIMIT", "Максимум 1000 строк в одном анализе.", 422)
        table = await self._lock_table(table_id)
        run = await self._current(table_id, include_corpus=True, lock=True)
        if run is None or run.id != run_id or not run.report:
            raise AppError("RELATIONSHIP_RUN_NOT_FOUND", "Запуск анализа не найден.", 404)
        _ensure_idle(run)
        if run.table_updated_at != table.updated_at:
            raise AppError("RELATIONSHIP_STALE_INPUT", "Таблица обновилась. Запустите анализ повторно.", 409)
        corpus = Corpus.model_validate(run.corpus)
        report = AnalysisReport.model_validate(run.report)
        if report.key_roles is None:
            report.covered_key_roles, report.key_roles, report.coverage_score = key_role_coverage(report.contacts)
            run.report = report.model_dump(mode="json")
        columns = await self.access.columns.list_for_table(table_id)
        fields = input_fields(columns, run.column_mapping)
        if not corpus.crm_fields:
            corpus.crm_fields = read_crm_fields(columns, rows)
            matched_rows = {}
            for row in rows:
                identity = contact_for_row(corpus, row, fields)
                if identity is not None:
                    matched_rows[str(row.id)] = identity.id
                    original_id = row.data.get(str(fields.get("contact_key")))
                    if original_id is not None and str(original_id).strip():
                        corpus.crm_fields[str(row.id)]["contact_id"] = str(original_id).strip()
            corpus.row_contacts.update(matched_rows)
            run.corpus = corpus.model_dump(mode="json")
        output = {}
        names = {column.name.casefold() for column in columns}
        position = max((column.position for column in columns), default=0)
        created = False
        for key, column_type in OUTPUT_COLUMNS.items():
            column = next((column for column in columns if column.config.get(OUTPUT_CONFIG_KEY) == key), None)
            if column is None:
                position += 1
                name = key if key.casefold() not in names else f"{key} · анализ"
                suffix = 2
                while name.casefold() in names:
                    name = f"{key} · анализ {suffix}"
                    suffix += 1
                column = await self.access.columns.create(
                    table_id=table_id, name=name, type=column_type, position=position, config={OUTPUT_CONFIG_KEY: key},
                )
                names.add(name.casefold())
                created = True
            output[key] = column
        generated_at = report.generated_at or run.created_at
        by_contact = {contact.id: output_values(report, corpus, contact, generated_at) for contact in report.contacts}
        changed = 0
        now = utc_now()
        for row in rows:
            identity = contact_for_row(corpus, row, fields)
            values = by_contact.get(identity.id, {}) if identity else {}
            data = dict(row.data)
            for key, column in output.items():
                value = values.get(key)
                if value is None:
                    data.pop(str(column.id), None)
                else:
                    data[str(column.id)] = value
            if data != row.data:
                row.data = data
                row.updated_at = now
                changed += 1
        if changed or created:
            await self.access.tables.touch(table)
            run.table_updated_at = table.updated_at
            await self.session.flush()
        datasets = await save_datasets(self.session, table, report, corpus)
        return PublishedAnalysis(columns=[column.name for column in output.values()], updated_rows=changed, datasets=datasets)

    async def delete(self, table_id: uuid.UUID, user: User) -> None:
        _, member = await self.access.table_for_user(table_id, user)
        require_write(member)
        await self.session.scalar(select(WorkspaceTable.id).where(WorkspaceTable.id == table_id).with_for_update())
        run = await self._current(table_id)
        if run is not None:
            await self.session.delete(run)
            await self.session.execute(delete(WorkspaceTable).where(WorkspaceTable.relationship_source_id == table_id))

    async def retry(self, table_id: uuid.UUID, user: User) -> AnalysisRead:
        _, member = await self.access.table_for_user(table_id, user)
        require_write(member)
        _enabled()
        table = await self._lock_table(table_id)
        run = await self._current(table_id)
        if run is None or run.status not in {"partial", "failed"}:
            raise AppError("RELATIONSHIP_RETRY_UNAVAILABLE", "Для этого запуска повтор недоступен.", 409)
        if run.table_updated_at != table.updated_at:
            raise AppError("RELATIONSHIP_STALE_INPUT", "Таблица обновилась. Запустите анализ повторно.", 409)
        run.status = "queued"
        run.progress = 10
        run.error = None
        return await self._read_with_datasets(run, table)

    async def _review_run(self, table_id: uuid.UUID, run_id: uuid.UUID) -> tuple[RelationshipAnalysisRun, Corpus]:
        run = await self._current(table_id, include_corpus=True)
        if run is None or run.id != run_id:
            raise AppError("RELATIONSHIP_RUN_NOT_FOUND", "Запуск анализа не найден.", 404)
        return run, Corpus.model_validate(run.corpus)

    async def update_refresh(self, table_id: uuid.UUID, user: User, body: RefreshRequest) -> AnalysisRead:
        _, member = await self.access.table_for_user(table_id, user)
        require_write(member)
        table = await self._lock_table(table_id)
        # Take the same row lock as the worker before changing the next due time.
        run = await self.session.scalar(
            select(RelationshipAnalysisRun).options(defer(RelationshipAnalysisRun.corpus))
            .where(RelationshipAnalysisRun.table_id == table_id).with_for_update()
        )
        if run is None:
            raise AppError("RELATIONSHIP_RUN_NOT_FOUND", "Запуск анализа не найден.", 404)
        if body.hours:
            _enabled()
            if run.table_updated_at != table.updated_at:
                raise AppError("RELATIONSHIP_STALE_INPUT", "Таблица обновилась. Запустите анализ повторно.", 409)
            if not run.report or not (run.report.get("feeds") or run.report.get("web_search")):
                raise AppError("RELATIONSHIP_FEED_REQUIRED", "Для обновления по расписанию добавьте ленту или включите веб-поиск.", 422)
        run.refresh_hours = body.hours
        run.next_refresh_at = utc_now() + timedelta(hours=body.hours) if body.hours else None
        return await self._read_with_datasets(run, table)

    async def review_preview(self, table_id: uuid.UUID, run_id: uuid.UUID, source_id: str, user: User) -> ReviewPreview:
        await self.access.table_for_user(table_id, user)
        _, corpus = await self._review_run(table_id, run_id)
        source = corpus.review_sources.get(source_id)
        if source is None:
            raise AppError("RELATIONSHIP_REVIEW_NOT_FOUND", "Материал для проверки не найден.", 404)
        return ReviewPreview(label=source.label, text=source.text, url=source.url, occurred_at=source.occurred_at)

    async def approve_relationship(self, table_id: uuid.UUID, run_id: uuid.UUID,
                                   user: User, body: RelationshipApproval) -> AnalysisRead:
        _, member = await self.access.table_for_user(table_id, user)
        require_write(member)
        _enabled()
        table = await self._lock_table(table_id)
        run, corpus = await self._review_run(table_id, run_id)
        if run.table_updated_at != table.updated_at:
            raise AppError("RELATIONSHIP_STALE_INPUT", "Таблица обновилась. Запустите анализ повторно.", 409)
        source_id = f"approved-edge-{body.proposal_id}"
        if any(edge.source_id == source_id for edge in corpus.relationships):
            return await self._read_with_datasets(run, table)
        _ensure_idle(run)
        report = AnalysisReport.model_validate(run.report)
        proposal = next((item for item in report.proposed_relationships if item.id == body.proposal_id), None)
        if proposal is None:
            raise AppError("RELATIONSHIP_PROPOSAL_NOT_FOUND", "Предложение по связи не найдено.", 404)
        evidence = proposal.finding.citations[0]
        original = next((source for source in corpus.sources if source.id == evidence.source_id), None)
        if original is None or evidence.quote not in original.text:
            raise AppError("RELATIONSHIP_EVIDENCE_MISSING", "Первичный фрагмент связи не найден.", 409)
        corpus.sources.append(original.model_copy(update={
            "id": source_id, "kind": "relationship", "label": "Проверенная связь · " + original.label,
            "text": evidence.quote, "verification": Verification(reviewer=user.name, reviewed_at=utc_now()),
            "contact_id": proposal.from_id, "match_confidence": None,
        }))
        corpus.relationships.append(Relationship(from_id=proposal.from_id, to_id=proposal.to_id,
                                                scope=proposal.scope, source_id=source_id))
        run.corpus = corpus.model_dump(mode="json")
        # Retain existing analyses and other proposals until the worker starts recomputing.
        report.connections = corpus.relationships
        report.proposed_relationships = [item for item in report.proposed_relationships if item.id != proposal.id]
        run.report = report.model_dump(mode="json")
        run.status = "queued"
        run.progress = 10
        run.error = None
        return await self._read_with_datasets(run, table)

    async def review_publication(self, table_id: uuid.UUID, run_id: uuid.UUID, source_id: str,
                                 user: User, body: PublicationReviewRequest) -> AnalysisRead:
        _, member = await self.access.table_for_user(table_id, user)
        require_write(member)
        _enabled()
        table = await self._lock_table(table_id)
        run, corpus = await self._review_run(table_id, run_id)
        if run.table_updated_at != table.updated_at:
            raise AppError("RELATIONSHIP_STALE_INPUT", "Таблица обновилась. Запустите анализ повторно.", 409)
        item = next((item for item in corpus.review if item.source_id == source_id), None)
        if item is None:
            raise AppError("RELATIONSHIP_REVIEW_NOT_FOUND", "Материал для проверки не найден.", 404)
        contact_id = str(body.contact_id) if body.contact_id else None
        note = body.note or None
        if item.decision is not None:
            decision = item.decision
            if (decision.action, decision.contact_id, decision.note, decision.reviewer_id) == (
                body.action, contact_id, note, user.id,
            ):
                return await self._read_with_datasets(run, table)
            raise AppError("RELATIONSHIP_REVIEW_RESOLVED", "Решение по публикации уже сохранено.", 409)
        _ensure_idle(run)
        source = corpus.review_sources.get(source_id)
        if source is None:
            raise AppError("RELATIONSHIP_REVIEW_NOT_FOUND", "Материал для проверки не найден.", 404)
        contact = next((contact for contact in corpus.contacts if contact.id == contact_id), None)
        if body.action == "confirmed" and contact is None:
            raise AppError("RELATIONSHIP_CONTACT_NOT_FOUND", "Выберите контакт текущего клиента.", 422)
        if body.action == "rejected" and contact_id is not None:
            raise AppError("RELATIONSHIP_REVIEW_INVALID", "Для отклонения достаточно причины.", 422)
        verification = Verification(reviewer=user.name or "Участник workspace", reviewed_at=utc_now())
        item.decision = ReviewDecision(
            **verification.model_dump(), reviewer_id=user.id, action=body.action, contact_id=contact_id,
            contact_name=contact.name if contact else None, note=note,
        )
        del corpus.review_sources[source_id]
        publication = next((publication for publication in corpus.publications if publication.id == source_id), None)
        if publication is not None:
            publication.state = "included" if contact else "rejected"
            publication.reason = None
        recording = next((item for item in corpus.recordings if item.id == source_id), None)
        if recording is not None:
            recording.state = "transcribed" if contact else "rejected"
        if contact is not None:
            approved = source.model_copy(update={
                "contact_id": contact.id, "subject": contact.name, "verification": verification,
            })
            corpus.sources.extend(chunk_source(approved))
            report = await asyncio.to_thread(build_report, corpus)
            run.status = "queued"
            run.progress = 10
            run.error = None
        else:
            report = AnalysisReport.model_validate(run.report).model_copy(update={
                "review": corpus.review, "publications": publication_statuses(corpus), "recordings": corpus.recordings,
            })
        run.corpus = corpus.model_dump(mode="json")
        run.report = report.model_dump(mode="json")
        return await self._read_with_datasets(run, table)

    async def ask(self, table_id: uuid.UUID, user: User, body: AskRequest) -> AnalysisAnswer:
        table, _ = await self.access.table_for_user(table_id, user)
        _enabled()
        run = await self._current(table_id, include_corpus=True)
        if run is None:
            raise AppError("RELATIONSHIP_RUN_REQUIRED", "Сначала запустите анализ клиента.", 409)
        if run.table_updated_at != table.updated_at:
            raise AppError("RELATIONSHIP_STALE_INPUT", "Таблица обновилась. Запустите анализ повторно.", 409)
        corpus = Corpus.model_validate(run.corpus)
        report = AnalysisReport.model_validate(run.report)
        await self.session.commit()
        ids = {contact.id for contact in corpus.contacts}
        if any(id is not None and id not in ids for id in (body.contact_id, body.target_id)):
            raise AppError("RELATIONSHIP_CONTACT_NOT_FOUND", "Выберите контакт текущего клиента.", 422)
        if body.intent == "path":
            if not body.contact_id or not body.target_id or body.contact_id == body.target_id:
                raise AppError("RELATIONSHIP_PATH_CONTACTS", "Выберите двух разных участников.", 422)
            return AnalysisAnswer(items=[find_path(corpus, body.contact_id, body.target_id)])
        return await inference.answer(corpus, body, report)


def _ensure_idle(run: RelationshipAnalysisRun | None) -> None:
    if run is not None and run.status in ACTIVE:
        raise AppError("RELATIONSHIP_RUN_ACTIVE", "Анализ уже выполняется.", 409)


def _read(run: RelationshipAnalysisRun | None, table: WorkspaceTable) -> AnalysisRead | None:
    if run is None:
        return None
    return AnalysisRead(
        id=run.id, status=run.status, progress=run.progress, model=run.model, created_at=run.created_at,
        table_updated_at=run.table_updated_at, stale=run.table_updated_at != table.updated_at,
        error=run.error, report=run.report, refresh_hours=run.refresh_hours,
        next_refresh_at=run.next_refresh_at if run.table_updated_at == table.updated_at else None,
    )


async def _claim() -> tuple[uuid.UUID, uuid.UUID, Corpus] | None:
    now = utc_now()
    run_model = RelationshipAnalysisRun
    current_table = select(WorkspaceTable.id).where(
        WorkspaceTable.id == run_model.table_id, WorkspaceTable.updated_at == run_model.table_updated_at,
    ).exists()
    async with SessionLocal.begin() as session:
        run = await session.scalar(
            select(RelationshipAnalysisRun)
            .where(or_(
                RelationshipAnalysisRun.status == "queued",
                and_(RelationshipAnalysisRun.status == "running", RelationshipAnalysisRun.lease_until < now),
                and_(run_model.status.in_(("completed", "partial")), run_model.next_refresh_at <= now,
                     run_model.refresh_hours.is_not(None), current_table),
            ))
            .order_by(RelationshipAnalysisRun.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if run is None:
            return None
        corpus = Corpus.model_validate(run.corpus)
        if run.status in {"completed", "partial"} and run.refresh_hours:
            corpus.collected_at = now
            for feed in corpus.feeds:
                feed.state = "pending"
            if corpus.web_search:
                corpus.web_search.state = "pending"
            run.next_refresh_at = now + timedelta(hours=run.refresh_hours)
            run.corpus = corpus.model_dump(mode="json")
        token = uuid.uuid4()
        run.status = "running"
        run.progress = 15
        run.lease_until = now + timedelta(seconds=LEASE_SECONDS)
        run.lease_token = token
        return run.id, token, corpus


async def _save(run_id: uuid.UUID, token: uuid.UUID, *, status: str, progress: int,
                report: AnalysisReport, error: str | None = None, corpus: Corpus | None = None) -> bool:
    values = {"status": status, "progress": progress, "report": report.model_dump(mode="json"), "error": error}
    if corpus is not None:
        values["corpus"] = corpus.model_dump(mode="json")
    if status != "running":
        values.update(lease_token=None, lease_until=None)
    async with SessionLocal.begin() as session:
        table = None
        if status in {"completed", "partial"} and corpus is not None:
            source_id = select(RelationshipAnalysisRun.table_id).where(RelationshipAnalysisRun.id == run_id).scalar_subquery()
            table = await session.scalar(select(WorkspaceTable).where(WorkspaceTable.id == source_id).with_for_update())
        saved = await session.scalar(
            update(RelationshipAnalysisRun)
            .where(RelationshipAnalysisRun.id == run_id, RelationshipAnalysisRun.lease_token == token)
            .values(**values)
            .returning(RelationshipAnalysisRun.table_updated_at)
        )
        if table is not None and saved == table.updated_at:
            await save_datasets(session, table, report, corpus)
        return saved is not None


async def _process_publication(item: LinkedPublication) -> publications.DownloadedPublication | None:
    try:
        return await publications.download_publication(item.url)
    except publications.PublicationError as exc:
        item.state = "blocked" if exc.blocked else "unavailable"
        item.reason = str(exc)
        item.retryable = exc.retryable
        return None


async def run_one() -> bool:
    job = await _claim()
    if job is None:
        return False
    run_id, token, corpus = job
    report = await asyncio.to_thread(build_report, corpus)
    findings: dict[str, list[tuple[str, Finding]]] = defaultdict(list)
    error = None
    try:
        async with asyncio.timeout(RUN_SECONDS):
            pending_recordings = [item for item in corpus.recordings if item.encoded and (item.state == "pending" or item.retryable)]
            for index, recording in enumerate(pending_recordings, 1):
                try:
                    segments = await audio.transcribe(recording.encoded, recording.suffix)
                    await asyncio.to_thread(attach_recording, corpus, recording, segments, utc_now())
                    recording.retryable = False
                    recording.reason = None
                except AppError as exc:
                    recording.state = "unavailable"
                    recording.reason = exc.message
                    recording.retryable = exc.status_code >= 500
                    if recording.retryable:
                        error = exc.code
                if not recording.retryable:
                    recording.encoded = None
                report = await asyncio.to_thread(build_report, corpus)
                if not await _save(run_id, token, status="running", progress=15 + 10 * index // len(pending_recordings),
                                   report=report, corpus=corpus):
                    return True
            pending_feeds = [feed for feed in corpus.feeds if feed.state == "pending" or feed.retryable]
            for index, feed in enumerate(pending_feeds, 1):
                try:
                    entries = await discovery.load_feed(feed.url)
                    feed.discovered = 0
                    discovery.apply_feed(corpus, feed, entries, corpus.collected_at.date())
                    feed.state = "checked"
                    feed.reason = None
                    feed.retryable = False
                except publications.PublicationError as exc:
                    feed.state = "blocked" if exc.blocked else "unavailable"
                    feed.reason = str(exc)
                    feed.retryable = exc.retryable
                    if exc.retryable:
                        error = "RELATIONSHIP_FEED_DOWNLOAD"
                feed.checked_at = utc_now()
                report = await asyncio.to_thread(build_report, corpus)
                if not await _save(run_id, token, status="running", progress=25 + 5 * index // len(pending_feeds),
                                   report=report, corpus=corpus):
                    return True
            search = corpus.web_search
            if search is not None and search.state in {"pending", "partial", "unavailable"}:
                search.searched_contacts = 0
                search.discovered = 0
                search.reason = None
                failures = 0
                processed = 0
                try:
                    async with aclosing(web_search.batches(corpus)) as batches:
                        async for batch in batches:
                            processed += sum(len(item.contact_ids) for item in batch)
                            failures += sum(len(item.contact_ids) for item in batch if item.error)
                            search.searched_contacts = processed - failures
                            search.discovered += web_search.apply_results(corpus, batch)
                            search.reason = next((item.error for item in batch if item.error), search.reason)
                            report = await asyncio.to_thread(build_report, corpus)
                            if not await _save(
                                run_id, token, status="running", progress=30 + 10 * processed // max(1, search.total_contacts),
                                report=report, corpus=corpus,
                            ):
                                return True
                            if not search.searched_contacts and failures:
                                break
                except publications.PublicationError as exc:
                    failures += 1
                    search.reason = str(exc)
                search.state = "partial" if failures and search.searched_contacts else "unavailable" if failures else "checked"
                search.checked_at = utc_now()
                if failures:
                    error = "RELATIONSHIP_WEB_SEARCH_FAILED"
                report = await asyncio.to_thread(build_report, corpus)
                if not await _save(run_id, token, status="running", progress=40, report=report, corpus=corpus):
                    return True
            pending = [item for item in corpus.publications if item.state == "pending" or item.retryable]
            for offset in range(0, len(pending), publications.DOWNLOAD_CONCURRENCY):
                batch = pending[offset:offset + publications.DOWNLOAD_CONCURRENCY]
                downloads = await asyncio.gather(*(_process_publication(item) for item in batch))
                for item, downloaded in zip(batch, downloads):
                    if downloaded is not None:
                        await asyncio.to_thread(attach_publication, corpus, item, downloaded, utc_now())
                report = await asyncio.to_thread(build_report, corpus)
                progress = 40 + 15 * (offset + len(batch)) // len(pending)
                if not await _save(run_id, token, status="running", progress=progress, report=report, corpus=corpus):
                    return True
            if any(item.retryable for item in corpus.publications):
                error = "RELATIONSHIP_PUBLICATION_DOWNLOAD"
            model_start = 55 if corpus.publications else 40 if corpus.web_search else 30 if corpus.feeds else 25 if corpus.recordings else 15
            sources = await asyncio.to_thread(inference.choose_extraction_sources, corpus)
            for offset in range(0, len(sources), inference.BATCH_SIZE):
                batch = sources[offset:offset + inference.BATCH_SIZE]
                try:
                    for contact_id, kind, item in await inference.extract(batch):
                        findings[contact_id].append((kind, item))
                except AppError as exc:
                    error = exc.code
                    if exc.code != "AI_STRUCTURED_OUTPUT_INVALID":
                        break
                report = await asyncio.to_thread(build_report, corpus, findings)
                progress = model_start + (95 - model_start) * (offset + len(batch)) // len(sources)
                if not await _save(run_id, token, status="running", progress=progress, report=report, error=error):
                    return True
    except TimeoutError:
        error = "RELATIONSHIP_TIMEOUT"
    except Exception as exc:
        logger.error("relationship job=%s error=%s", run_id, type(exc).__name__)
        error = "RELATIONSHIP_PROCESSING_FAILED"
    await _save(run_id, token, status="partial" if error else "completed", progress=100,
                report=report, error=error, corpus=corpus)
    return True


async def run_worker() -> None:
    while True:
        try:
            worked = await run_one()
        except Exception as exc:
            logger.warning("relationship worker error=%s", type(exc).__name__)
            await asyncio.sleep(10)
            continue
        if not worked:
            await asyncio.sleep(2)
