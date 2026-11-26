import { useEffect, useState } from "react";
import { Badge, Skeleton } from "@/components/ui/forms";
import { relationshipAnalysis, type ContactCard } from "@/services/relationship-analysis";
import { RecommendedAction } from "./analysis-evidence";

type CardResult = { key: string; card: ContactCard | null; failed?: boolean };

export function useContactAnalysisCard(tableId?: string, rowId?: string) {
  const [result, setResult] = useState<CardResult>();
  const key = `${tableId ?? ""}:${rowId ?? ""}`;
  useEffect(() => {
    if (!tableId || !rowId) return;
    const controller = new AbortController();
    void relationshipAnalysis.contactCard(tableId, rowId, controller.signal)
      .then((card) => { if (!controller.signal.aborted) setResult({ key, card }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, card: null, failed: true }); });
    return () => controller.abort();
  }, [tableId, rowId, key]);
  return result?.key === key ? result : undefined;
}

export function ContactRecommendation({ result }: { result?: CardResult }) {
  if (!result) return <Skeleton className="h-24" />;
  if (result.failed) return <p className="text-sm text-ink-muted">Не удалось загрузить результат анализа.</p>;
  if (!result.card?.contact.next_action) return <p className="text-sm text-ink-muted">Для этого контакта пока нет рекомендации.</p>;
  const { card } = result;
  return (
    <div className="space-y-2">
      {card.stale && <Badge tone="amber">Таблица изменилась после анализа</Badge>}
      <RecommendedAction contact={card.contact} generatedAt={card.generated_at} />
    </div>
  );
}
