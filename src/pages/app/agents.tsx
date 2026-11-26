import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, Bot, CircleAlert, LoaderCircle, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/forms";
import { ApiError } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth-store";
import { askWorkAssistant, listAIProviderModels, listAIProviders, type AIChatMessage } from "@/services/system/ai-providers";

const SUGGESTIONS = [
  "Подготовь план первой встречи с новым клиентом",
  "Помоги написать короткое письмо после переговоров",
  "Какие вопросы задать, чтобы понять процесс принятия решения?",
];
const historyKey = (workspaceId: string | undefined) => `sammi:work-assistant:${workspaceId ?? "session"}`;

function readHistory(key: string): AIChatMessage[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((item): item is AIChatMessage =>
      typeof item?.content === "string" && (item.role === "user" || item.role === "assistant"),
    ).slice(-30);
  } catch {
    return [];
  }
}

export default function AgentsPage() {
  const workspaceId = useAuthStore((state) => state.workspace?.id);
  return <WorkAssistant key={workspaceId ?? "session"} storageKey={historyKey(workspaceId)} />;
}

function WorkAssistant({ storageKey }: { storageKey: string }) {
  const key = storageKey;
  const [messages, setMessages] = useState<AIChatMessage[]>(() => readHistory(key));
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState("");
  const [modelReady, setModelReady] = useState<boolean | null>(null);
  const [modelLabel, setModelLabel] = useState("Gemma 4 · локально");
  const logRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([listAIProviders(controller.signal), listAIProviderModels("ollama", controller.signal)])
      .then(([providers, catalog]) => {
        if (controller.signal.aborted) return;
        const ollama = providers.providers.find((item) => item.id === "ollama");
        const installed = catalog.items;
        const gemma4 = installed.find((item) => /gemma\s*4|gemma4/i.test(`${item.id} ${item.name}`));
        const chosen = gemma4?.id ?? (ollama?.default_model && installed.some((item) => item.id === ollama.default_model) ? ollama.default_model : "");
        setModel(chosen);
        setModelLabel(chosen || "Gemma 4 · локально");
        setModelReady(Boolean(ollama?.available && chosen && /gemma\s*4|gemma4/i.test(chosen)));
      })
      .catch(() => { if (!controller.signal.aborted) setModelReady(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(messages.slice(-30)));
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [key, messages]);

  const send = async (text = question, appendUser = true) => {
    const value = text.trim();
    if (!value || pending || !modelReady) return;
    const userMessage: AIChatMessage = { role: "user", content: value };
    const next = (appendUser ? [...messages, userMessage] : messages).slice(-20);
    if (appendUser) setMessages(next);
    setQuestion("");
    setPending(true);
    setError("");
    try {
      const answer = await askWorkAssistant(next, model);
      const assistantMessage: AIChatMessage = { role: "assistant", content: answer.content };
      setMessages((current) => [...current, assistantMessage].slice(-30));
      setModelLabel(answer.model);
    } catch (reason) {
      const description = reason instanceof ApiError ? reason.message : "Не удалось связаться с локальной моделью.";
      setError(description);
    } finally {
      setPending(false);
      textRef.current?.focus();
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Bot className="size-5" /></div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Помощник по работе</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted"><span className={`size-1.5 rounded-full ${modelReady ? "bg-success" : modelReady === false ? "bg-warning" : "bg-ink-faint"}`} />{modelReady ? modelLabel : modelReady === false ? "Gemma 4 не найдена в Ollama" : "Проверяю Ollama…"}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" disabled={!messages.length || pending} onClick={() => { setMessages([]); setError(""); }}>
          <Trash2 className="size-4" /><span className="hidden sm:inline">Очистить чат</span>
        </Button>
      </header>

      <div ref={logRef} role="log" aria-live="polite" aria-label="Диалог с помощником" className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
          {messages.length === 0 ? (
            <div className="my-auto py-8">
              <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent"><Sparkles className="size-6" /></div>
              <h2 className="max-w-xl text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">Чем помочь в работе?</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">Составлю план встречи, помогу разобраться с клиентом или подготовлю письмо. Задайте вопрос своими словами.</p>
              <div className="mt-8 grid gap-2 sm:grid-cols-3">
                {SUGGESTIONS.map((item) => <button key={item} type="button" disabled={!modelReady || pending} onClick={() => void send(item)} className="min-h-20 rounded-xl bg-surface-1 p-3 text-left text-[13px] leading-5 transition-colors hover:bg-accent-soft disabled:opacity-50">{item}<span className="mt-2 block text-accent">Спросить →</span></button>)}
              </div>
            </div>
          ) : (
            <div className="space-y-6 pb-6">
              {messages.map((item, index) => item.role === "user" ? (
                <div key={`${index}-${item.role}`} className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-accent px-4 py-3 text-sm leading-6 text-accent-foreground sm:max-w-[76%]">{item.content}</div>
              ) : (
                <article key={`${index}-${item.role}`} className="flex gap-3 sm:gap-4">
                  <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Bot className="size-4" /></div>
                  <div className="min-w-0 max-w-2xl whitespace-pre-wrap pt-1 text-sm leading-7">{item.content}</div>
                </article>
              ))}
              {pending && <div className="flex items-center gap-3 text-sm text-ink-muted"><LoaderCircle className="size-4 animate-spin text-accent" />Gemma 4 формулирует ответ…</div>}
              {error && <div role="alert" className="ml-11 flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger"><CircleAlert className="mt-0.5 size-4 shrink-0" />{error}<button type="button" className="ml-auto underline" onClick={() => void send(messages.filter((item) => item.role === "user").at(-1)?.content ?? "", false)}>Повторить</button></div>}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4 sm:px-8 sm:pb-6">
        <form onSubmit={submit} className="mx-auto max-w-3xl rounded-2xl bg-surface-1 p-2 focus-within:ring-2 focus-within:ring-accent/30">
          <Textarea ref={textRef} rows={2} maxLength={4000} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={modelReady ? "Напишите вопрос… (Enter — отправить, Shift+Enter — новая строка)" : "Для чата запустите Ollama с установленной Gemma 4"} disabled={!modelReady || pending} className="min-h-14 resize-none border-0 bg-transparent px-3 py-2 text-sm focus-visible:border-transparent" />
          <div className="flex items-center justify-between gap-3 px-2 pb-1">
            <span className="text-[11px] text-ink-faint">Ответы генерирует локальная модель</span>
            <Button type="submit" size="sm" variant="accent" disabled={!question.trim() || !modelReady || pending} aria-label="Отправить вопрос"><Send className="size-4" /><span>Отправить</span></Button>
          </div>
        </form>
        <p className="mt-2 text-center text-[11px] text-ink-faint">Проверяйте факты перед использованием. У помощника нет доступа к записям компании, пока вы не добавите их в запрос.</p>
        {modelReady === false && <div className="mx-auto mt-2 flex max-w-3xl items-center justify-center gap-2 text-xs text-warning"><ArrowDown className="size-3.5" />Проверьте установку Gemma 4 и соединение с Ollama в настройках.</div>}
      </div>
    </div>
  );
}
