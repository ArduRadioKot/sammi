import { useEffect, useState } from "react";
import { Badge, Skeleton } from "@/components/ui/forms";
import { signalsService } from "@/services";
import type { Signal } from "@/types/domain";
import { formatDistanceToNow } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";

export default function SignalsPage() {
  const [items, setItems] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const signals = await signalsService.listSignals();
      if (cancelled) return;
      setItems(signals);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full overflow-auto p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.03em]">Сигналы</h1>
          <p className="text-[13px] text-ink-muted">События, которые меняют приоритет аккаунта</p>
        </div>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-24" />
      ) : (
        <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-line">
          <div className="grid grid-cols-[1.3fr_140px_90px_120px_140px_90px_90px] bg-surface-1 px-3 py-2 text-[11px] text-ink-muted">
            <span>Signal</span>
            <span>Source</span>
            <span>Companies</span>
            <span>Frequency</span>
            <span>Last run</span>
            <span>New</span>
            <span>Status</span>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1.3fr_140px_90px_120px_140px_90px_90px] items-center border-t border-line px-3 py-2 text-[13px]"
            >
              <div>
                <div>{item.name}</div>
                <div className="text-[12px] text-ink-muted">{item.tableName}</div>
              </div>
              <span>{item.source}</span>
              <span>{item.companies}</span>
              <span className="text-ink-muted">{item.frequency}</span>
              <span className="text-ink-muted">
                {formatDistanceToNow(new Date(item.lastRun), { addSuffix: true, locale: ruLocale })}
              </span>
              <span>{item.newEvents}</span>
              <Badge tone={item.status === "active" ? "violet" : "neutral"}>{item.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
