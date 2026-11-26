export type TableType = "companies" | "people" | "custom";

export type ColumnType =
  | "text"
  | "number"
  | "boolean"
  | "url"
  | "email"
  | "phone"
  | "date"
  | "select"
  | "multi_select"
  | "company"
  | "person"
  | "score"
  | "ai"
  | "enrichment"
  | "status"
  | "formula"
  | "currency";

export type RunStatus =
  | "idle"
  | "queued"
  | "running"
  | "success"
  | "not_found"
  | "error"
  | "skipped";

export type EnrichmentCategory =
  | "recommended"
  | "company"
  | "people"
  | "email"
  | "phone"
  | "firmographics"
  | "russian";

export type ProviderRegion = "RU" | "GLOBAL";

export type AIProviderId = "gigachat" | "yandex" | "ollama" | "custom";

export type AIOutputType = "text" | "number" | "boolean" | "json";

export type IntentLevel = "Low" | "Medium" | "High";

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty";

export interface Workspace {
  id: string;
  name: string;
  plan: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarHue?: number;
}

export interface Provenance {
  providerId?: string;
  providerName?: string;
  source?: string;
  updatedAt: string;
  confidence?: number;
  credits?: number;
  raw?: Record<string, unknown>;
}

export interface CellError {
  code:
    | "provider_unavailable"
    | "rate_limit"
    | "no_data"
    | "invalid_input"
    | "auth_required";
  message: string;
}

export interface CellValue {
  value: unknown;
  display?: string;
  status?: RunStatus;
  provenance?: Provenance;
  error?: CellError;
}

export interface FilterRule {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value?: string | number | boolean;
}

export interface SortRule {
  id: string;
  columnId: string;
  direction: "asc" | "desc";
}

export interface RunCondition {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value?: string | number | boolean;
  combinator?: "and" | "or";
}

export interface SelectOption {
  id: string;
  label: string;
  color?: "neutral" | "blue" | "green" | "amber" | "red" | "violet";
}

export interface EnrichmentProvider {
  id: string;
  name: string;
  description: string;
  category: EnrichmentCategory;
  region: ProviderRegion;
  supportedFields: string[];
  costPerResult: number;
  supportsBYOK: boolean;
  recommended?: boolean;
}

export interface WaterfallStep {
  id: string;
  providerId: string;
  enabled: boolean;
}

export interface WaterfallConfig {
  kind: "waterfall";
  targetField: "email" | "phone" | "company" | "person";
  steps: WaterfallStep[];
  stopOnFirstValid: boolean;
  verifyResult: boolean;
  conditions: RunCondition[];
}

export interface EnrichmentConfig {
  kind: "enrichment";
  providerId: string;
  operation: string;
  inputColumnId: string;
  outputField: string;
  field: string;
  creditsPerSuccess?: number;
  conditions: RunCondition[];
}

export interface AIModel {
  id: string;
  providerId: AIProviderId;
  name: string;
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
}

export interface AIColumnConfig {
  kind: "ai";
  providerId: AIProviderId;
  modelId: string;
  prompt: string;
  outputType: AIOutputType;
  webResearch: boolean;
  useCompanyWebsite: boolean;
  conditions: RunCondition[];
}

export interface FormulaConfig {
  kind: "formula";
  expression: string;
}

export interface SelectConfig {
  kind: "select";
  options: SelectOption[];
}

export type ColumnConfig =
  | EnrichmentConfig
  | WaterfallConfig
  | AIColumnConfig
  | FormulaConfig
  | SelectConfig;

