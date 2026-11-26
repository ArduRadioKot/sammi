import { ExternalLink } from "lucide-react";
import type { Citation, ContactAnalysis } from "@/services/relationship-analysis";

export const percentage = (value: number | null) => value === null ? "—" : `${Math.round(value * 100)}%`;
export const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
  : "—";
const audioTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function Sources({ citations, onSource }: { citations: Citation[]; onSource?: (id: string) => void }) {
  if (!citations.length) return null;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-accent">Источники · {citations.length}</summary>
      <ul className="mt-2 space-y-2">
        {citations.map((source) => (
          <li key={source.source_id} className="rounded-md border border-line bg-surface-0 p-2.5">
            <blockquote className="wrap-break-word text-ink">{source.quote}</blockquote>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted">
              <span>{source.label}</span>
              {source.occurred_at
                ? <time dateTime={source.occurred_at}>{dateLabel(source.occurred_at)}</time>
                : <time dateTime={source.collected_at}>Собрано {dateLabel(source.collected_at)}</time>}
              {source.match_confidence !== null && <span>Совпадение · {percentage(source.match_confidence)}</span>}
              {source.verification && (
                <span>Подтверждено вручную · {source.verification.reviewer} · {dateLabel(source.verification.reviewed_at)}</span>
              )}
              {source.start_seconds !== null && source.end_seconds !== null && (
                <span>Расшифровка · {audioTime(source.start_seconds)}–{audioTime(source.end_seconds)}</span>
              )}
              {source.url && <a className="inline-flex items-center gap-1 text-accent underline" href={source.url} target="_blank" rel="noreferrer">Публикация <ExternalLink className="size-3" /></a>}
              {source.row_id && (onSource
                ? <button type="button" className="text-accent underline" onClick={() => onSource(source.row_id!)}>Строка CRM</button>
                : <span>Строка CRM · {source.row_id}</span>)}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function RecommendedAction({ contact, generatedAt, onSource }: {
  contact: ContactAnalysis;
  generatedAt: string | null;
  onSource?: (id: string) => void;
}) {
  if (!contact.next_action) return null;
  const author = contact.next_action_author === "gemma" ? "Gemma 4"
    : contact.next_action_author === "rules" ? "Правила Sammi" : "Анализ Sammi";
  return (
    <section className="space-y-2 rounded-md border border-line bg-surface-1 p-3">
      <h3 className="text-sm font-medium">Следующий шаг · {contact.name}</h3>
      <p className="wrap-break-word whitespace-pre-line text-sm">{contact.next_action.text}</p>
      <p className="text-xs text-ink-muted">
        {author}{generatedAt && <> · <time dateTime={generatedAt}>{dateLabel(generatedAt)}</time></>}
      </p>
      <Sources citations={contact.next_action.citations} onSource={onSource} />
    </section>
  );
}
