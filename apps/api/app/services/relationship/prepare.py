import base64
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import PurePath
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

from rapidfuzz import fuzz, process

from app.core.config import get_settings
from app.core.errors import AppError
from app.models.table import TableColumn, TableRow
from app.schemas.relationship import (
    FIELD_ALIASES, OUTPUT_CONFIG_KEY, AnalysisRequest, Contact, Corpus, DocumentMetadata, FeedStatus, FieldName,
    LinkedPublication, Recording, Relationship, ReviewItem, Source, WebSearchStatus,
)
from app.services.relationship.audio import MAX_RECORDINGS, Segment
from app.services.relationship.publications import (
    MAX_REMOTE_PUBLICATIONS, DownloadedPublication, PublicationError, publication_url,
)
from app.services.relationship.text import clean, normalized, safe_url, split_text, tokens

MAX_ROWS = 1000
MAX_CONTACTS = 40
MAX_CORPUS_CHARS = 600_000
CRM_METADATA = {
    "industry", "active_projects", "deal_value_total", "last_deal_at", "last_interaction_at", "technology_stack",
    "reports_to_id", "internal_owner", "relationship_status", "last_touch_at", "touches_90d", "employee_id",
    "occurred_at", "channel", "direction",
    "interaction_type", "project_id", "outcome", "feedback", "next_step", "source_id", "event_type", "event_title",
    "organizer", "person_role", "influence_scope", "strength", "valid_from", "valid_to", "confidence",
}
ROLES = {
    "лпр": "decision_maker", "decision maker": "decision_maker",
    "лвр": "influencer", "influencer": "influencer",
    "чфпр": "actual_decider", "лдпр": "actual_decider", "actual decider": "actual_decider",
}
AUTHORITY = {
    "да": "signing", "true": "signing", "yes": "signing", "1": "signing", "signing": "signing", "право подписи": "signing",
    "нет": "no_signing", "false": "no_signing", "no": "no_signing", "0": "no_signing",
    "без права подписи": "no_signing", "no signing": "no_signing",
}


@dataclass
class Document:
    name: str
    text: str
    metadata: DocumentMetadata
    audio: bytes | None = None


def detect_columns(columns: list[TableColumn]) -> dict[FieldName, UUID]:
    by_name = {normalized(column.name): column.id for column in reversed(columns) if OUTPUT_CONFIG_KEY not in column.config}
    return {
        field: next(by_name[normalized(alias)] for alias in aliases if normalized(alias) in by_name)
        for field, aliases in FIELD_ALIASES.items()
        if any(normalized(alias) in by_name for alias in aliases)
    }


def _get_string(value: Any, limit: int | None = None) -> str:
    if isinstance(value, (str, int, float)):
        return clean(str(value))[:limit]
    return ""


def read_crm_fields(columns: list[TableColumn], rows: list[TableRow]) -> dict[str, dict[str, str]]:
    ids = {column.name.strip().casefold(): str(column.id) for column in columns
           if OUTPUT_CONFIG_KEY not in column.config and column.name.strip().casefold() in CRM_METADATA}
    return {
        str(row.id): {key: text for key, column_id in ids.items()
                      if (text := _get_string(row.data.get(column_id), 2000))}
        for row in rows
    }


def _date(value: str) -> date | None:
    if not value:
        return None
    for parser in (lambda raw: date.fromisoformat(raw[:10]), lambda raw: datetime.strptime(raw, "%d.%m.%Y").date()):
        try:
            return parser(value)
        except ValueError:
            continue
    return None


def _assessment(value: str) -> float | None:
    try:
        number = float(value.replace(",", "."))
    except ValueError:
        return None
    return number if 0 <= number <= 1 else None


def _match_identity(
    text: str, company: str, contacts: list[Contact], occurred_at: date | None, today: date,
) -> tuple[Contact | None, float, str]:
    canonical = normalized(text)
    padded = f" {canonical} "
    words = canonical.split()
    company_name = normalized(company)
    lemma_text = " " + " ".join(tokens(text)) + " "
    company_match = _phrase_matches(company_name, padded, lemma_text)
    scores = []
    for contact in contacts:
        name = normalized(contact.name).split()
        if len(name) < 2:
            continue
        windows = [" ".join(words[index:index + len(name)]) for index in range(len(words) - len(name) + 1)]
        match = process.extractOne(" ".join(name), windows, scorer=fuzz.token_sort_ratio, score_cutoff=85)
        if not match:
            continue
        # Prefer two independent identity signals before attaching a public statement.
        title = normalized(contact.title)
        title_match = _phrase_matches(title, padded, lemma_text)
        fresh = occurred_at is not None and 0 <= (today - occurred_at).days <= 365 * 2
        score = round(0.65 * match[1] / 100 + 0.15 * company_match + 0.15 * title_match + 0.05 * fresh, 2)
        scores.append((score, contact))
    scores.sort(key=lambda item: item[0], reverse=True)
    if not scores:
        return None, 0, "В тексте не найдено совпадение по ФИО."
    score, contact = scores[0]
    if score < get_settings().relationship_identity_threshold:
        return None, score, "Для подтверждения нужны компания или должность."
    if len(scores) > 1 and score - scores[1][0] < 0.10:
        return None, score, "Найдено несколько возможных участников."
    return contact, score, ""


