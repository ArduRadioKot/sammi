import uuid
from collections import defaultdict
from collections.abc import Iterable
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.table import TableColumn, TableRow, WorkspaceTable
from app.models.user import utc_now
from app.schemas.relationship import AnalysisDataset, AnalysisReport, Corpus, Finding, Source
from app.services.relationship.output import ROLE_LABELS, TREND_LABELS
from app.services.relationship.text import normalized, topics

ENTITY_FIELDS = {
    "companies": ("industry", "active_projects", "deal_value_total", "last_deal_at", "last_interaction_at",
                  "coverage_score", "relationship_score", "account_risks", "strategic_signals", "technology_stack"),
    "contacts": ("decision_role", "decision_authority", "influence_level", "department", "reports_to_id", "internal_owner",
                 "last_touch_at", "touches_90d", "relationship_status", "loyalty_assessment", "relationship_trend",
                 "professional_topics", "technologies_mentioned", "public_appearances", "profile_confidence", "next_action"),
    "interactions": ("contact_id", "employee_id", "occurred_at", "channel", "direction", "interaction_type", "project_id",
                     "topics", "summary", "outcome", "feedback", "next_step", "source_id"),
    "public_events": ("person_id", "event_type", "event_title", "event_date", "organizer", "person_role", "source_url",
                      "topics", "technologies", "explicit_positions", "evidence_excerpt", "confidence", "collected_at"),
    "relationships": ("source_contact_id", "target_contact_id", "relationship_type", "project_id", "influence_scope",
                      "strength", "valid_from", "valid_to", "confidence"),
}

DATASET_NAMES = {
    "companies": "Компании", "contacts": "Контакты", "interactions": "Взаимодействия",
    "public_events": "Публичные события", "relationships": "Связи",
}
IDENTIFIERS = {
    "companies": ("company",), "contacts": ("full_name", "contact_id", "title"),
    "interactions": (), "public_events": (), "relationships": (),
}
NUMBER_FIELDS = {
    "deal_value_total", "coverage_score", "relationship_score", "influence_level", "touches_90d",
    "profile_confidence", "confidence", "strength",
}
DATE_FIELDS = {
    "last_deal_at", "last_interaction_at", "last_touch_at", "occurred_at", "event_date", "collected_at", "valid_from", "valid_to",
}
Cell = str | int | float | bool | None
DatasetRows = dict[str, list[tuple[str, dict[str, Cell]]]]


def _join(values: Iterable[str | None], separator: str = "\n") -> str | None:
    return separator.join(dict.fromkeys(value for value in values if value)) or None


def _text(findings: Iterable[Finding], separator: str = "\n") -> str | None:
    return _join((item.text for item in findings), separator)


def _date(raw: str | date | datetime | None) -> str | None:
    if isinstance(raw, date):
        return raw.isoformat()
    if raw:
        try:
            return datetime.fromisoformat(raw).isoformat() if "T" in raw or " " in raw else date.fromisoformat(raw).isoformat()
        except ValueError:
            try:
                return datetime.strptime(raw, "%d.%m.%Y").date().isoformat()
            except ValueError:
                pass
    return None


def _number(raw: str | None) -> float | None:
    if not raw:
        return None
    try:
        value = float(raw.replace(" ", "").replace(",", "."))
    except ValueError:
        return None
    return value if float("-inf") < value < float("inf") else None


def _utc_key(raw: str) -> datetime:
    instant = datetime.fromisoformat(raw)
    return instant.astimezone(timezone.utc) if instant.tzinfo else instant.replace(tzinfo=timezone.utc)


def _field_type(name: str) -> str:
    if name in NUMBER_FIELDS:
        return "number"
    if name in DATE_FIELDS:
        return "date"
    return {"source_url": "url", "decision_authority": "boolean"}.get(name, "text")


def _event_key(source: Source) -> str:
    return source.event_id or source.id.split("-part-")[0]


