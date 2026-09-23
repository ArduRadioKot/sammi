import { apiClient } from "@/lib/api/client";
import { apiConfig } from "@/lib/api/config";

export type EnrichmentOutputField = {
  id: string;
  label: string;
};

export type EnrichmentOperation = {
  id: string;
  label: string;
  inputs: string[];
  outputs: EnrichmentOutputField[];
  credits_per_success: number;
};

export type EnrichmentProviderStatus = {
  id: string;
  name: string;
  configured: boolean;
  available: boolean | null;
  region: string;
  operations: EnrichmentOperation[];
};

export type EnrichmentRun = {
  id: string;
  workspace_id: string;
  table_id: string;
  target_column_id: string;
  provider_id: string;
  operation: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  success_count: number;
  not_found_count: number;
  error_count: number;
  skipped_count: number;
  reserved_credits: number;
  charged_credits: number;
  config: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CellProvenance = {
  id: string;
  table_id: string;
  row_id: string;
  column_id: string;
  run_id: string | null;
  attempt_id: string | null;
  provider_id: string;
  operation: string;
  source_label: string;
  source_url: string | null;
  retrieved_at: string;
  confidence: number | null;
  credits_charged: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const prefix = apiConfig.versionPrefix;

export const enrichmentService = {
  listProviders() {
    return apiClient.get<{ items: EnrichmentProviderStatus[] }>(`${prefix}/enrichment/providers`);
  },
  createColumn(
    tableId: string,
    input: {
      name: string;
      provider_id: string;
      operation: string;
      input_column_id: string;
      output_field: string;
    },
  ) {
    return apiClient.post<{
      id: string;
      table_id: string;
      name: string;
      type: string;
      position: number;
      config: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>(`${prefix}/tables/${tableId}/enrichment/columns`, input);
  },
  createRun(tableId: string, input: { column_id: string; row_ids?: string[] }, idempotencyKey: string) {
    return apiClient.post<EnrichmentRun>(`${prefix}/tables/${tableId}/enrichment/runs`, input, {
      headers: { "Idempotency-Key": idempotencyKey },
    });
  },
  getRun(runId: string) {
    return apiClient.get<EnrichmentRun>(`${prefix}/enrichment/runs/${runId}`);
  },
  getProvenance(tableId: string, rowId: string, columnId: string) {
    return apiClient.get<CellProvenance | null>(
      `${prefix}/tables/${tableId}/rows/${rowId}/columns/${columnId}/provenance`,
    );
  },
};
