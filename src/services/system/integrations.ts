import { apiClient } from "@/lib/api/client";
import { apiConfig } from "@/lib/api/config";

type SearchIntegrationStatus = {
  configured: boolean;
  available: boolean | null;
  results: number | null;
  message: string | null;
  provider?: "searxng" | "wikipedia" | null;
};

const path = `${apiConfig.versionPrefix}/system/integrations/search`;

export const searchIntegration = {
  status: (signal?: AbortSignal) => apiClient.get<SearchIntegrationStatus>(path, signal),
  check: () => apiClient.post<SearchIntegrationStatus>(`${path}/check`),
};