def dataset_rows(report: AnalysisReport, corpus: Corpus) -> DatasetRows:
    rows: DatasetRows = {entity: [] for entity in ENTITY_FIELDS}
    by_source = {source.id: source for source in corpus.sources}
    publications = {item.id: item for item in corpus.publications}
    by_contact: dict[str, dict[str, str]] = defaultdict(dict)
    company: dict[str, str] = {}
    for row_id, contact_id in corpus.row_contacts.items():
        fields = corpus.crm_fields.get(row_id, {})
        by_contact[contact_id].update(fields)
        company.update({key: value for key, value in fields.items() if key in ENTITY_FIELDS["companies"]})

    identity = {person.id: by_contact[person.id].get("contact_id") or person.id for person in corpus.contacts}
    people = {person.id: person for person in corpus.contacts}
    managers: dict[str, list[str]] = defaultdict(list)
    for edge in report.connections:
        if normalized(edge.scope) in {"reports to", "подчинение"} and edge.to_id in identity:
            managers[edge.from_id].append(identity[edge.to_id])

    interactions: dict[tuple[str, str], list[Source]] = defaultdict(list)
    events: dict[tuple[str, str], list[Source]] = defaultdict(list)
    for source in corpus.sources:
        if source.contact_id not in identity:
            continue
        if source.kind == "interaction":
            interactions[source.contact_id, str(source.row_id) if source.row_id else _event_key(source)].append(source)
        elif source.kind == "publication":
            events[source.contact_id, source.url or _event_key(source)].append(source)
    rows["companies"].append(("account", {
        "company": report.company, "industry": company.get("industry"), "active_projects": company.get("active_projects"),
        "deal_value_total": _number(company.get("deal_value_total")), "last_deal_at": _date(company.get("last_deal_at")),
        "last_interaction_at": max(filter(None, [_date(company.get("last_interaction_at")), *(
            _date(corpus.crm_fields.get(str(items[0].row_id), {}).get("occurred_at")) or _date(items[0].occurred_at)
            for items in interactions.values())]), default=None, key=_utc_key),
        "coverage_score": report.coverage_score, "relationship_score": report.relationship_score,
        "account_risks": _text(report.account_risks), "strategic_signals": _text(report.alerts),
        "technology_stack": _join((item.text for contact in report.contacts for item in contact.technologies
                                    if any(citation.kind == "interaction" for citation in item.citations)), ", ")
                            or company.get("technology_stack"),
    }))

    timelines = {(contact.id, item.source_id): item for contact in report.contacts for item in contact.interactions}
    profiles = {contact.id: contact for contact in report.contacts}
    for contact in report.contacts:
        source_person = people[contact.id]
        fields = by_contact[contact.id]
        last_touch = max(filter(None, [_date(fields.get("last_touch_at")), _date(contact.last_touch_at)]),
                         key=_utc_key, default=None)
        recorded_count = _number(fields.get("touches_90d"))
        touches = contact.touches_90d
        if recorded_count is not None and recorded_count.is_integer() and 0 <= recorded_count <= 2**53 - 1:
            touches = max(touches, int(recorded_count))
        rows["contacts"].append((contact.id, {
            "full_name": contact.name, "contact_id": identity[contact.id], "title": contact.title,
            "decision_role": ROLE_LABELS.get(contact.decision_role), "influence_level": contact.influence_level,
            "decision_authority": {"signing": True, "no_signing": False}.get(source_person.authority),
            "department": contact.department, "reports_to_id": fields.get("reports_to_id") or _join(managers[contact.id], ", "),
            "internal_owner": fields.get("internal_owner"), "last_touch_at": last_touch,
            "touches_90d": touches, "relationship_status": fields.get("relationship_status"),
            "loyalty_assessment": contact.loyalty_assessment, "relationship_trend": TREND_LABELS.get(contact.relationship_trend),
            "professional_topics": _text(contact.professional_topics, ", "), "technologies_mentioned": _text(contact.technologies, ", "),
            "public_appearances": _join(items[0].label for (person, _), items in events.items() if person == contact.id),
            "profile_confidence": contact.profile_confidence, "next_action": contact.next_action.text if contact.next_action else None,
        }))
    for (person, event_id), items in interactions.items():
        source = items[0]
        fields = corpus.crm_fields.get(str(source.row_id), {})
        timeline = timelines.get((person, event_id))
        all_topics = sorted({topic for item in items for topic in topics(item.text)})
        rows["interactions"].append((f"{person}:{event_id}", {
            "contact_id": identity[person], "employee_id": fields.get("employee_id"),
            "occurred_at": _date(fields.get("occurred_at")) or _date(source.occurred_at),
            "channel": fields.get("channel") or source.channel, "direction": fields.get("direction"),
            "interaction_type": fields.get("interaction_type"), "project_id": fields.get("project_id"),
            "topics": _text(timeline.topics, ", ") if timeline else _join(all_topics, ", "),
            "summary": timeline.summary.text if timeline else source.text[:450], "outcome": fields.get("outcome"),
            "feedback": fields.get("feedback"), "next_step": fields.get("next_step"),
            "source_id": fields.get("source_id") or event_id,
        }))

    for (person, event_id), items in events.items():
        source = items[0]
        linked = publications.get(_event_key(source))
        crm_row = linked.contact_rows.get(person) if linked else source.row_id if source.id.startswith(str(source.row_id)) else None
        fields = corpus.crm_fields.get(str(crm_row), {})
        ids = {item.id for item in items}
        contact = profiles[person]
        details = [report.public_event_details.get(item.id, {}) for item in items]

        def detail(key: str) -> str | None:
            return next((fragment[key] for fragment in details if fragment.get(key)), None)

        def extracted_values(key: str, delimiter: str) -> str | None:
            return _join((line for fragment in details for line in fragment.get(key, "").splitlines()), delimiter)

        def from_event(findings: Iterable[Finding], separator: str = "\n") -> str | None:
            return _text((item for item in findings if any(citation.source_id in ids for citation in item.citations)), separator)
        rows["public_events"].append((f"{person}:{event_id}", {
            "person_id": identity[person], "event_type": fields.get("event_type") or detail("event_type"),
            "event_title": fields.get("event_title") or source.label, "event_date": _date(source.occurred_at),
            "organizer": fields.get("organizer") or detail("organizer"),
            "person_role": fields.get("person_role") or detail("person_role"),
            "source_url": source.url, "topics": extracted_values("topic", ", ") or from_event(contact.professional_topics, ", "),
            "technologies": extracted_values("technology", ", ") or from_event(contact.technologies, ", "),
            "explicit_positions": extracted_values("position", "\n") or from_event(contact.positions),
            "evidence_excerpt": detail("evidence_excerpt") or source.text[:450],
            "confidence": source.match_confidence, "collected_at": _date(source.collected_at),
        }))

    for edge in report.connections:
        if edge.from_id not in identity or edge.to_id not in identity:
            continue
        source = by_source.get(edge.source_id)
        fields = corpus.crm_fields.get(str(source.row_id), {}) if source and source.label == "Связь из CRM" else {}
        rows["relationships"].append((edge.source_id, {
            "source_contact_id": identity[edge.from_id], "target_contact_id": identity[edge.to_id],
            "relationship_type": edge.scope, "project_id": fields.get("project_id"),
            "influence_scope": fields.get("influence_scope"),
            "strength": _number(fields.get("strength")),
            "valid_from": _date(fields.get("valid_from")), "valid_to": _date(fields.get("valid_to")),
            "confidence": _number(fields.get("confidence")) if fields.get("confidence") else
                          (1.0 if source and (source.verification or source.label == "Связь из CRM") else None),
        }))
    return rows


