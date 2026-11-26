import { useState, type FormEvent } from "react";
import { Bot, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Textarea } from "@/components/ui/forms";
import { ApiError } from "@/lib/api/errors";
import { relationshipAnalysis, type AnalysisAnswer, type AnalysisQuestion, type ContactAnalysis } from "@/services/relationship-analysis";
import { FindingItem } from "./analysis-report";
import { selectClass } from "./analysis-setup";

export function AnalysisAssistant({
  tableId, contacts, contactId, onSource, disabled,
}: {
  tableId: string;
  contacts: ContactAnalysis[];
  contactId: string;
  onSource: (id: string) => void;
  disabled: boolean;
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
    <aside className="min-w-0 space-y-3 rounded-lg border border-line bg-surface-0 p-4 md:p-5">
      <div className="flex items-center gap-2">
        <Bot className="size-4 text-accent" aria-hidden="true" />
        <h2 className="text-base font-medium">Ассистент по клиенту</h2>
      </div>
      <fieldset disabled={disabled || !!pending} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="max-w-full truncate text-xs text-ink-muted">{contact.name}</div>
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
      {turns.length > 0 && (
        <div className="max-h-[460px] space-y-3 overflow-auto border-t border-line pt-3" role="log" aria-label="История вопросов">
          {turns.map((turn, index) => (
            <article key={index} className="space-y-2">
              <p className="wrap-break-word text-sm font-medium">{turn.question}</p>
              {turn.answer.items.map((item, itemIndex) => (
                <div key={itemIndex} className="space-y-1">
                  {item.status === "hypothesis" && <Badge tone="amber">Без подтверждения</Badge>}
                  {item.status === "draft" && <Badge tone="blue">Черновик</Badge>}
                  <FindingItem finding={item} onSource={onSource} />
                </div>
              ))}
            </article>
          ))}
        </div>
      )}
      {pending && <p role="status" className="text-sm text-ink-muted">Обрабатываю запрос…</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <form onSubmit={submit} className="space-y-2">
        <Textarea
          className="min-h-[76px]" aria-label="Вопрос по клиенту"
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
  );
}
