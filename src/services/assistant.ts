import { apiClient } from "@/lib/api/client";
import { apiConfig } from "@/lib/api/config";

export type AssistantThread = { id: string; title: string; updated_at: string };
export type AssistantSource = { table_id: string; row_id: string | null; label: string };
export type TurnInput = { question: string; search_tables: boolean; table_id: string | null };
export type AssistantTurn = TurnInput & {
  id: string;
  answer: string | null;
  model: string | null;
  sources: AssistantSource[];
  created_at: string;
};
type ArchivedTurn = Pick<AssistantTurn, "question" | "answer">;

const path = (workspaceId: string) => `${apiConfig.versionPrefix}/workspaces/${workspaceId}/assistant/threads`;
const threadPath = (workspaceId: string, id: string) => `${path(workspaceId)}/${encodeURIComponent(id)}`;

export const assistantService = {
  list(workspaceId: string, offset: number, signal?: AbortSignal) {
    return apiClient.get<{ items: AssistantThread[]; has_more: boolean }>(`${path(workspaceId)}?offset=${offset}`, signal);
  },
  create(workspaceId: string, id: string, firstQuestion: string, signal?: AbortSignal, history?: ArchivedTurn[]) {
    return apiClient.post<AssistantThread>(path(workspaceId), { id, first_question: firstQuestion, history }, { signal });
  },
  get(workspaceId: string, id: string, signal?: AbortSignal) {
    return apiClient.get<AssistantThread & { turns: AssistantTurn[] }>(threadPath(workspaceId, id), signal);
  },
  ask(workspaceId: string, threadId: string, id: string, question: TurnInput, signal: AbortSignal) {
    return apiClient.request<AssistantTurn>(`${threadPath(workspaceId, threadId)}/turns/${id}`, { method: "PUT", body: question, signal });
  },
  remove(workspaceId: string, id: string) {
    return apiClient.delete<void>(threadPath(workspaceId, id));
  },
};
