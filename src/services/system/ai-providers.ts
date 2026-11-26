import { apiClient } from "@/lib/api/client";
import { apiConfig } from "@/lib/api/config";

export type AIProviderId = "ollama" | "yandex" | "gigachat";

export type AIProviderCapabilities = {
  generation: boolean;
  structured_output: boolean;
  tools: boolean;
  streaming: boolean;
};

export type AIProviderStatus = {
  id: AIProviderId | string;
  configured: boolean;
  available: boolean;
  capabilities?: AIProviderCapabilities;
  default_model?: string | null;
  endpoint?: string | null;
};

export type AIProviderModel = {
  id: string;
  name: string;
  provider?: string | null;
  parameter_size?: string | null;
  quantization?: string | null;
};

export type AIProviderTestResult = {
  provider: string;
  model: string;
  status: string;
  duration_ms: number | null;
};

export type AIChatMessage = { role: "user" | "assistant"; content: string };
export type AIChatResponse = { content: string; model: string; duration_ms: number | null };

export function listAIProviders(signal?: AbortSignal) {
  return apiClient.get<{ providers: AIProviderStatus[] }>(`${apiConfig.versionPrefix}/system/ai/providers`, signal);
}

export function checkAIProvider(providerId: string) {
  return apiClient.post<AIProviderStatus & { error_code?: string | null }>(
    `${apiConfig.versionPrefix}/system/ai/providers/${providerId}/check`,
  );
}

export function listAIProviderModels(providerId: string, signal?: AbortSignal) {
  return apiClient.get<{ items: AIProviderModel[] }>(
    `${apiConfig.versionPrefix}/system/ai/providers/${providerId}/models`,
    signal,
  );
}

export function testAIProvider(providerId: string, model?: string) {
  return apiClient.post<AIProviderTestResult>(`${apiConfig.versionPrefix}/system/ai/providers/${providerId}/test`, {
    model: model || undefined,
  });
}

export function askWorkAssistant(messages: AIChatMessage[], model?: string) {
  return apiClient.post<AIChatResponse>(`${apiConfig.versionPrefix}/system/ai/chat`, { messages, model });
}
