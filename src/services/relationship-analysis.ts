import { apiClient } from "@/lib/api/client";

export type AnalysisField =
  | "name" | "contact_key" | "company" | "title" | "department" | "role" | "authority" | "assessment"
  | "interaction" | "occurred_at" | "feedback" | "related_contact" | "relation_type"
  | "public_text" | "public_url" | "public_date" | "interaction_type" | "author" | "project"
  | "loyalty" | "account_loyalty";

export type ColumnMapping = Partial<Record<AnalysisField, string | null>>;

export interface AnalysisDocument {
  file: File;
  title: string;
  url: string;
  date: string;
  contact: string;
}

export type RefreshHours = 24 | 168 | null;
export interface AnalysisPublications {
  urls: string[];
  fetch_csv_urls: boolean;
  feed_urls: string[];
  refresh_hours: RefreshHours;
  web_search?: boolean;
}

export interface PublicationStatus {
  id: string;
  label: string;
  url: string;
  state: "pending" | "included" | "review" | "rejected" | "unavailable" | "blocked";
  reason: string | null;
  retryable: boolean;
}

export interface FeedStatus {
  url: string;
  state: "pending" | "checked" | "unavailable" | "blocked";
  checked_at: string | null;
  discovered: number;
  reason: string | null;
  retryable: boolean;
}

export interface WebSearchStatus {
  state: "pending" | "checked" | "partial" | "unavailable";
  total_contacts: number;
  searched_contacts: number;
  discovered: number;
  checked_at: string | null;
  reason: string | null;
}

export interface RecordingStatus {
  id: string;
  label: string;
  state: "pending" | "transcribed" | "review" | "rejected" | "unavailable";
  reason: string | null;
  retryable: boolean;
}

export interface ReviewItem {
  label: string;
  reason: string;
  confidence: number;
  url: string | null;
  source_id: string | null;
  decision: {
    action: "confirmed" | "rejected";
    reviewer: string;
    reviewed_at: string;
    contact_name: string | null;
    note: string | null;
  } | null;
}

export interface ReviewPreview {
  label: string;
  text: string;
  url: string | null;
  occurred_at: string | null;
}

export type ReviewInput =
  | { action: "confirmed"; contact_id: string; note: string }
  | { action: "rejected"; note: string };

export interface Citation {
  source_id: string;
  label: string;
  kind: "crm" | "interaction" | "relationship" | "publication";
  quote: string;
  occurred_at: string | null;
  collected_at: string;
  url: string | null;
  row_id: string | null;
  match_confidence: number | null;
  verification: { reviewer: string; reviewed_at: string } | null;
  start_seconds: number | null;
  end_seconds: number | null;
}

export interface Finding {
  text: string;
  citations: Citation[];
}

export interface ContactAnalysis {
  id: string;
  name: string;
  title: string;
  department: string;
  decision_role: "decision_maker" | "influencer" | "actual_decider" | "unknown";
  role_confirmed: boolean;
  role_evidence: Citation[];
  influence_level: number | null;
  influence_signals: Array<{ label: string; weight: number; value: number; citations: Citation[] }>;
  relationship_trend: "improving" | "stable" | "declining" | "unknown";
  last_touch_at: string | null;
  touches_90d: number;
  interaction_evidence: Citation[];
  engagement_score: number | null;
  relationship_health: number | null;
  business_relevance: number | null;
  professional_topics: Finding[];
  technologies: Finding[];
  next_action: Finding | null;
  next_action_author: "gemma" | "rules" | null;
  loyalty_assessment: string | null;
  loyalty_evidence: Citation[];
  people: Finding[];
  organizations: Finding[];
  job_titles: Finding[];
  positions: Finding[];
  interactions: Array<{
    source_id: string;
    occurred_at: string | null;
    channel: string | null;
    author: string | null;
    project: string | null;
    sentiment: "positive" | "negative" | "mixed" | "neutral" | "unknown";
    summary: Finding;
    topics: Finding[];
  }>;
  public_events: Finding[];
  profile_confidence: number | null;
}

export interface AnalysisReport {
  company: string;
  contacts: ContactAnalysis[];
  coverage_score: number | null;
  covered_key_contacts: number;
  key_contacts: number;
  covered_key_roles: number | null;
  key_roles: number | null;
  relationship_score: number | null;
  relationships: Finding[];
  connections: Array<{ from_id: string; to_id: string; scope: string; source_id: string }>;
  account_risks: Finding[];
  alerts: Finding[];
  review: ReviewItem[];
  publications: PublicationStatus[];
  feeds: FeedStatus[];
  recordings: RecordingStatus[];
  departments: Array<{ department: string; total: number; reached: number; evidence: Citation[] }>;
  account_loyalty: string | null;
  account_evidence: Citation[];
  proposed_relationships: Array<{ id: string; from_id: string; to_id: string; scope: string; finding: Finding }>;
  generated_at: string | null;
  web_search: WebSearchStatus | null;
}

