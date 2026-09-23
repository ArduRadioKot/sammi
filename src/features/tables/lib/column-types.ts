import type { ColumnType, RunStatus } from "@/types/domain";

export const columnTypeMeta: Record<
  ColumnType,
  { label: string; section: "BASIC" | "POWER" | "DATA" | "AI" | "AUTOMATION" }
> = {
  text: { label: "Text", section: "BASIC" },
  number: { label: "Number", section: "BASIC" },
  date: { label: "Date", section: "BASIC" },
  boolean: { label: "Checkbox", section: "BASIC" },
  url: { label: "URL", section: "BASIC" },
  email: { label: "Email", section: "BASIC" },
  phone: { label: "Phone", section: "BASIC" },
  select: { label: "Select", section: "BASIC" },
  multi_select: { label: "Multi select", section: "BASIC" },
  formula: { label: "Formula", section: "POWER" },
  currency: { label: "Currency", section: "BASIC" },
  company: { label: "Company", section: "BASIC" },
  person: { label: "Person", section: "BASIC" },
  score: { label: "Score", section: "POWER" },
  enrichment: { label: "Enrichment", section: "DATA" },
  ai: { label: "AI Column", section: "AI" },
  status: { label: "Status", section: "BASIC" },
};

export const extraColumnActions = [
  { id: "relation", label: "Relation", section: "POWER" as const },
  { id: "lookup", label: "Lookup", section: "POWER" as const },
  { id: "conditional", label: "Conditional", section: "POWER" as const },
  { id: "waterfall", label: "Waterfall", section: "DATA" as const },
  { id: "agent", label: "AI Research Agent", section: "AI" as const },
  { id: "http", label: "HTTP Request", section: "AUTOMATION" as const },
  { id: "webhook", label: "Webhook", section: "AUTOMATION" as const },
];

export const statusLabel: Record<RunStatus, string> = {
  idle: "Not run",
  queued: "Queued",
  running: "Running",
  success: "Success",
  not_found: "No data found",
  error: "Error",
  skipped: "Skipped",
};
