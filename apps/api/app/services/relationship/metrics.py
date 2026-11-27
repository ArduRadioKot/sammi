import re
from collections import defaultdict, deque
from datetime import timedelta

from app.core.config import get_settings
from app.models.user import utc_now
from app.schemas.relationship import (
    AnalysisReport, AnswerItem, Citation, Contact, ContactAnalysis, Corpus, DepartmentCoverage, Finding,
    InteractionAnalysis, ProposedRelationship, PublicationStatus, RecordingStatus, Role, Signal, Source, Trend,
)
from app.services.relationship.retrieval import similarity
from app.services.relationship.text import cite, normalized, topics

WEIGHTS = (
    ("Полномочия", 0.30),
    ("Участие в решениях", 0.25),
    ("Связи в карте", 0.20),
    ("Публичная экспертиза", 0.15),
    ("Оценка менеджера", 0.10),
)
APPROVAL = re.compile(r"(?<!не )(?<!not )\b(?:согласовал[аи]?|утвердил[аи]?|подписал[аи]?|принял[аи]? решение|approved|signed)\b", re.I)
FINAL = re.compile(r"(?<!не )\b(?:принял[аи]? окончательное решение|окончательное решение за|фактически утверждает)\b", re.I)
NEGATIVE = re.compile(r"\b(?:недоволен|недовольны|недовольна|отказал[аи]?|негативн\w+|претензия|эскалация)\b", re.I)
POSITIVE = re.compile(r"\b(?:доволен|довольны|довольна|положительн\w+ отзыв|одобрил[аи]?|поблагодарил[аи]?)\b", re.I)
KEY_ROLES = {"decision_maker", "influencer", "actual_decider"}


def key_role_coverage(contacts: list[ContactAnalysis]) -> tuple[int, int, float | None]:
    confirmed = [item for item in contacts if item.decision_role in KEY_ROLES and item.role_confirmed]
    roles = {item.decision_role for item in confirmed}
    covered = {item.decision_role for item in confirmed if item.touches_90d > 0}
    return len(covered), len(roles), round(len(covered) / len(roles), 2) if roles else None


def _distinct_rows(sources: list[Source]) -> list[Source]:
    by_row = {}
    for source in sources:
        by_row.setdefault(_event_id(source), source)
    return list(by_row.values())


def _citations(sources: list[Source]) -> list[Citation]:
    return [cite(source, source.text) for source in _distinct_rows(sources)[:3]]


def _unique_findings(findings: list[Finding], limit: int = 6) -> list[Finding]:
    by_text: dict[str, Finding] = {}
    for finding in findings:
        key = normalized(finding.text)
        previous = by_text.get(key)
        if previous is None:
            by_text[key] = finding
        else:
            evidence = {citation.source_id: citation for citation in [*previous.citations, *finding.citations]}
            citations = sorted(evidence.values(), key=lambda citation: citation.verification is not None, reverse=True)
            by_text[key] = previous.model_copy(update={"citations": citations[:3]})
    return list(by_text.values())[:limit]


def _event_id(source: Source) -> str:
    return source.event_id or (str(source.row_id) if source.row_id else source.id.split("-part-")[0])


def _timeline(interactions: list[Source], llm: list[tuple[str, Finding]]) -> list[InteractionAnalysis]:
    events: dict[str, list[Source]] = defaultdict(list)
    by_source: dict[str, list[tuple[str, Finding]]] = defaultdict(list)
    for source in interactions:
        events[_event_id(source)].append(source)
    for kind, item in llm:
        for citation in item.citations:
            by_source[citation.source_id].append((kind, item))
    ordered = sorted(events.values(), key=lambda sources: (sources[0].occurred_at is not None, sources[0].occurred_at),
                     reverse=True)
    timeline = []
    for sources in ordered[:20]:
        source = sources[0]
        extracted = [item for fragment in sources for item in by_source[fragment.id]]
        kinds = {kind for kind, _ in extracted}
        negative = "negative_feedback" in kinds or any(NEGATIVE.search(item.text) for item in sources)
        positive = "positive_feedback" in kinds or any(POSITIVE.search(item.text) for item in sources)
        tone = "mixed" if negative and positive else "negative" if negative else "positive" if positive else (
            "neutral" if "neutral_feedback" in kinds or "summary" in kinds else "unknown"
        )
        summary = next((item for kind, item in extracted if kind == "summary"), None)
        related = [item for kind, item in extracted if kind == "topic"]
        related += [Finding(text=topic, citations=[cite(fragment, fragment.text)])
                    for fragment in sources for topic in sorted(topics(fragment.text))]
        timeline.append(InteractionAnalysis(
            source_id=_event_id(source), occurred_at=source.occurred_at, author=source.author,
            channel=source.channel, project=source.project, sentiment=tone,
            summary=summary or Finding(text=source.text[:260], citations=[cite(source)]),
            topics=_unique_findings(related, 4),
        ))
    return timeline


