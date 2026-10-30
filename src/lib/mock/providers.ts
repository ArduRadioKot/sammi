import type { AIModel } from "@/types/domain";

export const aiModels: AIModel[] = [
  {
    id: "yandexgpt-5-pro",
    providerId: "yandex",
    name: "YandexGPT 5 Pro",
    supportsStructuredOutput: true,
    supportsTools: true,
  },
  {
    id: "yandexgpt-5-lite",
    providerId: "yandex",
    name: "YandexGPT 5 Lite",
    supportsStructuredOutput: true,
    supportsTools: false,
  },
  {
    id: "gigachat-pro",
    providerId: "gigachat",
    name: "GigaChat Pro",
    supportsStructuredOutput: true,
    supportsTools: true,
  },
  {
    id: "gigachat-max",
    providerId: "gigachat",
    name: "GigaChat Max",
    supportsStructuredOutput: true,
    supportsTools: true,
  },
  {
    id: "qwen2.5",
    providerId: "ollama",
    name: "qwen2.5",
    supportsStructuredOutput: true,
    supportsTools: false,
  },
  {
    id: "gemma3",
    providerId: "ollama",
    name: "gemma3",
    supportsStructuredOutput: false,
    supportsTools: false,
  },
  {
    id: "llama3.1",
    providerId: "ollama",
    name: "llama3.1",
    supportsStructuredOutput: false,
    supportsTools: true,
  },
  {
    id: "custom-model",
    providerId: "custom",
    name: "Custom OpenAI-compatible",
    supportsStructuredOutput: true,
    supportsTools: true,
  },
];
