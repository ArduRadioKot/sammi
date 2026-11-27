import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";
import { checkAIProvider, listAIProviderModels, listAIProviders, testAIProvider, type AIProviderModel, type AIProviderStatus } from "@/services/system/ai-providers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Ollama",
  yandex: "Yandex AI Studio",
  gigachat: "GigaChat",
};

export function OllamaStatus() {
  const [items, setItems] = useState<AIProviderStatus[] | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<AIProviderModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelsMessage, setModelsMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listAIProviders(controller.signal)
      .then((payload) => setItems(payload.providers))
      .catch(() => setItems([]));
    return () => controller.abort();
  }, []);

  const ollama = (items ?? []).find((item) => item.id === "ollama");
  const ollamaAvailable = Boolean(ollama?.available);

  useEffect(() => {
    if (!ollamaAvailable) return;
    const controller = new AbortController();
    listAIProviderModels("ollama", controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        const gemma = payload.items.filter((item) => item.id.toLowerCase().split(":")[0] === "gemma4");
        setModels(gemma);
        const fallback =
          ollama?.default_model && gemma.some((item) => item.id === ollama.default_model)
            ? ollama.default_model
            : gemma.find((item) => item.id === "gemma4:e2b-mlx")?.id ?? gemma[0]?.id ?? "";
        setSelectedModel(fallback);
        setModelsMessage(gemma.length === 0 ? "В Ollama нет Gemma 4." : null);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setModels([]);
        setSelectedModel("");
        setModelsMessage("Ollama недоступен.");
      });
    return () => controller.abort();
  }, [ollamaAvailable, ollama?.default_model]);

  const installedModels = ollamaAvailable ? models : [];
  const installedMessage = !ollama
    ? null
    : ollamaAvailable
      ? modelsMessage
      : "Ollama недоступен.";

  const test = async (id: string) => {
    setChecking(id);
    try {
      const result = await checkAIProvider(id);
      setItems((current) =>
        (current ?? []).map((item) => (item.id === id ? { ...item, configured: true, available: result.available } : item)),
      );
      toast.success("Ollama отвечает");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Подключение недоступно";
      setItems((current) =>
        (current ?? []).map((item) => (item.id === id ? { ...item, available: false } : item)),
      );
      toast.error(`${PROVIDER_LABELS[id] ?? id}: ${message}`);
    } finally {
      setChecking(null);
    }
  };

  const testGeneration = async () => {
    setTesting(true);
    try {
      const result = await testAIProvider("ollama", selectedModel || undefined);
      toast.success(`Ollama ${result.model}: ${result.status}${result.duration_ms != null ? ` · ${result.duration_ms} ms` : ""}`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Генерация не удалась";
      toast.error(`Ollama: ${message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Gemma 4 отвечает в чате и извлекает факты из материалов анализа.</p>
      {(items ?? []).filter((item) => item.id === "ollama").map((item) => (
        <section key={item.id} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-medium">{PROVIDER_LABELS[item.id] ?? item.id}</div>
            <span className="text-right text-[12px] text-ink-muted">
              {item.configured ? "Настроен" : "Не настроен"}
              {" · "}
              {item.available ? "Доступен" : "Недоступен"}
            </span>
          </div>
          {item.id === "ollama" ? (
            <div className="mt-3 space-y-3 text-[13px]">
              <div className="flex justify-between gap-3 text-ink-muted">
                <span>Адрес сервиса</span>
                <span className="break-all text-right text-xs">{item.endpoint ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-3 text-ink-muted">
                <span>Установлено моделей Gemma 4</span>
                <span>{installedModels.length}</span>
              </div>
              <div>
                <div className="mb-1 text-[12px] text-ink-muted">Модель для проверки</div>
                {installedModels.length > 0 ? (
                <Select value={selectedModel} onValueChange={setSelectedModel} disabled={!item.available}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите модель" />
                  </SelectTrigger>
                  <SelectContent>
                    {installedModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                        {model.parameter_size ? ` · ${model.parameter_size}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                ) : (
                  <p className="text-[12px] text-ink-muted">{installedMessage ?? "Модели не загружены."}</p>
                )}
                {installedModels.length > 0 && installedMessage ? <p className="mt-2 text-[12px] text-ink-muted">{installedMessage}</p> : null}
              </div>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!item.configured || checking === item.id}
              onClick={() => void test(item.id)}
            >
                {checking === item.id ? "Проверяем…" : "Проверить соединение"}
            </Button>
            {item.capabilities?.generation ? (
              <Button
                size="sm"
                disabled={!item.available || installedModels.length === 0 || testing}
                onClick={() => void testGeneration()}
              >
                {testing ? "Проверяем…" : "Проверить генерацию"}
              </Button>
            ) : null}
          </div>
        </section>
      ))}
      {items?.length === 0 ? <p className="text-[13px] text-ink-muted">Не удалось загрузить статус провайдеров.</p> : null}
    </div>
  );
}