def _proposed_relationships(corpus: Corpus, extracted: dict[str, list[tuple[str, Finding]]]) -> list[ProposedRelationship]:
    names: dict[str, list[Contact]] = defaultdict(list)
    for contact in corpus.contacts:
        names[normalized(contact.name)].append(contact)
    present = {(edge.from_id, edge.to_id, normalized(edge.scope)) for edge in corpus.relationships}
    proposals = {}
    for contact in corpus.contacts:
        for kind, finding in extracted.get(contact.id, []):
            if kind != "relationship" or not finding.citations:
                continue
            scope, separator, name = finding.text.partition("|")
            scope = scope.strip()
            matches = names[normalized(name)]
            if not separator or scope not in {"reports_to", "influences", "collaborates_with"} or len(matches) != 1:
                continue
            target = matches[0]
            quote = f" {normalized(finding.citations[0].quote)} "
            if contact.id == target.id or (contact.id, target.id, normalized(scope)) in present:
                continue
            if any(f" {normalized(item.name)} " not in quote for item in (contact, target)):
                continue
            label = {"reports_to": "подчинение", "influences": "влияние", "collaborates_with": "сотрудничество"}[scope]
            if (contact.id, target.id, label) in present or (scope == "collaborates_with" and (
                (target.id, contact.id, normalized(scope)) in present or (target.id, contact.id, label) in present
            )):
                continue
            identifier = f"{contact.id}:{target.id}:{scope}"
            proposals.setdefault(identifier, ProposedRelationship(
                id=identifier, from_id=contact.id, to_id=target.id, scope=scope,
                finding=Finding(text=f"{contact.name} → {target.name} · {label}", citations=finding.citations),
            ))
    return list(proposals.values())[:20]