export interface AnalysisDataset {
  entity: string;
  table_id: string;
  name: string;
}

export interface AnalysisRun {
  id: string;
  status: "queued" | "running" | "completed" | "partial" | "failed";
  progress: number;
  model: string;
  created_at: string;
  stale: boolean;
  error: string | null;
  report: AnalysisReport | null;
  refresh_hours: RefreshHours;
  next_refresh_at: string | null;
  datasets: AnalysisDataset[];
}

export interface AnalysisSetup {
  model: string;
  enabled: boolean;
  can_write: boolean;
  company_hint: string;
  columns: ColumnMapping;
  run: AnalysisRun | null;
  web_search_configured: boolean;
}

export interface ContactCard {
  contact: ContactAnalysis;
  generated_at: string;
  stale: boolean;
}

export interface AnalysisAnswer {
  model: string | null;
  items: Array<Finding & { status: "evidence" | "hypothesis" | "draft" }>;
}

export interface AnalysisQuestion {
  question: string;
  contact_id?: string;
  target_id?: string;
  intent: "question" | "brief" | "path" | "email";
  previous_questions?: string[];
}

const path = (tableId: string) => `/api/v1/tables/${tableId}/relationship-analysis`;
const reviewPath = (tableId: string, runId: string, sourceId: string) =>
  `${path(tableId)}/${runId}/reviews/${encodeURIComponent(sourceId)}`;

export const relationshipAnalysis = {
  setup: (tableId: string, signal?: AbortSignal) => apiClient.get<AnalysisSetup>(`${path(tableId)}/setup`, signal),
  status: (tableId: string, signal?: AbortSignal) => apiClient.get<AnalysisRun | null>(path(tableId), signal),
  start(tableId: string, columns: ColumnMapping, documents: AnalysisDocument[], publications: AnalysisPublications) {
    const input = { columns, ...publications };
    if (!documents.length) return apiClient.post<AnalysisRun>(path(tableId), input);
    const form = new FormData();
    form.set("config", JSON.stringify({
      ...input,
      documents: documents.map(({ title, url, date, contact }) => ({
        title: title.trim() || null, url: url.trim() || null, date: date || null, contact: contact.trim() || null,
      })),
    }));
    for (const { file } of documents) form.append("files", file);
    return apiClient.postForm<AnalysisRun>(path(tableId), form);
  },
  remove: (tableId: string) => apiClient.delete<void>(path(tableId)),
  retry: (tableId: string) => apiClient.post<AnalysisRun>(`${path(tableId)}/retry`),
  publish: (tableId: string, runId: string) =>
    apiClient.post<{ columns: string[]; updated_rows: number; datasets: AnalysisDataset[] }>(`${path(tableId)}/${runId}/publish`),
  contactCard: (tableId: string, rowId: string, signal: AbortSignal) =>
    apiClient.get<ContactCard | null>(`${path(tableId)}/contacts/by-row/${rowId}`, signal),
  updateRefresh: (tableId: string, hours: RefreshHours) =>
    apiClient.patch<AnalysisRun>(`${path(tableId)}/refresh`, { hours }),
  ask: (tableId: string, question: AnalysisQuestion) => apiClient.post<AnalysisAnswer>(`${path(tableId)}/ask`, question),
  reviewPreview: (tableId: string, runId: string, sourceId: string, signal: AbortSignal) =>
    apiClient.get<ReviewPreview>(reviewPath(tableId, runId, sourceId), signal),
  review: (tableId: string, runId: string, sourceId: string, input: ReviewInput) =>
    apiClient.post<AnalysisRun>(reviewPath(tableId, runId, sourceId), input),
  approveRelationship: (tableId: string, runId: string, proposalId: string) =>
    apiClient.post<AnalysisRun>(`${path(tableId)}/${runId}/relationships/approve`, { proposal_id: proposalId }),
  row: (tableId: string, rowId: string, signal: AbortSignal) =>
    apiClient.get<{ data: Record<string, unknown> }>(`/api/v1/tables/${tableId}/rows/${rowId}`, signal),
};
