import { apiClient } from "@/lib/api/client";
import { apiConfig } from "@/lib/api/config";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
};

export function loginRequest(email: string, name?: string) {
  return apiClient.post<LoginResponse>(`${apiConfig.versionPrefix}/auth/login`, {
    email,
    ...(name ? { name } : {}),
  });
}

export function getCurrentUser(signal?: AbortSignal) {
  return apiClient.get<AuthUser>(`${apiConfig.versionPrefix}/auth/me`, signal);
}

export function logoutRequest() {
  return apiClient.post<void>(`${apiConfig.versionPrefix}/auth/logout`);
}
