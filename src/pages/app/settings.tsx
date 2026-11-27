import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { usePreferences } from "@/stores/preferences-store";
import { selectClass } from "@/features/relationship/analysis-setup";
import { useTheme } from "@/lib/theme/theme-provider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { ApiError } from "@/lib/api/errors";
import { getBackendHealth } from "@/services/system/health";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";

const SECTIONS = {
  system: "Система",
  account: "Аккаунт",
  analysis: "Анализ клиентов",
  assistant: "ИИ-помощник",
  appearance: "Внешний вид",
} as const;

type Section = keyof typeof SECTIONS;

type ConnectionState = "checking" | "connected" | "degraded" | "disconnected";

function StatusRow({ label, state }: { label: string; state: ConnectionState }) {
  const tone =
    state === "connected" ? "bg-success" : state === "checking" ? "bg-warning" : state === "degraded" ? "bg-warning" : "bg-danger";
  const text = { checking: "Проверяем", connected: "Подключён", degraded: "Частично доступен", disconnected: "Недоступен" }[state];
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
      <h2 className="text-lg font-medium">Система</h2>
      <p className="mt-1 text-[13px] text-ink-muted">Подключение к приложению и базе данных.</p>
      <div className="mt-4">
        <StatusRow label="Backend" state={backend} />
        <StatusRow label="PostgreSQL" state={database} />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("section");
  const section = requested && Object.hasOwn(SECTIONS, requested) ? requested as Section : "system";
  const { theme, setTheme } = useTheme();
  const reduceTransparency = useUiStore((state) => state.reduceTransparency);
  const setReduceTransparency = useUiStore((state) => state.setReduceTransparency);
  const user = useAuthStore((state) => state.user);
  const workspace = useAuthStore((state) => state.workspace);
  const preferences = usePreferences();
  if (requested === "model") return <Navigate to="/app/integrations#ollama" replace />;
  if (requested === "sources") return <Navigate to="/app/integrations#dadata" replace />;

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-y-contain">
      <div className="mx-auto max-w-6xl px-4 pt-4 pb-8 sm:px-8 sm:pt-7">
        <h1 className="text-3xl font-semibold tracking-tight">Настройки</h1>
        <div className="mt-4 grid gap-4 md:mt-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-5">
          <label className="grid gap-1 text-sm text-ink-muted md:hidden">
            Раздел
            <select className={selectClass} value={section} onChange={(event) => setParams({ section: event.target.value })}>
              {Object.entries(SECTIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <nav aria-label="Настройки" className="hidden flex-col items-start gap-1 self-start md:flex">
            {Object.entries(SECTIONS).map(([id, label]) => (
              <button key={id} type="button" aria-current={section === id ? "page" : undefined}
                onClick={() => setParams({ section: id })}
                className={`min-h-9 rounded-md px-3 py-2 text-left text-sm md:w-full ${section === id ? "bg-accent-soft font-medium text-accent" : "text-ink-muted hover:bg-surface-1 hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </nav>
          <div className="min-w-0 rounded-xl border border-line bg-surface-0 p-4 sm:p-6" key={section}>
            {section === "system" && <SystemStatus />}
            {section === "account" && (
              <div className="max-w-lg space-y-4">
                <h2 className="text-lg font-medium">Аккаунт</h2>
                <dl className="grid gap-3 text-sm">
                  <div><dt className="text-ink-muted">Имя</dt><dd>{user?.name ?? "—"}</dd></div>
                  <div><dt className="text-ink-muted">Email</dt><dd className="wrap-anywhere">{user?.email ?? "—"}</dd></div>
                  <div><dt className="text-ink-muted">Рабочее пространство</dt><dd>{workspace?.name ?? "—"}</dd></div>
                  <div><dt className="text-ink-muted">Уровень доступа</dt><dd>{workspace?.role === "owner" ? "Владелец" : workspace?.role === "admin" ? "Администратор" : workspace?.role === "viewer" ? "Чтение" : "Участник"}</dd></div>
                </dl>
              </div>
            )}
            {section === "analysis" && (
              <section className="max-w-lg space-y-4">
                <h2 className="text-lg font-medium">Анализ клиентов</h2>
                <p className="text-sm text-ink-muted">Настройки поиска публикаций, ключевые слова и расписание доступны в интеграции SearXNG.</p>
                <Button asChild size="sm" variant="secondary"><Link to="/app/integrations#search">Настроить поиск</Link></Button>
              </section>
            )}
            {section === "assistant" && (
              <section className="max-w-lg space-y-4">
                <h2 className="text-lg font-medium">ИИ-помощник</h2>
                <label className="flex items-center justify-between gap-4 text-sm">
                  Отправлять вопрос клавишей Enter
                  <Switch checked={preferences.sendOnEnter} onCheckedChange={preferences.setSendOnEnter} />
                </label>
                <p className="text-sm text-ink-muted">Shift + Enter добавляет новую строку. Настройка применяется к рабочему чату и чату по клиенту.</p>
              </section>
            )}
            {section === "appearance" && (
              <section className="max-w-lg space-y-4">
                <h2 className="text-lg font-medium">Внешний вид</h2>
                <label className="grid gap-1.5 text-sm">
                  Цветовая тема
                  <select className={selectClass} value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}>
                    <option value="light">Светлая</option><option value="dark">Тёмная</option><option value="system">Как в системе</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-4 text-sm">
                  Уменьшить прозрачность
                  <Switch checked={reduceTransparency} onCheckedChange={setReduceTransparency} />
                </label>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
