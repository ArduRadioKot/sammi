import { apiClient } from "@/lib/api/client";
import { apiConfig } from "@/lib/api/config";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member" | "viewer";
  created_at: string;
};

export function listWorkspaces(signal?: AbortSignal) {
  return apiClient.get<{ items: WorkspaceSummary[] }>(`${apiConfig.versionPrefix}/workspaces`, signal);
}

export function getWorkspace(workspaceId: string, signal?: AbortSignal) {
  return apiClient.get<WorkspaceSummary>(`${apiConfig.versionPrefix}/workspaces/${workspaceId}`, signal);
}
