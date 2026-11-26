import uuid
from datetime import date, datetime
from datetime import date as CalendarDate
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

SourceKind = Literal["crm", "interaction", "relationship", "publication"]
Role = Literal["decision_maker", "influencer", "actual_decider", "unknown"]
Trend = Literal["improving", "stable", "declining", "unknown"]
OUTPUT_CONFIG_KEY = "relationship_output"
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]

FIELD_ALIASES = {
    "name": ("name", "full_name", "contact_name", "контакт", "имя", "фио"),
    "contact_key": ("contact_id", "external_id", "id контакта"),
    "company": ("company", "company_name", "account", "компания", "клиент"),
    "title": ("title", "position", "job_title", "должность"),
    "department": ("department", "team", "отдел", "подразделение"),
    "role": ("decision_role", "role", "роль"),
    "authority": ("decision_authority", "signatory", "право подписи", "полномочия"),
    "assessment": ("manager_influence", "оценка влияния"),
    "interaction": ("interaction", "summary", "outcome", "итог встречи", "взаимодействие", "протокол"),
    "occurred_at": ("occurred_at", "interaction_at", "дата встречи", "дата взаимодействия"),
    "feedback": ("feedback", "обратная связь"),
    "interaction_type": ("interaction_type", "channel", "канал", "тип взаимодействия"),
    "author": ("employee_name", "author", "сотрудник", "автор взаимодействия"),
    "project": ("project_name", "project", "проект"),
    "loyalty": ("loyalty_assessment", "лояльность контакта"),
    "account_loyalty": ("account_loyalty", "лояльность клиента"),
    "related_contact": ("target_contact_id", "related_contact", "связанный контакт"),
    "relation_type": ("relationship_type", "relation_type", "тип связи"),
    "public_text": ("public_text", "publication", "текст публикации", "выступление"),
    "public_url": ("source_url", "public_url", "ссылка на источник"),
    "public_date": ("event_date", "public_date", "дата публикации"),
}

FieldName = Literal[
    "name", "contact_key", "company", "title", "department", "role", "authority", "assessment",
    "interaction", "occurred_at", "feedback", "related_contact", "relation_type",
    "public_text", "public_url", "public_date", "interaction_type", "author", "project", "loyalty", "account_loyalty",
]


class DocumentMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: ShortText | None = None
    url: Annotated[str, StringConstraints(max_length=2000)] | None = None
    date: CalendarDate | None = None
    contact: ShortText | None = None


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    columns: dict[FieldName, uuid.UUID | None] = Field(default_factory=dict)
    documents: list[DocumentMetadata] = Field(default_factory=list, max_length=8)
    urls: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]] = Field(
        default_factory=list, max_length=8,
    )
    fetch_csv_urls: bool = False
    web_search: bool = False
    feed_urls: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]] = Field(
        default_factory=list, max_length=4,
    )
    refresh_hours: Literal[24, 168] | None = None


class Verification(BaseModel):
    reviewer: str
    reviewed_at: datetime


class Source(BaseModel):
    id: str
    kind: SourceKind
    label: str
    text: str
    occurred_at: date | None = None
    collected_at: datetime
    url: str | None = None
    row_id: uuid.UUID | None = None
    contact_id: str | None = None
    subject: str | None = None
    match_confidence: float | None = None
    verification: Verification | None = None
    event_id: str | None = None
    channel: str | None = None
    author: str | None = None
    project: str | None = None
    start_seconds: int | None = None
    end_seconds: int | None = None


class Citation(BaseModel):
    source_id: str
    label: str
    kind: SourceKind
    quote: str
    occurred_at: date | None
    collected_at: datetime
    url: str | None
    row_id: uuid.UUID | None
    match_confidence: float | None
    verification: Verification | None = None
    start_seconds: int | None = None
    end_seconds: int | None = None


class Finding(BaseModel):
    text: str
    citations: list[Citation] = Field(default_factory=list)


class Signal(BaseModel):
    label: str
    weight: float
    value: float
    citations: list[Citation]


class Contact(BaseModel):
    id: str
    key: str
    name: str
    title: str
    department: str
    role: Role = "unknown"
    authority: Literal["signing", "no_signing", "unknown"] = "unknown"
    assessment: float | None = None
    loyalty_assessment: str | None = None


class Relationship(BaseModel):
    from_id: str
    to_id: str
    scope: str
    source_id: str


class ReviewDecision(Verification):
    action: Literal["confirmed", "rejected"]
    reviewer_id: uuid.UUID
    contact_id: str | None = None
    contact_name: str | None = None
    note: str | None = None


class ReviewItem(BaseModel):
    label: str
    reason: str
    confidence: float
    url: str | None = None
    source_id: str | None = None
    decision: ReviewDecision | None = None


class PublicationReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["confirmed", "rejected"]
    contact_id: uuid.UUID | None = None
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None = None


class ReviewPreview(BaseModel):
    label: str
    text: str
    url: str | None
    occurred_at: date | None


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hours: Literal[24, 168] | None


class RelationshipApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    proposal_id: Annotated[str, StringConstraints(min_length=1, max_length=120)]


class PublicationStatus(BaseModel):
    id: str
    label: str
    url: str
    state: Literal["pending", "included", "review", "rejected", "unavailable", "blocked"] = "pending"
    reason: str | None = None
    retryable: bool = False


class LinkedPublication(PublicationStatus):
    contact_rows: dict[str, uuid.UUID] = Field(default_factory=dict)
    occurred_at: date | None = None
    from_feed: bool = False
    expected_contacts: list[str] = Field(default_factory=list)


class FeedStatus(BaseModel):
    url: str
    state: Literal["pending", "checked", "unavailable", "blocked"] = "pending"
    checked_at: datetime | None = None
    discovered: int = 0
    reason: str | None = None
    retryable: bool = False