def _phrase_matches(phrase: str, text: str, lemmas: str) -> bool:
    terms = " ".join(tokens(phrase))
    return len(phrase) >= 3 and (f" {phrase} " in text or bool(terms) and f" {terms} " in lemmas)


def prepare(
    table_name: str,
    columns: list[TableColumn],
    rows: list[TableRow],
    request: AnalysisRequest,
    documents: list[Document],
    now: datetime,
) -> Corpus:
    fields = detect_columns(columns) | request.columns
    if set(fields.values()) - {column.id for column in columns if OUTPUT_CONFIG_KEY not in column.config} - {None}:
        raise AppError("RELATIONSHIP_COLUMN_NOT_FOUND", "Выберите исходные столбцы текущей таблицы.", 422)
    if not fields.get("name"):
        raise AppError("RELATIONSHIP_NAME_REQUIRED", "Укажите столбец с ФИО контакта.", 422)

    row_values = [
        (row.id, {key: _get_string(row.data.get(str(column)), None if key in {"interaction", "public_text", "feedback"} else 2000)
                  for key, column in fields.items() if column})
        for row in rows
    ]
    crm_fields = read_crm_fields(columns, rows)
    text_size = sum(len(values.get(field, "")) for _, values in row_values
                    for field in ("public_text", "interaction", "feedback"))
    extra_text = sum(len(fields.get(key, "")) for fields in crm_fields.values() for key in ("outcome", "next_step"))
    if text_size + extra_text + sum(len(document.text) for document in documents) > MAX_CORPUS_CHARS:
        raise AppError("RELATIONSHIP_TEXT_LIMIT", "Сократите корпус клиента до 600 000 символов.", 422)
    companies = {normalized(values["company"]): values["company"] for _, values in row_values if values.get("company")}
    if len(companies) > 1:
        raise AppError("RELATIONSHIP_MIXED_COMPANIES", "Для анализа одного клиента выделите его строки в отдельную таблицу.", 422)
    company = next(iter(companies.values()), table_name)
    feeds = {}
    for value in request.feed_urls:
        try:
            url = publication_url(value)
        except PublicationError as exc:
            raise AppError("RELATIONSHIP_FEED_URL", str(exc), 422) from exc
        feeds.setdefault(url, FeedStatus(url=url))
    if request.refresh_hours is not None and not feeds and not request.web_search:
        raise AppError("RELATIONSHIP_FEED_REQUIRED", "Для обновления по расписанию добавьте ленту или включите веб-поиск.", 422)

    contacts: dict[str, Contact] = {}
    sources: list[Source] = []
    relationships: list[Relationship] = []
    review: list[ReviewItem] = []
    review_sources: dict[str, Source] = {}
    publications: dict[str, LinkedPublication] = {}
    for value in request.urls:
        try:
            url = publication_url(value)
        except PublicationError as exc:
            raise AppError("RELATIONSHIP_PUBLICATION_URL", str(exc), 422) from exc
        _queue_publication(publications, url, urlsplit(url).netloc)

    row_contacts: list[tuple[UUID, dict[str, str], Contact]] = []
    seen: set[tuple] = set()
    account_loyalty = None
    for row_id, values in row_values:
        name = values.get("name", "")
        if not name:
            if any(values.values()):
                review.append(ReviewItem(label=f"Строка {row_id}", reason="Пропущена строка без ФИО.", confidence=0))
            continue
        raw_key = values.get("contact_key", "")
        row_fields = crm_fields[str(row_id)]
        for source_key, target_key in (("contact_key", "contact_id"), ("feedback", "feedback"), ("occurred_at", "occurred_at")):
            if values.get(source_key):
                row_fields.setdefault(target_key, values[source_key][:2000])
        key = raw_key.casefold() if raw_key else normalized(name)
        previous = contacts.get(key)
        title = values.get("title", "")
        department = values.get("department", "")
        role = ROLES.get(normalized(values.get("role", "")), "unknown")
        authority = AUTHORITY.get(normalized(values.get("authority", "")), "unknown")
        assessment = _assessment(values.get("assessment", ""))
        if previous and (
            normalized(previous.name) != normalized(name)
            or not raw_key and title and previous.title and normalized(title) != normalized(previous.title)
        ):
            raise AppError(
                "RELATIONSHIP_AMBIGUOUS_CONTACT",
                "Проверьте ФИО и идентификаторы: несколько контактов совпадают по ключу.", 422,
            )

        if previous is None:
            previous = Contact(id=str(row_id), key=key, name=name, title=title, department=department)
            contacts[key] = previous
        previous.title = title or previous.title
        previous.department = department or previous.department
        if role != "unknown":
            previous.role = role
        if authority != "unknown":
            previous.authority = authority
        if assessment is not None:
            previous.assessment = assessment
        previous.loyalty_assessment = values.get("loyalty") or previous.loyalty_assessment
        account_loyalty = values.get("account_loyalty") or account_loyalty
        row_contacts.append((row_id, values, previous))
        crm_text = " · ".join(part for part in (
            name, title, department, values.get("company", ""),
            f"Роль из CRM: {values['role']}" if values.get("role") else "",
            f"Право подписи: {values['authority']}" if values.get("authority") else "",
            f"Оценка влияния: {assessment}" if assessment is not None else "",
            f"Лояльность контакта: {values['loyalty']}" if values.get("loyalty") else "",
            f"Лояльность клиента: {values['account_loyalty']}" if values.get("account_loyalty") else "",
        ) if part)
        if ("crm", key, crm_text) not in seen:
            seen.add(("crm", key, crm_text))
            sources.append(Source(id=f"{row_id}-crm", kind="crm", label=f"Карточка · {name}",
                                  text=crm_text, contact_id=previous.id, row_id=row_id, collected_at=now))
        occurred = _date(values.get("occurred_at", ""))
        interaction = " · ".join(dict.fromkeys(part for part in (values.get("interaction"), row_fields.get("outcome"),
                                                                     values.get("feedback"), row_fields.get("next_step")) if part))
        if not interaction and occurred and (row_fields or values.get("interaction_type")):
            interaction = row_fields.get("interaction_type") or row_fields.get("channel") or "Касание из CRM"
        channel, author, project = (values.get(field) or None for field in ("interaction_type", "author", "project"))
        channel = row_fields.get("channel") or channel
        signature = ("interaction", key, row_fields.get("source_id"), row_fields.get("occurred_at") or occurred,
                     interaction, channel, author, project, row_fields.get("direction"))
        if interaction and signature not in seen:
            seen.add(signature)
            sources.append(Source(id=f"{row_id}-interaction", kind="interaction", label=f"Взаимодействие · {name}",
                                  text=interaction, contact_id=previous.id, occurred_at=occurred,
                                  row_id=row_id, collected_at=now, subject=name, channel=channel, author=author,
                                  project=project))

    if not contacts:
        raise AppError("RELATIONSHIP_EMPTY", "В таблице нет строк с контактами.", 422)
    if len(contacts) > MAX_CONTACTS:
        raise AppError("RELATIONSHIP_CONTACT_LIMIT", "Максимум 40 контактов в одном анализе.", 422)
    by_name: dict[str, list[Contact]] = {}
    for contact in contacts.values():
        by_name.setdefault(normalized(contact.name), []).append(contact)

    def add_publication(id: str, label: str, text: str, url: str | None, occurred: date | None,
                        row_id: UUID | None = None, expected: Contact | None = None) -> None:
        matched = _identify_publication(
            id, label, text, url, occurred, now, company, list(contacts.values()),
            {expected.id: row_id} if expected and row_id else {},
        )
        if isinstance(matched, ReviewItem):
            review.append(matched)
            review_sources[id] = Source(id=id, kind="publication", label=label, text=text, url=url,
                                        occurred_at=occurred, collected_at=now, row_id=row_id)
            return
        signature = ("publication", matched.contact_id, url, text)
        if signature in seen:
            return
        seen.add(signature)
        sources.append(matched)

    for row_id, values, contact in row_contacts:
        metadata = crm_fields[str(row_id)]
        relations = [
            (values.get("related_contact"), values.get("relation_type"), "relation"),
            (metadata.get("reports_to_id"), "reports_to", "reports-to"),
        ]
        for target, scope, suffix in relations:
            if not target or not scope:
                continue
            matches = by_name.get(normalized(target), [])
            other = contacts.get(target.casefold()) or (matches[0] if len(matches) == 1 else None)
            scope_key = "reports to" if normalized(scope) == "подчинение" else normalized(scope)
            signature = (contact.id, other.id if other else None, scope_key, metadata.get("project_id"),
                         metadata.get("valid_from"), metadata.get("valid_to"))
            if other and other.id != contact.id and signature not in seen:
                seen.add(signature)
                source = Source(id=f"{row_id}-{suffix}", kind="relationship", label="Связь из CRM",
                                text=f"{contact.name} → {other.name} · {scope}", row_id=row_id,
                                contact_id=contact.id, collected_at=now)
                sources.append(source)
                relationships.append(Relationship(from_id=contact.id, to_id=other.id, scope=scope, source_id=source.id))
            elif other is None or other.id == contact.id:
                review.append(ReviewItem(label=f"Связь · {contact.name}", reason="Проверьте идентификатор второго участника.", confidence=0))
        if values.get("public_text"):
            add_publication(f"{row_id}-publication", metadata.get("event_title") or f"Публикация · {contact.name}", values["public_text"],
                            safe_url(values.get("public_url", "")), _date(values.get("public_date", "")), row_id, contact)
        elif request.fetch_csv_urls and (value := values.get("public_url")):
            label = metadata.get("event_title") or f"Публикация · {contact.name}"
            try:
                url = publication_url(value)
            except PublicationError as exc:
                if ("invalid_url", value, contact.id) not in seen:
                    review.append(ReviewItem(label=label, reason=str(exc), confidence=0))
                    seen.add(("invalid_url", value, contact.id))
                continue
            _queue_publication(publications, url, label, {contact.id: row_id}, _date(values.get("public_date", "")))

    recordings = []
    for index, document in enumerate(documents, 1):
        url = safe_url(document.metadata.url or "")
        if document.metadata.url and not url:
            raise AppError("RELATIONSHIP_DOCUMENT_URL", "Укажите ссылку с http:// или https://.", 422)
        label = document.metadata.title or document.name
        if document.audio is not None:
            if len(recordings) == MAX_RECORDINGS:
                raise AppError("RELATIONSHIP_AUDIO_LIMIT", "В одном анализе можно обработать до трёх записей.", 422)
            contact_id = None
            if document.metadata.contact:
                by_key = contacts.get(document.metadata.contact.casefold())
                matches = [by_key] if by_key else by_name.get(normalized(document.metadata.contact), [])
                if len(matches) != 1:
                    raise AppError("RELATIONSHIP_AUDIO_CONTACT", "Для записи укажите ФИО или уникальный ID контакта из таблицы.", 422)
                contact_id = matches[0].id
            recordings.append(Recording(id=f"recording-{index}", label=label, url=url,
                                        contact_id=contact_id, occurred_at=document.metadata.date,
                                        encoded=base64.b64encode(document.audio).decode("ascii"),
                                        suffix=PurePath(document.name).suffix.casefold()))
        else:
            add_publication(f"document-{index}", label, document.text, url, document.metadata.date)

    supplied_urls = set()
    for source in sources:
        if source.kind == "publication" and source.url:
            try:
                supplied_urls.add(publication_url(source.url))
            except PublicationError:
                continue
    queued = [item for url, item in publications.items() if url not in supplied_urls]
    if len(queued) > MAX_REMOTE_PUBLICATIONS:
        raise AppError("RELATIONSHIP_PUBLICATION_LIMIT", "В одном запуске можно загрузить до 40 публикаций по ссылкам.", 422)
    return Corpus(company=company, collected_at=now, contacts=list(contacts.values()), relationships=relationships,
                  sources=[chunk for source in sources for chunk in chunk_source(source)], review=review,
                  publications=queued, review_sources=review_sources, recordings=recordings,
                  feeds=list(feeds.values()), account_loyalty=account_loyalty,
                  row_contacts={str(row_id): contact.id for row_id, _, contact in row_contacts},
                  crm_fields={row_id: fields for row_id, fields in crm_fields.items() if fields},
                  web_search=WebSearchStatus(total_contacts=len(contacts)) if request.web_search else None)


