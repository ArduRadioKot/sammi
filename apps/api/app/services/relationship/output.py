from datetime import datetime
from typing import Any

from app.models.table import TableColumn, TableRow
from app.schemas.relationship import OUTPUT_CONFIG_KEY, AnalysisReport, Contact, ContactAnalysis, Corpus
from app.services.relationship.prepare import detect_columns
from app.services.relationship.text import normalized, topics

OUTPUT_COLUMNS = {
    "decision_role": "text",
    "influence_level": "number",
    "influence_scope": "text",
    "relationship_trend": "text",
    "coverage_score": "number",
    "account_risks": "text",
    "professional_topics": "text",
    "next_action": "text",
    "last_touch_at": "date",
    "touches_90d": "number",
    "next_action_sources": "text",
    "next_action_author": "text",
    "analysis_updated_at": "date",
}
ROLE_LABELS = {"decision_maker": "ЛПР", "influencer": "ЛВР", "actual_decider": "ЧФПР"}
TREND_LABELS = {"improving": "Улучшаются", "stable": "Стабильны", "declining": "Ухудшаются"}
RELATION_LABELS = {
    "reports_to": "подчинение", "influences": "влияние", "collaborates_with": "сотрудничество",
    "introduced_by": "знакомство",
}


def input_fields(columns: list[TableColumn], saved: dict[str, Any]) -> dict[str, Any]:
    ids = {str(column.id) for column in columns if OUTPUT_CONFIG_KEY not in column.config}
    return {**detect_columns(columns), **{key: value for key, value in saved.items() if value is None or str(value) in ids}}


def contact_for_row(corpus: Corpus, row: TableRow, fields: dict[str, Any]) -> Contact | None:
    name = normalized(str(row.data.get(str(fields.get("name"))) or ""))
    if not name:
        return None
    key_value = row.data.get(str(fields.get("contact_key")))
    raw_key = str(key_value).strip() if key_value is not None else ""
    key = raw_key.casefold() or name
    expected = corpus.row_contacts.get(str(row.id))
    if corpus.row_contacts and expected is None:
        return None
    return next((item for item in corpus.contacts if item.key == key and normalized(item.name) == name
                 and (expected is None or item.id == expected)), None)


def output_values(
    report: AnalysisReport, corpus: Corpus, contact: ContactAnalysis, generated_at: datetime,
) -> dict[str, str | int | float | None]:
    names = {item.id: item.name for item in report.contacts}
    by_source = {source.id: source for source in corpus.sources}
    scopes = []
    for relation in report.connections:
        if contact.id not in {relation.from_id, relation.to_id}:
            continue
        outgoing = relation.from_id == contact.id
        other = names.get(relation.to_id if outgoing else relation.from_id)
        if other is None:
            continue
        scope = RELATION_LABELS.get(relation.scope, relation.scope)
        source = by_source.get(relation.source_id)
        if source:
            domains = sorted(topics(source.text))
            if domains:
                scope = f"{scope} ({', '.join(domains)})"
        scopes.append(f"{'→' if outgoing else '←'} {other} · {scope}")

    role = ROLE_LABELS.get(contact.decision_role)
    if role and not contact.role_confirmed:
        role += " · требует проверки"
    details = []
    if contact.next_action:
        for source in contact.next_action.citations:
            reference = source.url or (f"Строка CRM {source.row_id}" if source.row_id else source.label)
            details.append(f"{source.label} · {reference}\n{source.quote}")

    return {
        "decision_role": role,
        "influence_level": contact.influence_level,
        "influence_scope": "\n".join(dict.fromkeys(scopes)) or None,
        "relationship_trend": TREND_LABELS.get(contact.relationship_trend),
        "coverage_score": report.coverage_score,
        "account_risks": "\n".join(item.text for item in report.account_risks) or None,
        "professional_topics": ", ".join(item.text for item in contact.professional_topics) or None,
        "next_action": contact.next_action.text if contact.next_action else None,
        "last_touch_at": contact.last_touch_at.isoformat() if contact.last_touch_at else None,
        "touches_90d": contact.touches_90d,
        "next_action_sources": "\n\n".join(details) or None,
        "next_action_author": (
            {"gemma": "Gemma 4", "rules": "Правила Sammi"}.get(contact.next_action_author, "Анализ Sammi")
            if contact.next_action else None
        ),
        "analysis_updated_at": generated_at.isoformat(),
    }
