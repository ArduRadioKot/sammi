import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Skeleton, Textarea } from "@/components/ui/forms";
import { ApiError } from "@/lib/api/errors";
import {
  relationshipAnalysis, type AnalysisRun, type ContactAnalysis, type ReviewInput, type ReviewItem, type ReviewPreview,
} from "@/services/relationship-analysis";
import { dateLabel, percentage } from "./analysis-evidence";
import { selectClass } from "./analysis-setup";

function reviewError(error: unknown) {
  return error instanceof ApiError && error.code !== "NETWORK_ERROR"
    ? error.message
    : "Не удалось связаться с API. Повторите запрос.";
}

export function PublicationReview({
  tableId, runId, sourceId, item, contacts, canDecide, onClose, onSaved,
}: {
  tableId: string;
  runId: string;
  sourceId: string;
  item: ReviewItem;
  contacts: ContactAnalysis[];
  canDecide: boolean;
  onClose: () => void;
  onSaved: (run: AnalysisRun) => void;
}) {
  const [preview, setPreview] = useState<ReviewPreview | null>(null);
  const [contactId, setContactId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void relationshipAnalysis.reviewPreview(tableId, runId, sourceId, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setPreview(data); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reviewError(reason)); });
    return () => controller.abort();
  }, [tableId, runId, sourceId]);

  const save = async (decision: ReviewInput) => {
    setError("");
    setSaving(true);
    try {
      onSaved(await relationshipAnalysis.review(tableId, runId, sourceId, decision));
    } catch (reason) {
      setError(reviewError(reason));
    } finally {
      setSaving(false);
    }
  };

  const confirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canDecide && contactId) void save({ action: "confirmed", contact_id: contactId, note });
  };

  return (
    <Sheet open onOpenChange={(open) => { if (!open && !saving) onClose(); }} title="Проверка публикации" width={570}>
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-medium">{preview?.label ?? item.label}</h2>
          <p className="mt-1 text-sm text-ink-muted">{item.reason} Уверенность · {percentage(item.confidence)}</p>
        </div>
        {!preview && !error && <Skeleton className="h-32" />}
        {preview && (
          <>
            <div className="space-y-2">
              {(preview.occurred_at || preview.url) && (
                <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
                  {preview.occurred_at && <time dateTime={preview.occurred_at}>{dateLabel(preview.occurred_at)}</time>}
                  {preview.url && <a href={preview.url} className="text-accent underline" target="_blank" rel="noreferrer">Открыть источник</a>}
                </div>
              )}
              <blockquote className="max-h-72 overflow-auto wrap-break-word rounded-md border border-line bg-surface-1 p-3 text-sm leading-relaxed">
                {preview.text}
              </blockquote>
            </div>
            {canDecide && (
              <form onSubmit={confirm} className="space-y-3">
                <fieldset disabled={saving} className="space-y-3">
                  <label className="grid gap-1 text-xs text-ink-muted">
                    К какому контакту относится публикация
                    <select className={selectClass} required value={contactId} onChange={(event) => setContactId(event.target.value)}>
                      <option value="">Выберите контакт</option>
                      {contacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>{contact.name}{contact.title && ` · ${contact.title}`}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-ink-muted">
                    Комментарий к решению
                    <Textarea maxLength={500} className="min-h-[76px]" value={note} onChange={(event) => setNote(event.target.value)} />
                  </label>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="secondary" onClick={() => void save({ action: "rejected", note })}>Отклонить</Button>
                    <Button type="submit" variant="accent" disabled={!contactId}>{saving ? "Сохраняется…" : "Подтвердить и пересчитать"}</Button>
                  </div>
                </fieldset>
              </form>
            )}
          </>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Sheet>
  );
}