class WebSearchStatus(BaseModel):
    state: Literal["pending", "checked", "partial", "unavailable"] = "pending"
    total_contacts: int
    searched_contacts: int = 0
    discovered: int = 0
    checked_at: datetime | None = None
    reason: str | None = None


class RecordingStatus(BaseModel):
    id: str
    label: str
    state: Literal["pending", "transcribed", "review", "rejected", "unavailable"] = "pending"
    reason: str | None = None
    retryable: bool = False


class Recording(RecordingStatus):
    encoded: str | None = None
    contact_id: str | None = None
    occurred_at: date | None = None
    url: str | None = None
    suffix: str = ".wav"


class Corpus(BaseModel):
    company: str
    collected_at: datetime
    contacts: list[Contact]
    sources: list[Source]
    relationships: list[Relationship]
    review: list[ReviewItem]
    publications: list[LinkedPublication] = Field(default_factory=list)
    review_sources: dict[str, Source] = Field(default_factory=dict)
    recordings: list[Recording] = Field(default_factory=list)
    feeds: list[FeedStatus] = Field(default_factory=list)
    account_loyalty: str | None = None
    web_search: WebSearchStatus | None = None
    row_contacts: dict[str, str] = Field(default_factory=dict)
    crm_fields: dict[str, dict[str, str]] = Field(default_factory=dict)


class ContactAnalysis(BaseModel):
    id: str
    name: str
    title: str
    department: str
    decision_role: Role
    role_confirmed: bool
    role_evidence: list[Citation]
    influence_level: float | None
    influence_signals: list[Signal]
    relationship_trend: Trend
    last_touch_at: date | None
    touches_90d: int
    interaction_evidence: list[Citation]
    engagement_score: float | None
    relationship_health: float | None
    business_relevance: float | None
    professional_topics: list[Finding]
    technologies: list[Finding]
    next_action: Finding | None = None
    next_action_author: Literal["gemma", "rules"] | None = None
    loyalty_assessment: str | None = None
    loyalty_evidence: list[Citation] = Field(default_factory=list)
    people: list[Finding] = Field(default_factory=list)
    organizations: list[Finding] = Field(default_factory=list)
    job_titles: list[Finding] = Field(default_factory=list)
    positions: list[Finding] = Field(default_factory=list)
    interactions: list["InteractionAnalysis"] = Field(default_factory=list)
    public_events: list[Finding] = Field(default_factory=list)
    profile_confidence: float | None = None


class InteractionAnalysis(BaseModel):
    source_id: str
    occurred_at: date | None
    channel: str | None
    author: str | None
    project: str | None
    sentiment: Literal["positive", "negative", "mixed", "neutral", "unknown"]
    summary: Finding
    topics: list[Finding]


class DepartmentCoverage(BaseModel):
    department: str
    total: int
    reached: int
    evidence: list[Citation]


class ProposedRelationship(BaseModel):
    id: str
    from_id: str
    to_id: str
    scope: Literal["reports_to", "influences", "collaborates_with"]
    finding: Finding


class AnalysisReport(BaseModel):
    company: str
    contacts: list[ContactAnalysis]
    coverage_score: float | None
    covered_key_contacts: int
    key_contacts: int
    relationship_score: float | None
    relationships: list[Finding]
    connections: list[Relationship]
    account_risks: list[Finding]
    alerts: list[Finding]
    review: list[ReviewItem]
    publications: list[PublicationStatus] = Field(default_factory=list)
    recordings: list[RecordingStatus] = Field(default_factory=list)
    feeds: list[FeedStatus] = Field(default_factory=list)
    departments: list[DepartmentCoverage] = Field(default_factory=list)
    account_loyalty: str | None = None
    account_evidence: list[Citation] = Field(default_factory=list)
    proposed_relationships: list[ProposedRelationship] = Field(default_factory=list)
    covered_key_roles: int | None = None
    key_roles: int | None = None
    generated_at: datetime | None = None
    web_search: WebSearchStatus | None = None
    public_event_details: dict[str, dict[str, str]] = Field(default_factory=dict)


class AnalysisDataset(BaseModel):
    entity: str
    table_id: uuid.UUID
    name: str


class AnalysisRead(BaseModel):
    id: uuid.UUID
    status: Literal["queued", "running", "completed", "partial", "failed"]
    progress: int
    model: str
    created_at: datetime
    table_updated_at: datetime
    stale: bool
    error: str | None
    report: AnalysisReport | None
    next_refresh_at: datetime | None = None
    refresh_hours: Literal[24, 168] | None = None
    datasets: list[AnalysisDataset] = Field(default_factory=list)


class AnalysisSetup(BaseModel):
    model: str
    enabled: bool
    can_write: bool
    company_hint: str
    columns: dict[FieldName, uuid.UUID | None]
    run: AnalysisRead | None
    web_search_configured: bool = False


class PublishedAnalysis(BaseModel):
    columns: list[str]
    updated_rows: int
    datasets: list[AnalysisDataset] = Field(default_factory=list)


class ContactCard(BaseModel):
    contact: ContactAnalysis
    generated_at: datetime
    stale: bool


class AskRequest(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=800)]
    contact_id: str | None = Field(default=None, max_length=50)
    target_id: str | None = Field(default=None, max_length=50)
    intent: Literal["question", "brief", "path", "email"] = "question"
    previous_questions: list[Annotated[str, StringConstraints(max_length=800)]] = Field(default_factory=list, max_length=3)


class AnswerItem(Finding):
    status: Literal["evidence", "hypothesis", "draft"]


class AnalysisAnswer(BaseModel):
    model: str | None = None
    items: list[AnswerItem]
