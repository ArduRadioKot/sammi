import { apiConfig } from "@/lib/api/config";
import { ApiError } from "@/lib/api/errors";
import { getAccessToken } from "@/lib/api/token";

export { ApiError } from "@/lib/api/errors";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

function filenameFromDisposition(header: string | null): string {
  if (!header) return "export.csv";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return star[1];
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? "export.csv";
}

async function parseJsonError(response: Response): Promise<never> {
  let code = "INTERNAL_ERROR";
  let message = `Request failed: ${response.status}`;
  let details: unknown = null;
  try {
    const payload = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
      code?: string;
      detail?: string;
      message?: string;
    };
    if (payload.error) {
      code = payload.error.code ?? code;
      message = payload.error.message ?? message;
      details = payload.error.details ?? null;
    } else {
      code = payload.code ?? code;
      message = payload.detail ?? payload.message ?? message;
    }
  } catch {
    // ignore JSON parse errors
  }
  throw new ApiError(response.status, code, message, details);
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    await parseJsonError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export class ApiClient {
  constructor(private readonly baseUrl: string = apiConfig.baseUrl) {}

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let response: Response;
    const token = getAccessToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch {
      throw new ApiError(0, "NETWORK_ERROR", "Network request failed");
    }
    return readJson<T>(response);
  }

  async postForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
    let response: Response;
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers,
        body: form,
        signal,
      });
    } catch {
      throw new ApiError(0, "NETWORK_ERROR", "Network request failed");
    }
    return readJson<T>(response);
  }

  async getBlob(path: string): Promise<{ blob: Blob; filename: string }> {
    let response: Response;
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { headers });
    } catch {
      throw new ApiError(0, "NETWORK_ERROR", "Network request failed");
    }
    if (!response.ok) {
      await parseJsonError(response);
    }
    const blob = await response.blob();
    return { blob, filename: filenameFromDisposition(response.headers.get("Content-Disposition")) };
  }

  get<T>(path: string, signal?: AbortSignal) {
    return this.request<T>(path, { signal });
  }

  post<T>(path: string, body?: unknown, extra?: { headers?: Record<string, string>; signal?: AbortSignal }) {
    return this.request<T>(path, { method: "POST", body, headers: extra?.headers, signal: extra?.signal });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: "PATCH", body });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }
}

export const apiClient = new ApiClient();
