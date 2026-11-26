import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/forms";
import { agentsService } from "@/services";
import type { Agent } from "@/types/domain";
import { formatDistanceToNow } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";

export default function AgentsPage() {
  const [items, setItems] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    agentsService.listAgents().then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="h-full overflow-auto p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.03em]">AI-агенты</h1>
          <p className="text-[13px] text-ink-muted">Исследование, scoring и классификация — отдельный шаг после Enrichment</p>
        </div>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-24" />
      ) : items.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="text-[14px] font-medium">AI-агенты ещё не подключены</div>
          <p className="mt-1 text-[13px] text-ink-muted">Здесь появятся агенты, сохранённые в workspace. Для обогащения таблиц используйте DaData.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-line">
          <div className="grid grid-cols-[1.4fr_140px_80px_110px_90px_140px] bg-surface-1 px-3 py-2 text-[11px] text-ink-muted">
            <span>Name</span>
            <span>Model</span>
            <span>Runs</span>
            <span>Success</span>
            <span>Credits</span>
            <span>Updated</span>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1.4fr_140px_80px_110px_90px_140px] items-center border-t border-line px-3 py-3 text-[13px]"
            >
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="text-[12px] text-ink-muted">{item.description}</div>
              </div>
              <span>{item.modelId}</span>
              <span>{item.runs}</span>
              <span>{Math.round(item.successRate * 100)}%</span>
              <span>{item.credits}</span>
              <span className="text-ink-muted">
                {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true, locale: ruLocale })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