def build_report(
    corpus: Corpus,
    extracted: dict[str, list[tuple[str, Finding]]] | None = None,
) -> AnalysisReport:
    extracted = extracted or {}
    sources_by_contact: dict[str, list[Source]] = defaultdict(list)
    edges_by_contact: dict[str, list[Source]] = defaultdict(list)
    source_map = {source.id: source for source in corpus.sources}
    for source in corpus.sources:
        if source.contact_id:
            sources_by_contact[source.contact_id].append(source)

    relationships = []
    for edge in corpus.relationships:
        if source := source_map.get(edge.source_id):
            edges_by_contact[edge.from_id].append(source)
            edges_by_contact[edge.to_id].append(source)
            relationships.append(Finding(text=source.text, citations=[cite(source, source.text)]))

    today = corpus.collected_at.date()
    cutoff = today - timedelta(days=90)
    previous_cutoff = cutoff - timedelta(days=90)
    contacts = []
    alerts = []
    risks = []
    approval_counts: dict[str, int] = {}
    extracted_signals: dict[str, dict[str, set[str]]] = {}
    public_event_details: dict[str, dict[str, str]] = defaultdict(dict)
    for contact_id, items in extracted.items():
        kinds: dict[str, set[str]] = defaultdict(set)
        for kind, item in items:
            kinds[kind].update(citation.source_id for citation in item.citations)
            for citation in item.citations:
                if citation.kind != "publication":
                    continue
                values = public_event_details[citation.source_id]
                values.setdefault("evidence_excerpt", citation.quote)
                if kind in {"event_type", "organizer", "person_role", "topic", "technology", "position"}:
                    prior = values.get(kind, "")
                    values[kind] = "\n".join(dict.fromkeys(filter(None, [*prior.splitlines(), item.text])))
        extracted_signals[contact_id] = kinds
    approvals_by_contact = {}
    for contact in corpus.contacts:
        all_sources = sources_by_contact[contact.id]
        signals = extracted_signals.get(contact.id, {})
        decisions = signals.get("approval", set()) | signals.get("final_decision", set())
        approvals = [source for source in all_sources
                     if source.kind == "interaction" and (source.id in decisions or APPROVAL.search(source.text))]
        approvals_by_contact[contact.id] = approvals
        approval_counts[contact.id] = len(_distinct_rows(approvals))
    formal_decisions = max((approval_counts[c.id] for c in corpus.contacts if c.authority == "signing"), default=None)

    for contact in corpus.contacts:
        sources = sources_by_contact[contact.id]
        crm = [source for source in sources if source.kind == "crm"]
        interactions = [source for source in sources if source.kind == "interaction"]
        dated = sorted(
            (source for source in _distinct_rows(interactions)
             if source.occurred_at is not None and source.occurred_at <= today),
            key=lambda source: source.occurred_at,
            reverse=True,
        )
        recent = [source for source in dated if source.occurred_at > cutoff]
        previous = [source for source in dated if previous_cutoff < source.occurred_at <= cutoff]
        public = [source for source in sources if source.kind == "publication"]
        recorded_topics = [
            Finding(text=topic, citations=[cite(source, source.text)])
            for source in public + interactions for topic in sorted(topics(source.text))
        ]
        llm = extracted.get(contact.id, [])
        classified = extracted_signals.get(contact.id, {})
        professional_topics = _unique_findings(recorded_topics + [item for kind, item in llm if kind == "topic"])
        technologies = _unique_findings([item for kind, item in llm if kind == "technology"])
        negative = [source for source in interactions if source.occurred_at and cutoff < source.occurred_at <= today
                    and (source.id in classified.get("negative_feedback", set()) or NEGATIVE.search(source.text))]
        positive = [source for source in interactions if source.occurred_at and cutoff < source.occurred_at <= today
                    and (source.id in classified.get("positive_feedback", set()) or POSITIVE.search(source.text))]
        latest = dated[0].occurred_at if dated else None
        approvals = approvals_by_contact[contact.id]
        topic_ids = classified.get("topic", set()) | classified.get("technology", set())
        public_expertise = [source for source in public if source.id in topic_ids or topics(source.text)]
        authority_evidence = [source for source in crm if "Право подписи:" in source.text]
        manager_evidence = [source for source in crm if "Оценка влияния:" in source.text]
        components = [
            (float(contact.authority == "signing"), authority_evidence),
            (min(1, approval_counts[contact.id] / 2), approvals),
            (min(1, len(edges_by_contact[contact.id]) / 3), edges_by_contact[contact.id]),
            (min(1, len({source.id.split("-part-")[0] for source in public_expertise}) / 2), public_expertise),
            (contact.assessment or 0, manager_evidence),
        ]
        signals = [
            Signal(label=label, weight=weight, value=value, citations=_citations(evidence))
            for (label, weight), (value, evidence) in zip(WEIGHTS, components) if evidence
        ]
        influence = round(sum(signal.weight * signal.value for signal in signals), 2) if signals else None
        final_decisions = _distinct_rows([source for source in interactions
                                        if source.id in classified.get("final_decision", set()) or FINAL.search(source.text)])
        role, confirmed = _role(contact, influence, len(final_decisions), formal_decisions)
        manual_role = [source for source in crm if "Роль из CRM:" in source.text]
        decision_sources = final_decisions if role == "actual_decider" else approvals
        role_evidence = _citations(manual_role or authority_evidence + decision_sources) if role != "unknown" else []

        trend: Trend = "unknown"
        if recent or previous:
            if negative or len(recent) < len(previous):
                trend = "declining"
            elif positive or len(recent) > len(previous) and previous:
                trend = "improving"
            else:
                trend = "stable"
        engagement = round(min(1, len(recent) / 3) * 0.6 + max(0, 1 - (today - latest).days / 90) * 0.4, 2) if latest else None
        health = round(min(1, max(0, engagement + 0.15 * bool(positive) - 0.25 * bool(negative))), 2) if engagement is not None else None
        taxonomy_matches = {finding.text for finding in recorded_topics}
        relevance = round(min(1, len(taxonomy_matches) / 3), 2) if professional_topics else None

        if latest and latest <= cutoff:
            item = Finding(text=f"{contact.name}: последнее касание было {(today - latest).days} дн. назад.",
                           citations=_citations(dated[:1]))
            if role in KEY_ROLES:
                risks.append(item)
            if len(previous) >= get_settings().relationship_stale_alert_min_touches:
                alerts.append(item)
        if negative:
            alerts.append(Finding(text=f"{contact.name}: негативная обратная связь.", citations=_citations(negative)))
        known_topics = {topic for source in interactions for topic in topics(source.text)}
        for source in public:
            if source.occurred_at and cutoff < source.occurred_at <= today:
                new_topics = sorted(topics(source.text) - known_topics)
                if new_topics:
                    alerts.append(Finding(text=f"{contact.name}: в публикации появилась тема «{new_topics[0]}».",
                                          citations=[cite(source, source.text)]))
                    break
        alerts.extend(item for kind, item in llm if kind == "role_change"
                      and any(citation.occurred_at and cutoff < citation.occurred_at <= today for citation in item.citations))
        next_action = next((item for kind, item in llm if kind == "next_action"), None)
        next_action_author = "gemma" if next_action is not None else "rules"
        if next_action is not None and next_action.citations[0].kind == "publication":
            quote = next_action.citations[0].quote
            corroborated = max(interactions, key=lambda source: similarity(quote, source.text), default=None)
            if corroborated is not None and similarity(quote, corroborated.text) >= 0.28:
                next_action = next_action.model_copy(update={"citations": [*next_action.citations, cite(corroborated)]})
        if next_action is None and professional_topics:
            topic = professional_topics[0]
            next_action = Finding(text=f"Обсудить с контактом тему «{topic.text}» на следующей встрече.",
                                  citations=topic.citations)
        if next_action is None and dated:
            next_action = Finding(text="Уточнить статус договорённостей из последнего взаимодействия.",
                                  citations=_citations(dated[:1]))
        person_evidence = [Finding(text=contact.name, citations=_citations(crm[:1]))] if crm else []
        title_evidence = [Finding(text=contact.title, citations=_citations(
            [source for source in crm if contact.title in source.text][:1],
        ))] if contact.title and crm else []
        company_evidence = [source for source in crm if f" {normalized(corpus.company)} " in f" {normalized(source.text)} "]
        organizations = [Finding(text=corpus.company, citations=_citations(company_evidence[:1]))] if company_evidence else []
        people = person_evidence + [item for kind, item in llm if kind == "person"]
        organizations += [item for kind, item in llm if kind == "organization"]
        titles = title_evidence + [item for kind, item in llm if kind == "job_title"]
        contacts.append(ContactAnalysis(
            id=contact.id, name=contact.name, title=contact.title, department=contact.department,
            decision_role=role, role_confirmed=confirmed, role_evidence=role_evidence,
            influence_level=influence, influence_signals=signals,
            relationship_trend=trend, last_touch_at=latest, touches_90d=len(recent),
            interaction_evidence=_citations(dated),
            engagement_score=engagement, relationship_health=health, business_relevance=relevance,
            professional_topics=professional_topics, technologies=technologies, next_action=next_action,
            next_action_author=next_action_author if next_action is not None else None,
            loyalty_assessment=contact.loyalty_assessment,
            loyalty_evidence=_citations([source for source in crm if "Лояльность контакта:" in source.text]),
            people=_unique_findings(people), organizations=_unique_findings(organizations), job_titles=_unique_findings(titles),
            positions=_unique_findings([item for kind, item in llm if kind == "position"]),
            interactions=_timeline(interactions, llm),
            public_events=_unique_findings([Finding(text=source.label, citations=[cite(source)]) for source in public], 12),
            profile_confidence=max((source.match_confidence for source in public if source.match_confidence is not None), default=None),
        ))

    key_contacts = [contact for contact in contacts if contact.decision_role in KEY_ROLES]
    covered = sum(contact.touches_90d > 0 for contact in key_contacts)
    covered_roles, roles, coverage_score = key_role_coverage(contacts)
    if len(key_contacts) >= 2 and covered == 1:
        single = next(contact for contact in key_contacts if contact.touches_90d)
        risks.insert(0, Finding(
            text=f"Из ключевых контактов в последние 90 дней общались только с {single.name}.",
            citations=_citations(active_evidence_for(corpus, single.id, cutoff, today)),
        ))
    health_scores = [item.relationship_health for item in contacts if item.relationship_health is not None]
    department_members: dict[str, list[ContactAnalysis]] = defaultdict(list)
    for contact in contacts:
        if contact.department:
            department_members[contact.department].append(contact)
    departments = [
        DepartmentCoverage(
            department=department, total=len(members), reached=sum(member.touches_90d > 0 for member in members),
            evidence=_citations([source for member in members for source in active_evidence_for(corpus, member.id, cutoff, today)]),
        )
        for department, members in sorted(department_members.items())
    ]
    account_evidence = [source for source in corpus.sources if source.kind == "crm" and "Лояльность клиента:" in source.text]
    return AnalysisReport(
        company=corpus.company, contacts=contacts,
        coverage_score=coverage_score,
        covered_key_contacts=covered, key_contacts=len(key_contacts),
        covered_key_roles=covered_roles, key_roles=roles,
        relationship_score=round(sum(health_scores) / len(health_scores), 2) if health_scores else None,
        relationships=relationships, connections=corpus.relationships, public_connections=corpus.public_connections,
        account_risks=_unique_findings(risks, 15),
        alerts=_unique_findings(alerts, 20), review=corpus.review,
        publications=publication_statuses(corpus),
        recordings=[
            RecordingStatus(id=item.id, label=item.label, state=item.state, reason=item.reason, retryable=item.retryable)
            for item in corpus.recordings
        ],
        feeds=corpus.feeds, departments=departments, account_loyalty=corpus.account_loyalty,
        account_evidence=_citations(account_evidence),
        proposed_relationships=_proposed_relationships(corpus, extracted),
        generated_at=utc_now(), web_search=corpus.web_search, public_event_details=public_event_details,
    )


