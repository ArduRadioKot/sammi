import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bot, Database, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton, Textarea } from "@/components/ui/forms";
import { OllamaStatus } from "@/features/integrations/ollama-status";
import { parseRefresh, refreshOptions, selectClass } from "@/features/relationship/analysis-setup";
import { parseSearchKeywords, searchKeywordError } from "@/features/relationship/search-keywords";
import { enrichmentService, type EnrichmentProviderStatus } from "@/services/enrichment";
import { searchIntegration } from "@/services/system/integrations";
import { usePreferences } from "@/stores/preferences-store";

export default function IntegrationsPage() {
  const { hash } = useLocation();
  useEffect(() => {
    if (["#search", "#ollama", "#dadata"].includes(hash)) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-y-contain">
      <div className="mx-auto max-w-6xl space-y-5 px-4 pt-4 pb-8 sm:px-8 sm:pt-7">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Интеграции</h1>
          <p className="mt-1 text-sm text-ink-muted">Поиск публикаций, локальная модель и обогащение таблиц.</p>
        </header>
        <SearchSettings />
        <div className="grid items-start gap-4 md:grid-cols-2">
          <section id="ollama" className="scroll-mt-4 space-y-3 rounded-xl border border-line bg-surface-0 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Bot className="size-5 text-accent" /> Ollama</h2>
            <OllamaStatus />
          </section>
          <section id="dadata" className="scroll-mt-4 space-y-3 rounded-xl border border-line bg-surface-0 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Database className="size-5 text-accent" /> DaData</h2>
            <DataStatus />
          </section>
        </div>
      </div>
    </div>
  );
}

function SearchSettings() {
  const preferences = usePreferences();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof searchIntegration.status>> | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [keywords, setKeywords] = useState(preferences.searchKeywords);
  const keywordsError = searchKeywordError(parseSearchKeywords(keywords));
  useEffect(() => {
    const controller = new AbortController();
    void searchIntegration.status(controller.signal).then(setStatus).catch(() => {
      if (!controller.signal.aborted) setError("Не удалось получить состояние SearXNG.");
    });
    return () => controller.abort();
  }, []);

  const check = async () => {
    setChecking(true);
    setError("");
    try { setStatus(await searchIntegration.check()); }
    catch { setError("Не удалось проверить поиск."); }
    finally { setChecking(false); }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (keywordsError) return;
    preferences.setSearchKeywords(parseSearchKeywords(keywords).join("\n"));
    setSaved(true);
  };

  return (
    <section id="search" className="scroll-mt-4 rounded-xl border border-line bg-surface-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Search className="size-5 text-accent" /> Веб-поиск · SearXNG</h2>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">Ищет по именам, компании и ключевым словам, в том числе по карте сайта из отчёта. Если SearXNG не вернёт ссылки, запрос отправится в публичный поиск Wikipedia.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status?.available ? "violet" : status?.available === false ? "amber" : "neutral"}>
            {status?.provider === "wikipedia" ? "Работает резервный поиск" : status?.available ? "SearXNG отвечает" : status?.available === false ? "Нет результатов" : status?.configured ? "Настроен" : status ? "Не настроен" : "Статус неизвестен"}
          </Badge>
          <Button size="sm" variant="secondary" disabled={checking || status?.configured === false} onClick={() => void check()}>
            {checking ? "Проверяем…" : "Проверить поиск"}
          </Button>
        </div>
        {error && <p role="alert" className="w-full text-sm text-danger">{error}</p>}
        {status?.message && <p role="status" className="w-full text-sm text-ink-muted">{status.message}</p>}
        {status?.available && <p role="status" className="w-full text-sm text-ink-muted">Контрольный запрос вернул ссылок · {status.results}</p>}
      </div>
      <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <form className="min-w-0 space-y-2" onSubmit={save}>
          <label className="grid gap-1 text-sm font-medium">
            Ключевые слова по умолчанию
            <Textarea value={keywords} maxLength={850} className="min-h-24 resize-y font-normal"
              onChange={(event) => { setKeywords(event.target.value); setSaved(false); }}
              placeholder={"Open Source Summit\nkeynote\nLinux kernel"} />
          </label>
          <p className="text-xs text-ink-muted">До восьми фраз через запятую или с новой строки. Подставляются в новые ручные запуски в этом браузере.</p>
          {keywordsError && <p role="alert" className="text-xs text-danger">{keywordsError}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" variant="accent" disabled={!!keywordsError}>Сохранить слова</Button>
            {saved && <span role="status" className="text-xs text-ink-muted">Сохранено</span>}
          </div>
        </form>
        <div className="min-w-0 space-y-3">
          <label className="grid gap-1 text-sm">
            Веб-поиск при запуске
            <select className={selectClass} value={preferences.searchByDefault === false ? "off" : "auto"}
              onChange={(event) => preferences.setSearchByDefault(event.target.value === "off" ? false : null)}>
              <option value="auto">Включать, когда SearXNG настроен</option>
              <option value="off">Включать вручную</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Проверка новых публикаций
            <select className={selectClass} value={preferences.refreshHours ?? ""}
              onChange={(event) => preferences.setRefreshHours(event.target.value === "automatic" ? "automatic" : parseRefresh(event.target.value))}>
              <option value="automatic">По настройкам источника</option>
              {refreshOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <Link to="/app/companies" className="inline-flex text-sm text-accent hover:underline">Открыть отчёты клиентов</Link>
        </div>
      </div>
    </section>
  );
}

function DataStatus() {
  const [providers, setProviders] = useState<EnrichmentProviderStatus[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void enrichmentService.listProviders(controller.signal).then((data) => setProviders(data.items)).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, []);
  const dadata = providers?.find((provider) => provider.id === "dadata");
  if (error) return <p role="alert" className="text-sm text-danger">Не удалось загрузить состояние DaData.</p>;
  if (!providers) return <Skeleton className="h-14" />;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-muted">Заполняет реквизиты компании в таблице по ИНН или ОГРН.</p>
      <Badge tone={dadata?.configured ? "violet" : "neutral"}>{dadata?.configured ? "Настроен" : "Не настроен"}</Badge>
      {dadata?.operations.map((operation) => (
        <div key={operation.id} className="border-t border-line pt-3">
          <p className="font-medium">{operation.label}</p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">{operation.outputs.map((field) => field.label).join(" · ")}</p>
        </div>
      ))}
      <Button asChild size="sm" variant="secondary"><Link to="/app/tables">Открыть таблицы</Link></Button>
    </div>
  );
}
