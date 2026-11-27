import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Bot, Copy, Database, History, LoaderCircle, Plus, Send, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Sheet } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/forms";
import { AssistantHistory } from "@/features/ai/assistant-history";
import { ApiError } from "@/lib/api/errors";
import { assistantService, type AssistantSource, type AssistantThread, type AssistantTurn, type TurnInput } from "@/services/assistant";
import { tablesService } from "@/services/tables";
import { useAuthStore } from "@/stores/auth-store";
import { usePreferences } from "@/stores/preferences-store";
import type { DataTable } from "@/types/domain";

const suggestions = [
  "Какие таблицы есть в рабочем пространстве?",
  "Помоги написать письмо после переговоров",
  "Подготовь вопросы для первой встречи с клиентом",
];

function archivedTurns(key: string): Array<Pick<AssistantTurn, "question" | "answer">> {
  try {
    const items: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    if (!Array.isArray(items)) return [];
    const turns: Array<Pick<AssistantTurn, "question" | "answer">> = [];
    for (const item of items.slice(-30)) {
      if (typeof item?.content !== "string" || !item.content.trim()) continue;
      if (item.role === "user") turns.push({ question: item.content.slice(0, 4000), answer: null });
      if (item.role === "assistant") {
        const turn = turns.at(-1);
        if (turn && !turn.answer) turn.answer = item.content.slice(0, 12000);
      }
    }
    return turns;
  } catch {
    return [];
  }
}

const describe = (reason: unknown, fallback: string) =>
  reason instanceof ApiError && !["NETWORK_ERROR", "AI_PROVIDER_UNAVAILABLE", "AI_PROVIDER_TIMEOUT"].includes(reason.code) ? reason.message : fallback;

export default function AgentsPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const workspaceId = useAuthStore((state) => state.workspace?.id);
  if (!userId || !workspaceId) return <p className="p-5 text-sm text-ink-muted">Откройте рабочее пространство, чтобы начать чат.</p>;
  return <AssistantWorkspace key={`${userId}:${workspaceId}`} workspaceId={workspaceId} archiveKey={`sammi:work-assistant:${userId}:${workspaceId}`} />;
}

function AssistantWorkspace({ workspaceId, archiveKey }: { workspaceId: string; archiveKey: string }) {
  const [params, setParams] = useSearchParams();
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [tables, setTables] = useState<DataTable[]>([]);
  const [tablesLoaded, setTablesLoaded] = useState(false);
  const [archive, setArchive] = useState(() => archivedTurns(archiveKey));
  const archiveId = useRef(crypto.randomUUID());
  const restoring = useRef(false);
  const selected = params.get("chat");
  const activeId = selected ?? draftId;

  useEffect(() => {
    const controller = new AbortController();
    void assistantService.list(workspaceId, 0, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setThreads(result.items);
      setHasMore(result.has_more);
      setOffset(result.items.length);
      setHistoryError("");
    }).catch(() => {
      if (!controller.signal.aborted) setHistoryError("Не удалось загрузить историю.");
    }).finally(() => {
      if (!controller.signal.aborted) setHistoryLoading(false);
    });
    return () => controller.abort();
  }, [workspaceId, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    void tablesService.listTables(workspaceId, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      setTables(result);
      setTablesLoaded(true);
    }).catch(() => {
      if (!controller.signal.aborted) setTablesLoaded(false);
    });
    return () => controller.abort();
  }, [workspaceId]);

  const open = (id: string) => {
    setParams({ chat: id });
    setHistoryOpen(false);
  };

  const startNew = () => {
    setDraftId(crypto.randomUUID());
    setParams({});
    setHistoryOpen(false);
  };

  const upsert = (thread: AssistantThread) => setThreads((items) => [thread, ...items.filter((item) => item.id !== thread.id)]);

  const loadMore = async () => {
    if (historyLoading) return;
    setHistoryLoading(true);
    if (!offset) {
      setRefresh((value) => value + 1);
      return;
    }
    try {
      const result = await assistantService.list(workspaceId, offset);
      setThreads((items) => [...items, ...result.items.filter((item) => !items.some((existing) => existing.id === item.id))]);
      setOffset(offset + result.items.length);
      setHasMore(result.has_more);
      setHistoryError("");
    } catch {
      setHistoryError("Не удалось загрузить историю.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const restore = async () => {
    if (!archive.length || restoring.current) return;
    restoring.current = true;
    try {
      const thread = await assistantService.create(workspaceId, archiveId.current, archive[0].question, undefined, archive);
      try { sessionStorage.removeItem(archiveKey); } catch { /* The server already holds the archive. */ }
      setArchive([]);
      upsert(thread);
      open(thread.id);
    } catch (reason) {
      toast.error(describe(reason, "Не удалось восстановить прошлый чат."));
    } finally {
      restoring.current = false;
    }
  };

  const history = <AssistantHistory items={threads} activeId={activeId} hasMore={hasMore} loading={historyLoading}
    error={historyError} hasArchive={archive.length > 0} onNew={startNew} onOpen={open}
    onMore={() => void loadMore()} onRestore={() => void restore()} />;

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-56 shrink-0 border-r border-line p-3 xl:block">{history}</aside>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen} title="История чатов" width={360}>{history}</Sheet>
      <WorkAssistant key={activeId} id={activeId} workspaceId={workspaceId} saved={selected !== null}
        tables={tables} tablesLoaded={tablesLoaded} onHistory={() => setHistoryOpen(true)} onNew={startNew}
        onCreated={(thread) => { upsert(thread); setParams({ chat: thread.id }, { replace: true }); }}
        onActivity={(id) => setThreads((items) => {
          const active = items.find((item) => item.id === id);
          if (!active) return items;
          return [{ ...active, updated_at: new Date().toISOString() }, ...items.filter((item) => item.id !== id)];
        })}
        onDeleted={(id) => { setThreads((items) => items.filter((item) => item.id !== id)); startNew(); }} />
    </div>
  );
}