def publication_statuses(corpus: Corpus) -> list[PublicationStatus]:
    return [PublicationStatus(id=item.id, label=item.label, url=item.url, state=item.state,
                              reason=item.reason, retryable=item.retryable, search_provider=item.search_provider)
            for item in corpus.publications[-60:]]


def active_evidence_for(corpus: Corpus, contact_id, cutoff, today) -> list[Source]:
    return [source for source in corpus.sources if source.contact_id == contact_id and source.kind == "interaction"
            and source.occurred_at is not None and cutoff < source.occurred_at <= today]


def _role(contact: Contact, influence: float | None, decisions: int, formal_decisions: int | None) -> tuple[Role, bool]:
    if contact.role != "unknown":
        return contact.role, True
    if influence is None:
        return "unknown", False
    settings = get_settings()
    if influence > settings.relationship_decision_threshold and contact.authority == "signing":
        return "decision_maker", True
    if formal_decisions is not None and decisions > formal_decisions and decisions >= 2 and contact.authority == "no_signing":
        return "actual_decider", influence >= settings.relationship_confirmation_threshold
    if influence > settings.relationship_influence_threshold and contact.authority == "no_signing":
        return "influencer", influence >= settings.relationship_confirmation_threshold
    return "unknown", False


def find_path(corpus: Corpus, start: str, target: str) -> AnswerItem:
    sources = {source.id: source for source in corpus.sources}
    names = {contact.id: contact.name for contact in corpus.contacts}
    adjacent = defaultdict(list)
    for edge in corpus.relationships:
        adjacent[edge.from_id].append((edge.to_id, edge.source_id))
        adjacent[edge.to_id].append((edge.from_id, edge.source_id))
    queue = deque([(start, [start], [])])
    visited = {start}
    while queue:
        node, path, evidence = queue.popleft()
        if node == target:
            return AnswerItem(text=" → ".join(names[item] for item in path), status="evidence",
                              citations=[cite(sources[id]) for id in evidence])
        for neighbor, reference in adjacent[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append((neighbor, [*path, neighbor], [*evidence, reference]))
    return AnswerItem(text="В данных клиента нет подтверждённой цепочки связей между этими контактами.",
                      status="hypothesis")
