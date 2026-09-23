import { apiClient } from "@/lib/api/client";
import { apiConfig } from "@/lib/api/config";

export type CreditBalance = {
  available: number;
  reserved: number;
  total: number;
};

export type CreditTransaction = {
  id: string;
  type: "grant" | "reserve" | "charge" | "release" | "refund" | "adjustment" | string;
  amount: number;
  available_delta: number;
  reserved_delta: number;
  available_after: number;
  reserved_after: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
};

export type CreditTransactionPage = {
  items: CreditTransaction[];
  total: number;
  limit: number;
  offset: number;
};

export function getCreditBalance(workspaceId: string, signal?: AbortSignal) {
  return apiClient.get<CreditBalance>(`${apiConfig.versionPrefix}/workspaces/${workspaceId}/credits`, signal);
}

export function listCreditTransactions(
  workspaceId: string,
  pagination: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  params.set("limit", String(pagination.limit ?? 50));
  params.set("offset", String(pagination.offset ?? 0));
  return apiClient.get<CreditTransactionPage>(
    `${apiConfig.versionPrefix}/workspaces/${workspaceId}/credits/transactions?${params.toString()}`,
    signal,
  );
}

export const creditsService = {
  getBalance: getCreditBalance,
  listTransactions: listCreditTransactions,
};
