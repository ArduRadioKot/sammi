import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme/theme-provider";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/forms";
import { Switch } from "@/components/ui/controls";
import { ApiError } from "@/lib/api/errors";
import { getBackendHealth } from "@/services/system/health";
import { checkAIProvider, listAIProviderModels, listAIProviders, testAIProvider, type AIProviderModel, type AIProviderStatus } from "@/services/system/ai-providers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";

const SECTIONS = [
  "System",
  "Workspace",
  "Members",
  "Billing",
  "AI Providers",
  "Data Providers",
  "Security",
  "API",
  "Appearance",
] as const;

type ConnectionState = "checking" | "connected" | "degraded" | "disconnected";

function StatusRow({ label, state }: { label: string; state: ConnectionState }) {
  const tone =
    state === "connected" ? "bg-success" : state === "checking" ? "bg-warning" : state === "degraded" ? "bg-warning" : "bg-danger";
  const text =
    state === "checking" ? "Checking" : state === "connected" ? "Connected" : state === "degraded" ? "Degraded" : "Disconnected";
  return (
    <div className="flex items-center justify-between border-b border-line py-3 text-[13px]">
      <span>{label}</span>
      <span className="flex items-center gap-2 text-ink-muted">
        {text}
        <span className={`size-2 rounded-full ${tone}`} />
      </span>
    </div>
  );
}