def _queue_publication(
    queue: dict[str, LinkedPublication], url: str, label: str, rows: dict[str, UUID] | None = None,
    occurred_at: date | None = None,
) -> None:
    if url not in queue:
        queue[url] = LinkedPublication(id=f"web-{len(queue) + 1}", url=url, label=label,
                                       contact_rows=rows or {}, occurred_at=occurred_at)
    elif queue[url].contact_rows and rows:
        for contact_id, row_id in rows.items():
            queue[url].contact_rows.setdefault(contact_id, row_id)
        queue[url].occurred_at = queue[url].occurred_at or occurred_at


def _identify_publication(
    id: str, label: str, text: str, url: str | None, occurred_at: date | None, now: datetime,
    company: str, contacts: list[Contact], contact_rows: dict[str, UUID], expected_contacts: list[str] | None = None,
) -> Source | ReviewItem:
    contact, score, reason = _match_identity(text, company, contacts, occurred_at, now.date())
    if contact and contact_rows and contact.id not in contact_rows:
        contact, reason = None, "Найденный участник отличается от контактов, указанных в CSV."
    if contact and expected_contacts and contact.id not in expected_contacts:
        contact, reason = None, "Публикация относится к другому контакту клиента."
    if contact is None:
        return ReviewItem(label=label, reason=reason, confidence=score, url=url, source_id=id)
    return Source(id=id, kind="publication", label=label, text=text, url=url, occurred_at=occurred_at,
                  collected_at=now, row_id=contact_rows.get(contact.id), contact_id=contact.id,
                  subject=contact.name, match_confidence=score)