def _reference(table: WorkspaceTable) -> AnalysisDataset:
    return AnalysisDataset(entity=table.relationship_entity, table_id=table.id, name=DATASET_NAMES[table.relationship_entity])


async def _tables(session: AsyncSession, table_id: uuid.UUID) -> dict[str, WorkspaceTable]:
    records = (await session.scalars(select(WorkspaceTable).where(WorkspaceTable.relationship_source_id == table_id))).all()
    return {table.relationship_entity: table for table in records}


async def list_datasets(session: AsyncSession, table_id: uuid.UUID) -> list[AnalysisDataset]:
    tables = await _tables(session, table_id)
    return [_reference(tables[entity]) for entity in ENTITY_FIELDS if entity in tables]


async def save_datasets(session: AsyncSession, source: WorkspaceTable, report: AnalysisReport, corpus: Corpus) -> list[AnalysisDataset]:
    # The caller holds a lock on the source table, serializing publication and refresh.
    tables = await _tables(session, source.id)
    now = utc_now()
    entries = dataset_rows(report, corpus)
    results = []
    for entity, fields in ENTITY_FIELDS.items():
        table = tables.get(entity)
        if table is None:
            label = DATASET_NAMES[entity]
            table = WorkspaceTable(
                id=uuid.uuid4(), workspace_id=source.workspace_id, created_by=source.created_by,
                name=f"{source.name[:160]} · {label}", object_type="custom",
                relationship_source_id=source.id, relationship_entity=entity,
            )
            session.add(table)
            await session.flush()
        columns = {column.name: column for column in (await session.scalars(
            select(TableColumn).where(TableColumn.table_id == table.id),
        )).all()}
        for position, name in enumerate((*IDENTIFIERS[entity], *fields), start=1):
            if name not in columns:
                columns[name] = TableColumn(id=uuid.uuid4(), table_id=table.id, name=name, type=_field_type(name),
                                            position=position, config={})
                session.add(columns[name])
        existing = {row.id: row for row in (await session.scalars(select(TableRow).where(TableRow.table_id == table.id))).all()}
        changed = False
        for position, (key, values) in enumerate(entries[entity], start=1):
            row_id = uuid.uuid5(table.id, key)
            data = {str(columns[name].id): value for name, value in values.items() if value is not None and value != ""}
            row = existing.pop(row_id, None)
            if row is None:
                session.add(TableRow(id=row_id, table_id=table.id, position=position, data=data))
                changed = True
            elif data != row.data or position != row.position:
                row.data, row.position, row.updated_at = data, position, now
                changed = True
        for removed in existing.values():
            await session.delete(removed)
        if changed or existing:
            table.updated_at = now
        results.append(_reference(table))
    await session.flush()
    return results