function WorkAssistant({ id, workspaceId, saved, tables, tablesLoaded, onHistory, onNew, onCreated, onActivity, onDeleted }: {
  id: string; workspaceId: string; saved: boolean; tables: DataTable[]; tablesLoaded: boolean;
  onHistory: () => void; onNew: () => void; onCreated: (thread: AssistantThread) => void;
  onActivity: (id: string) => void; onDeleted: (id: string) => void;
}) {
  const sendOnEnter = usePreferences((state) => state.sendOnEnter);
  const [loadExisting] = useState(saved);
  const [loading, setLoading] = useState(loadExisting);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [threadReady, setThreadReady] = useState(saved);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState("all");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const request = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const last = turns.at(-1);
  const hasConversation = !!turns.length;
  const model = [...turns].reverse().find((turn) => turn.model)?.model ?? "Gemma 4";

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!loadExisting) return;
    const controller = new AbortController();
    void assistantService.get(workspaceId, id, controller.signal).then(({ turns: stored }) => {
      if (controller.signal.aborted) return;
      setTurns(stored);
      const latest = stored.at(-1);
      if (latest) setScope(latest.search_tables ? latest.table_id ?? "all" : "off");
      setLoadError("");
    }).catch((reason) => {
      if (!controller.signal.aborted) setLoadError(describe(reason, "Не удалось открыть чат."));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [id, workspaceId, loadExisting, attempt]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns, pending, error]);

  const send = async (retry?: AssistantTurn) => {
    const text = question.trim();
    if (request.current || loading || loadError || (!text && !retry)) return;
    const input: TurnInput = retry ? {
      question: retry.question, search_tables: retry.search_tables, table_id: retry.table_id,
    } : { question: text, search_tables: scope !== "off", table_id: scope === "all" || scope === "off" ? null : scope };
    const turnId = retry?.id ?? crypto.randomUUID();
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    if (!retry) {
      setQuestion("");
      setTurns((items) => [...items, { ...input, id: turnId, answer: null, model: null, sources: [], created_at: new Date().toISOString() }]);
    }

    try {
      if (!threadReady) {
        const thread = await assistantService.create(workspaceId, id, input.question, controller.signal);
        if (controller.signal.aborted) return;
        setThreadReady(true);
        onCreated(thread);
      }
      const answer = await assistantService.ask(workspaceId, id, turnId, input, controller.signal);
      if (controller.signal.aborted) return;
      setTurns((items) => items.map((item) => item.id === turnId ? answer : item));
      onActivity(id);
    } catch (reason) {
      if (!controller.signal.aborted) setError(describe(reason, "Локальная модель не ответила. Проверьте Ollama и повторите запрос."));
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
        composer.current?.focus();
      }
    }
  };

  const stop = () => {
    request.current?.abort();
    request.current = null;
    setPending(false);
    composer.current?.focus();
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await assistantService.remove(workspaceId, id);
      onDeleted(id);
    } catch (reason) {
      toast.error(describe(reason, "Не удалось удалить чат."));
      setDeleting(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 sm:px-7">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">ИИ-помощник</h1>
          <p className="text-xs text-ink-muted">{model} · локальная Ollama</p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="secondary" className="xl:hidden" onClick={onHistory}><History /> История</Button>
          <Button size="icon" variant="ghost" className="xl:hidden" onClick={onNew} aria-label="Новый чат" title="Новый чат"><Plus /></Button>
          <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex"><Link to="/app/settings?section=model">Модель <ArrowUpRight /></Link></Button>
          {threadReady && !loadError && <Button size="icon" variant="ghost" disabled={pending} onClick={() => setConfirmDelete(true)}
            aria-label="Удалить чат" title="Удалить чат"><Trash2 /></Button>}
        </div>
      </header>

      <div className={`min-h-0 flex-1 ${hasConversation ? "flex flex-col" : "overflow-y-auto overscroll-y-contain"}`}>
        <div ref={log} role="log" aria-label="Переписка с помощником"
          className={`px-4 py-5 sm:px-7 sm:py-7 ${hasConversation ? "min-h-0 flex-1 overflow-y-auto overscroll-y-contain" : ""}`}>
          <div className="mx-auto max-w-3xl space-y-5">
            {loading && <p role="status" className="text-sm text-ink-muted">Открываем чат…</p>}
            {loadError && <div role="alert" className="space-y-3 rounded-lg bg-surface-0 p-4 text-sm">
              <p>{loadError}</p>
              <Button size="sm" variant="secondary" onClick={() => { setLoadError(""); setLoading(true); setAttempt((value) => value + 1); }}>Повторить</Button>
            </div>}
            {!hasConversation && !loading && !loadError && (
              <div className="sm:pt-4">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-4xl">Чем помочь?</h2>
                <p className="mt-2 max-w-lg text-sm leading-6 text-ink-muted">Ищите в таблицах рабочего пространства или задайте общий вопрос.</p>
                <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface-0 px-3 sm:mt-6 sm:px-4">
                  {suggestions.map((item) => <li key={item}>
                    <button type="button" className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm hover:text-accent"
                      onClick={() => { setQuestion(item); composer.current?.focus(); }}>{item}<ArrowUpRight className="size-4 shrink-0 text-accent" /></button>
                  </li>)}
                </ul>
              </div>
            )}
            {turns.map((turn) => <div className="space-y-3" key={turn.id}>
              <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm bg-accent px-4 py-3 text-sm leading-6 wrap-anywhere whitespace-pre-wrap text-accent-foreground">{turn.question}</p>
              {turn.answer && (
                <article className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent"><Bot className="size-4" /></span>
                  <div className="rounded-xl bg-surface-0 px-4 py-3">
                    <p className="text-sm leading-7 wrap-anywhere whitespace-pre-wrap">{turn.answer}</p>
                    <Sources sources={turn.sources} answer={turn.answer} />
                    <Button type="button" size="sm" variant="ghost" className="mt-2" onClick={() => {
                      if (!navigator.clipboard) return void toast.error("Буфер обмена недоступен");
                      void navigator.clipboard.writeText(turn.answer!).then(() => toast.success("Ответ скопирован"), () => toast.error("Не удалось скопировать ответ"));
                    }}><Copy /> Копировать</Button>
                  </div>
                </article>
              )}
            </div>)}
            {pending && <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
              <LoaderCircle className="size-4 animate-spin text-accent" /> {last?.search_tables ? "Ищу в таблицах и готовлю ответ" : "Gemma 4 готовит ответ"}
            </p>}
            {error && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
            {!pending && last && last.answer === null && <Button type="button" size="sm" variant="secondary" onClick={() => void send(last)}>Повторить вопрос</Button>}
          </div>
        </div>

        {!loading && !loadError && <div className="shrink-0 px-4 pb-4 sm:px-7 sm:pb-6">
          <form onSubmit={submit} className="mx-auto max-w-3xl rounded-xl border border-line bg-surface-0 p-2 focus-within:border-accent">
            <label className="mx-2 flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
              <Database className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">Где искать</span>
              <select value={scope} onChange={(event) => setScope(event.target.value)}
                className="min-w-0 max-w-full rounded-md border border-line bg-surface-0 px-2 py-1.5 text-xs text-ink">
                <option value="all">{tablesLoaded && !tables.length ? "Все таблицы · пока пусто" : "Искать во всех таблицах"}</option>
                <option value="off">Без поиска по таблицам</option>
                {scope !== "all" && scope !== "off" && !tables.some((table) => table.id === scope) && <option value={scope}>Выбранная таблица недоступна</option>}
                {tables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
              </select>
            </label>
            <Textarea ref={composer} rows={2} maxLength={4000} value={question} onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (!event.nativeEvent.isComposing && sendOnEnter && event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              aria-label="Сообщение для ИИ-помощника" placeholder="Напишите вопрос…"
              className="min-h-14 resize-none border-0 bg-transparent px-3 py-2 text-sm" />
            <div className="flex items-center justify-end gap-2 px-2 pb-1 sm:justify-between">
              <span className="hidden text-xs text-ink-muted sm:inline">{sendOnEnter ? "Enter — отправить · Shift + Enter — новая строка" : "Enter — новая строка"}</span>
              {pending ? <Button type="button" size="sm" variant="secondary" onClick={stop}><Square /> Остановить</Button>
                : <Button type="submit" size="sm" variant="accent" disabled={!question.trim()}><Send /> Отправить</Button>}
            </div>
          </form>
        </div>}
      </div>
      <Dialog open={confirmDelete} onOpenChange={(open) => { if (!deleting) setConfirmDelete(open); }}>
        <DialogContent title="Удалить чат?">
          <p className="text-sm text-ink-muted">Переписка исчезнет из вашей истории.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>Отмена</Button>
            <Button variant="danger" disabled={deleting} onClick={() => void remove()}>Удалить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Sources({ sources, answer }: { sources: AssistantSource[]; answer: string }) {
  if (!sources.length) return null;
  const referenced = new Set(Array.from(answer.matchAll(/\[(\d{1,3})\]/g), (match) => Number(match[1])));
  const indexed = sources.map((source, index) => ({ ...source, number: index + 1 }));
  const cited = indexed.filter((source) => referenced.has(source.number));
  const visible = cited.length ? cited : indexed.slice(0, 5);
  const extraRows = visible.some((source) => source.row_id)
    ? [] : indexed.filter((source) => source.row_id).slice(0, 3);
  return (
    <div className="mt-3 border-t border-line pt-2">
      <h3 className="text-xs font-medium text-ink-muted">{cited.length ? "Источники ответа" : "Найдено в таблицах"}</h3>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {visible.map((source) => (
          <li key={source.number}>
            <Link className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-xs wrap-anywhere text-accent hover:underline"
              to={`/app/tables/${source.table_id}${source.row_id ? `?row=${source.row_id}` : ""}`}>
              [{source.number}] {source.label} <ArrowUpRight className="size-3 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      {extraRows.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          Найденные строки{" "}
          {extraRows.map((source) => (
            <Link key={source.number} className="mr-2 text-accent underline"
              to={`/app/tables/${source.table_id}?row=${source.row_id}`}>[{source.number}]</Link>
          ))}
        </p>
      )}
    </div>
  );
}