def attach_publication(
    corpus: Corpus, item: LinkedPublication, downloaded: DownloadedPublication, now: datetime,
) -> None:
    item.label = downloaded.title or item.label
    item.url = downloaded.url
    item.retryable = False
    if _retained_size(corpus) + len(downloaded.text) > MAX_CORPUS_CHARS:
        item.state = "unavailable"
        item.reason = "Достигнут лимит текста для анализа клиента."
        return
    occurred = item.occurred_at or downloaded.occurred_at
    matched = _identify_publication(
        item.id, item.label, downloaded.text, item.url, occurred,
        now, corpus.company, corpus.contacts, item.contact_rows, item.expected_contacts,
    )
    if isinstance(matched, ReviewItem):
        item.state = "review"
        item.reason = matched.reason
        corpus.review.append(matched)
        corpus.review_sources[item.id] = Source(
            id=item.id, kind="publication", label=item.label, text=downloaded.text, url=item.url,
            occurred_at=occurred, collected_at=now, row_id=next(iter(item.contact_rows.values()), None),
        )
        return
    if not any(source.url == matched.url and source.contact_id == matched.contact_id for source in corpus.sources):
        corpus.sources.extend(chunk_source(matched))
    item.state = "included"
    item.reason = None


def _retained_size(corpus: Corpus) -> int:
    return sum(len(source.text) for source in corpus.sources) + sum(len(source.text) for source in corpus.review_sources.values())