function SystemStatus() {
  const [backend, setBackend] = useState<ConnectionState>("checking");
  const [database, setDatabase] = useState<ConnectionState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    getBackendHealth(controller.signal)
      .then((health) => {
        const databaseOk = health.database === "ok";
        setBackend(health.status === "ok" ? "connected" : "degraded");
        setDatabase(databaseOk ? "connected" : "disconnected");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.code === "DATABASE_UNAVAILABLE") {
          setBackend("connected");
          setDatabase("disconnected");
          return;
        }
        setBackend("disconnected");
        setDatabase("disconnected");
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="max-w-lg">
      <h1 className="text-[18px] font-medium">System</h1>
      <p className="mt-1 text-[13px] text-ink-muted">Статус backend, PostgreSQL и сессии.</p>
      <div className="mt-4">
        <StatusRow label="Backend" state={backend} />
        <StatusRow label="PostgreSQL" state={database} />
      </div>
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Ollama",
  yandex: "Yandex AI Studio",
  gigachat: "GigaChat",
};

function AIProvidersStatus() {
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
        setModels(payload.items);
        const fallback =
          ollama?.default_model && payload.items.some((item) => item.id === ollama.default_model)
            ? ollama.default_model
            : payload.items[0]?.id ?? "";
        setSelectedModel(fallback);
        setModelsMessage(payload.items.length === 0 ? "Ollama запущен, но модели не установлены." : null);
      })
      .catch(() => {
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
      toast.success(`${PROVIDER_LABELS[id] ?? id}: available`);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Unavailable";
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
      const message = error instanceof ApiError ? error.message : "Generation failed";
      toast.error(`Ollama: ${message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-[18px] font-medium">AI Providers</h1>
      <p className="text-[13px] text-ink-muted">Secrets задаются в backend `.env`. Ключи в UI не передаются. Frontend не ходит в Ollama напрямую.</p>
      {(items ?? []).map((item) => (
        <section key={item.id} className="rounded-[var(--radius-md)] border border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-medium">{PROVIDER_LABELS[item.id] ?? item.id}</div>
            <span className="text-right text-[12px] text-ink-muted">
              {item.configured ? "Configured via environment" : "Not configured"}
              {" · "}
              {item.available ? "Available" : "Unavailable"}
            </span>
          </div>
          {item.id === "ollama" ? (
            <div className="mt-3 space-y-3 text-[13px]">
              <div className="flex justify-between gap-3 text-ink-muted">
                <span>Endpoint</span>
                <span className="font-mono text-[12px]">{item.endpoint ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-3 text-ink-muted">
                <span>Default model</span>
                <span>{item.default_model || "не задан"}</span>
              </div>
                <div>
                <div className="mb-1 text-[12px] text-ink-muted">Installed models</div>
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
              {checking === item.id ? "Checking…" : "Test connection"}
            </Button>
            {item.capabilities?.generation ? (
              <Button
                size="sm"
                disabled={!item.available || installedModels.length === 0 || testing}
                onClick={() => void testGeneration()}
              >
                {testing ? "Testing…" : "Test generation"}
              </Button>
            ) : null}
          </div>
        </section>
      ))}
      {items?.length === 0 ? <p className="text-[13px] text-ink-muted">Не удалось загрузить статус провайдеров.</p> : null}
    </div>
  );
}

export default function SettingsPage() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("System");
  const { theme, setTheme } = useTheme();
  const reduceTransparency = useUiStore((s) => s.reduceTransparency);
  const setReduceTransparency = useUiStore((s) => s.setReduceTransparency);
  const user = useAuthStore((s) => s.user);
  const workspace = useAuthStore((s) => s.workspace);

  return (
    <div className="flex h-full">
      <aside className="w-52 border-r border-line p-3">
        {SECTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSection(item)}
            className={`flex h-8 w-full items-center rounded-[var(--radius-sm)] px-2 text-left text-[13px] ${
              section === item ? "bg-surface-1" : "text-ink-muted hover:text-ink"
            }`}
          >
            {item}
          </button>
        ))}
      </aside>
      <div className="flex-1 overflow-auto p-6">
        {section === "System" && <SystemStatus />}
        {section === "Workspace" && (
          <div className="max-w-lg space-y-3">
            <h1 className="text-[18px] font-medium">Workspace</h1>
            <Label>Название</Label>
            <Input value={workspace?.name ?? ""} readOnly />
            <Label>Slug</Label>
            <Input value={workspace?.slug ?? ""} readOnly />
          </div>
        )}
        {section === "Members" && (
          <div>
            <h1 className="text-[18px] font-medium">Members</h1>
            <div className="mt-3 rounded-[var(--radius-md)] border border-line px-3 py-2 text-[13px]">
              {user?.name} · {user?.email} · {workspace?.role ?? "owner"}
            </div>
          </div>
        )}
        {section === "Billing" && (
          <div>
            <h1 className="text-[18px] font-medium">Billing</h1>
            <p className="mt-2 text-[13px] text-ink-muted">
              Billing не подключён. Credits — внутренняя единица workspace, не рубли. Баланс смотрите в Usage.
            </p>
          </div>
        )}
        {section === "AI Providers" && <AIProvidersStatus />}
        {section === "Data Providers" && (
          <div className="max-w-lg space-y-2 text-[13px]">
            <h1 className="text-[18px] font-medium">Data Providers</h1>
            <p>DaData · not connected</p>
            <p>Контур · not connected</p>
            <p>HeadHunter · not connected</p>
          </div>
        )}
        {section === "Security" && (
          <div>
            <h1 className="text-[18px] font-medium">Security</h1>
            <p className="mt-2 text-[13px] text-ink-muted">SSO и аудит появятся на этапе backend.</p>
          </div>
        )}
        {section === "API" && (
          <div className="max-w-lg">
            <h1 className="text-[18px] font-medium">API</h1>
            <p className="mt-2 text-[13px] text-ink-muted">
              GET /api/v1/health, POST /api/v1/auth/login, GET /api/v1/auth/me, GET /api/v1/workspaces, GET /api/v1/workspaces/{"{id}"}/credits, GET /api/v1/system/ai/providers
            </p>
            <Input className="mt-3" readOnly value="VITE_API_URL=http://localhost:8000" />
          </div>
        )}
        {section === "Appearance" && (
          <div className="max-w-lg space-y-4">
            <h1 className="text-[18px] font-medium">Appearance</h1>
            <div className="flex gap-2">
              {(["light", "dark", "system"] as const).map((item) => (
                <Button key={item} size="sm" variant={theme === item ? "secondary" : "ghost"} onClick={() => setTheme(item)}>
                  {item}
                </Button>
              ))}
            </div>
            <label className="flex items-center justify-between text-[13px]">
              Reduced transparency
              <Switch checked={reduceTransparency} onCheckedChange={setReduceTransparency} />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
