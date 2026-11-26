import { useState, type FormEvent } from "react";
import { Bot, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Badge, Textarea } from "@/components/ui/forms";
import { ApiError } from "@/lib/api/errors";
import { relationshipAnalysis, type AnalysisAnswer, type AnalysisQuestion, type ContactAnalysis } from "@/services/relationship-analysis";
import { FindingItem } from "./analysis-report";
import { selectClass } from "./analysis-setup";

export function AnalysisAssistant({
  tableId, contacts, contactId, onSource, disabled, open, onOpenChange,
}: {
  tableId: string;
  contacts: ContactAnalysis[];
  contactId: string;
  onSource: (id: string) => void;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [question, setQuestion] = useState("");
  const [target, setTarget] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<Array<{ question: string; answer: AnalysisAnswer }>>([]);
  const contact = contacts.find((item) => item.id === contactId) ?? contacts[0];

  const ask = async (input: AnalysisQuestion) => {
    setError("");
    setPending(input.question);
    try {
      const answer = await relationshipAnalysis.ask(tableId, {
        ...input,
        previous_questions: input.intent === "question" ? turns.slice(-3).map((turn) => turn.question) : [],
      });
      setTurns((items) => [...items, { question: input.question, answer }]);
      if (input.intent === "question") setQuestion("");
    } catch (reason) {
      setError(reason instanceof ApiError && reason.code.startsWith("AI_")
        ? "Gemma 4 временно не ответила. Повторите запрос."
        : reason instanceof ApiError ? reason.message : "Не удалось получить ответ.");
    } finally {
      setPending("");
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (question.trim().length >= 3) void ask({ question: question.trim(), intent: "question" });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="ИИ-помощник по клиенту" width={520}>
      <aside className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <fieldset disabled={disabled || !!pending} className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Bot className="size-4" /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{contact.name}</span><span className="block truncate text-xs text-ink-muted">{contact.title || "Должность не указана"}</span></span>
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Очистить переписку" title="Очистить переписку" disabled={!turns.length || !!pending} onClick={() => setTurns([])}><Trash2 className="size-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary" size="sm"
            onClick={() => void ask({ question: `Подготовь бриф к встрече с контактом ${contact.name}.`, contact_id: contact.id, intent: "brief" })}
          >
            Бриф к встрече
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void ask({
            question: `Подготовь черновик письма контакту ${contact.name} о следующем шаге.`,
            contact_id: contact.id, intent: "email",
          })}>Черновик письма</Button>
        </div>
        {contacts.length > 1 && (
          <div className="flex min-w-0 gap-2">
            <select className={selectClass} aria-label="Целевой контакт для поиска пути"
              value={target === contact.id ? "" : target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">Путь к контакту</option>
              {contacts.filter((item) => item.id !== contact.id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            <Button variant="secondary" disabled={!target || target === contact.id} onClick={() => void ask({
              question: `Путь от ${contact.name} к контакту ${contacts.find((item) => item.id === target)?.name}.`,
              contact_id: contact.id, target_id: target, intent: "path",
            })}>Найти</Button>
          </div>
        )}
      </fieldset>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto border-t border-line pt-3" role="log" aria-label="История вопросов">
        {turns.length === 0 && <p className="rounded-xl bg-surface-1 p-3 text-sm leading-6 text-ink-muted">Задайте вопрос об этом клиенте. Например: «С чего начать следующую встречу?» или «Кто влияет на решение?»</p>}
        {turns.map((turn, index) => (
          <article key={index} className="space-y-3">
            <p className="ml-auto w-fit max-w-[90%] wrap-break-word rounded-2xl rounded-br-sm bg-accent px-3.5 py-2.5 text-sm leading-6 text-accent-foreground">{turn.question}</p>
            <div className="flex gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Bot className="size-3.5" /></span><div className="min-w-0 flex-1 space-y-2">
            {turn.answer.items.map((item, itemIndex) => (
              <div key={itemIndex} className="space-y-1">
                {item.status === "hypothesis" && <Badge tone="amber">Без подтверждения</Badge>}
                {item.status === "draft" && <Badge tone="blue">Черновик</Badge>}
                <FindingItem finding={item} onSource={onSource} />
              </div>
            ))}
            </div></div>
          </article>
        ))}
      </div>
      {pending && <p role="status" className="text-sm text-ink-muted">Обрабатываю запрос…</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <form onSubmit={submit} className="shrink-0 space-y-2 border-t border-line pt-3">
        <Textarea
          className="min-h-[90px] resize-y" aria-label="Вопрос по клиенту"
          placeholder="Кто согласует бюджет? О чём поговорить на встрече?"
          maxLength={800} value={question} onChange={(event) => setQuestion(event.target.value)}
          disabled={disabled || !!pending}
        />
        <Button type="submit" variant="accent" disabled={disabled || !!pending || question.trim().length < 3}>
          <Send /> Спросить
        </Button>
      </form>
      {disabled && <p className="text-xs text-ink-muted">Для вопросов нужен актуальный отчёт.</p>}
      </aside>
    </Sheet>
  );
}