def attach_recording(corpus: Corpus, recording: Recording, segments: list[Segment], now: datetime) -> None:
    if _retained_size(corpus) + sum(len(segment.text) for segment in segments) > MAX_CORPUS_CHARS:
        raise AppError("RELATIONSHIP_TEXT_LIMIT", "Достигнут лимит текста для анализа клиента.", 422)
    contact = next((contact for contact in corpus.contacts if contact.id == recording.contact_id), None)
    chunks = []
    for index, segment in enumerate(segments, 1):
        chunks.append(Source(
            id=f"{recording.id}-{index}", kind="interaction" if contact else "publication",
            label=recording.label, text=segment.text, url=recording.url, occurred_at=recording.occurred_at,
            collected_at=now, contact_id=contact.id if contact else None, subject=contact.name if contact else None,
            event_id=recording.id, channel="Аудиозапись", start_seconds=segment.start, end_seconds=segment.end,
        ))
    if contact is None:
        text = " ".join(segment.text for segment in segments)
        matched = _identify_publication(
            recording.id, recording.label, text, recording.url, recording.occurred_at, now, corpus.company, corpus.contacts, {},
        )
        if isinstance(matched, ReviewItem):
            corpus.review.append(matched)
            corpus.review_sources[recording.id] = chunks[0].model_copy(update={
                "id": recording.id, "text": text, "end_seconds": segments[-1].end,
            })
            recording.state = "review"
            return
        chunks = [item.model_copy(update={"contact_id": matched.contact_id, "subject": matched.subject,
                                         "match_confidence": matched.match_confidence}) for item in chunks]
    corpus.sources.extend(chunk for source in chunks for chunk in chunk_source(source))
    recording.state = "transcribed"


def chunk_source(source: Source) -> list[Source]:
    parts = split_text(source.text)
    return [
        source.model_copy(update={"id": source.id if index == 0 else f"{source.id}-part-{index}", "text": part})
        for index, part in enumerate(parts)
    ]
