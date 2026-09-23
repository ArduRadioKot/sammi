import { create } from "zustand";
import { ApiError } from "@/lib/api/errors";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/api/token";
import { getCurrentUser, loginRequest, logoutRequest, type AuthUser } from "@/services/auth";
import { listWorkspaces, type WorkspaceSummary } from "@/services/workspaces";

export type AuthStatus = "initializing" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  workspace: WorkspaceSummary | null;
  workspaces: WorkspaceSummary[];
  initialize: () => Promise<void>;
  login: (email: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

async function loadSession(): Promise<{ user: AuthUser; workspaces: WorkspaceSummary[] }> {
  const [user, listed] = await Promise.all([getCurrentUser(), listWorkspaces()]);
  return { user, workspaces: listed.items };
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "initializing",
  user: null,
  workspace: null,
  workspaces: [],
  initialize: async () => {
    if (!getAccessToken()) {
      clearAccessToken();
      set({ status: "unauthenticated", user: null, workspace: null, workspaces: [] });
      return;
    }
    try {
      const { user, workspaces } = await loadSession();
      set({
        status: "authenticated",
        user,
        workspaces,
        workspace: workspaces[0] ?? null,
      });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.code === "INVALID_TOKEN")) {
        clearAccessToken();
      }
      set({ status: "unauthenticated", user: null, workspace: null, workspaces: [] });
    }
  },
  login: async (email, name) => {
    const result = await loginRequest(email, name);
    setAccessToken(result.access_token);
    const { user, workspaces } = await loadSession();
    set({
      status: "authenticated",
      user,
      workspaces,
      workspace: workspaces[0] ?? null,
    });
  },
  logout: async () => {
    try {
      if (getAccessToken()) await logoutRequest();
    } catch {
      // JWT is client-held; always clear local state.
    }
    clearAccessToken();
    set({ status: "unauthenticated", user: null, workspace: null, workspaces: [] });
  },
}));