export interface SchemaField {
  id: string;
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

export interface AgentConfig {
  name: string;
  instructions: string;
  providerId: AIProviderId;
  modelId: string;
  sources: string[];
  tools: string[];
  outputSchema: SchemaField[];
}

export interface ColumnDefinition {
  id: string;
  name: string;
  type: ColumnType;
  width: number;
  hidden?: boolean;
  frozen?: boolean;
  config?: ColumnConfig;
  analysisOutput?: boolean;
}

export interface TableView {
  id: string;
  name: string;
  filters: FilterRule[];
  sorts: SortRule[];
}

export interface TableRow {
  id: string;
  cells: Record<string, CellValue>;
}

export interface MapPoint {
  rowId: string;
  lat: number;
  lon: number;
  address: string;
  displayName: string | null;
}

export interface TableMapPoints {
  tableId: string;
  columnId: string;
  columnName: string;
  points: MapPoint[];
  totalRows: number;
  resolved: number;
  unresolved: number;
  geocoded: number;
  cached: number;
  geocodeLimitReached: boolean;
  source: "geocoded" | "cache" | null;
}

export interface DataTable {
  id: string;
  name: string;
  type: TableType;
  description?: string;
  relationshipSourceId?: string;
  columns: ColumnDefinition[];
  views: TableView[];
  defaultViewId: string;
  rowCount: number;
  enrichmentCount: number;
  creditsUsed: number;
  owner: string;
  updatedAt: string;
  starred?: boolean;
  archived?: boolean;
}

export interface TableWithRows extends DataTable {
  rows: TableRow[];
}

export interface Company {
  id: string;
  name: string;
  domain: string;
  inn: string;
  ogrn: string;
  industry: string;
  city: string;
  employees: number;
  revenue: number;
  website: string;
  decisionMaker: string;
  role: string;
  email: string;
  phone: string;
  aiResearch: string;
  intent: IntentLevel;
  score: number;
  crm: string;
}

export interface Person {
  id: string;
  name: string;
  role: string;
  companyId: string;
  companyName: string;
  city: string;
  email: string;
  linkedin?: string;
  source: string;
}

export interface Signal {
  id: string;
  name: string;
  source: string;
  tableId: string;
  tableName: string;
  companies: number;
  frequency: string;
  lastRun: string;
  newEvents: number;
  status: "active" | "paused";
  description: string;
}

export interface Audience {
  id: string;
  name: string;
  entity: "companies" | "people";
  rules: FilterRule[];
  count: number;
  updatedAt: string;
  destinations: string[];
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  providerId: AIProviderId;
  modelId: string;
  runs: number;
  successRate: number;
  credits: number;
  updatedAt: string;
  config: AgentConfig;
}

export interface Campaign {
  id: string;
  name: string;
  audienceId: string;
  audienceName: string;
  contacts: number;
  sent: number;
  replies: number;
  positive: number;
  status: "draft" | "active" | "paused" | "completed";
  steps: CampaignStep[];
}

export interface CampaignStep {
  id: string;
  type: "email" | "wait";
  subject?: string;
  body?: string;
  waitDays?: number;
}

export interface Integration {
  id: string;
  name: string;
  category: "crm" | "data" | "ai" | "communication" | "automation" | "storage";
  description: string;
  connected: boolean;
  supportsBYOK?: boolean;
  region?: ProviderRegion;
}

export interface CreditTransaction {
  id: string;
  date: string;
  action: string;
  provider: string;
  rows: number;
  credits: number;
  user: string;
}

export interface UsageSummary {
  remaining: number;
  usedThisMonth: number;
  ai: number;
  enrichment: number;
  byProvider: { provider: string; credits: number }[];
  history: CreditTransaction[];
}

export interface RunJob {
  id: string;
  tableId: string;
  columnId: string;
  kind: "enrichment" | "ai" | "formula";
  total: number;
  completed: number;
  creditsUsed: number;
  providerCount: number;
  status: "running" | "paused" | "completed" | "stopped";
}

export interface CreateTableInput {
  name: string;
  type: TableType;
}

export type CommandActionId =
  | "create-table"
  | "import"
  | "add-enrichment"
  | "add-ai-column"
  | "search-table"
  | "go-integrations"
  | "create-audience"
  | "create-signal"
  | "settings";
