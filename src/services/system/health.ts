import { apiConfig } from "@/lib/api/config";
import { apiClient } from "@/lib/api/client";

export type HealthStatus = "ok";

export type HealthResponse = {
  status: HealthStatus;
  database: HealthStatus;
};

export function getBackendHealth(signal?: AbortSignal) {
  return apiClient.get<HealthResponse>(`${apiConfig.versionPrefix}/health`, signal);
}
