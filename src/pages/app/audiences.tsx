import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/forms";
import { audiencesService } from "@/services";
import type { Audience } from "@/types/domain";
import { formatDistanceToNow } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";

export default function AudiencesPage() {
  const [items, setItems] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    audiencesService.listAudiences().then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="h-full overflow-auto p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.03em]">Аудитории</h1>
          <p className="text-[13px] text-ink-muted">Динамические сегменты по правилам таблицы</p>
        </div>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-24" />
      ) : items.length === 0 ? (
        <div className="mt-16 text-center">
          <div className="text-[14px] font-medium">Аудиторий пока нет</div>
          <p className="mt-1 text-[13px] text-ink-muted">Соберите сегмент из условий таблицы и отправьте в CRM.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-line">
          <div className="grid grid-cols-[1.3fr_110px_1.4fr_140px_140px] bg-surface-1 px-3 py-2 text-[11px] text-ink-muted">
            <span>Name</span>
            <span>Entity</span>
            <span>Rules</span>
            <span>Updated</span>
            <span>Destinations</span>
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1.3fr_110px_1.4fr_140px_140px] items-center border-t border-line px-3 py-3 text-[13px]"
            >
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="text-[12px] text-ink-muted">{item.count.toLocaleString("ru-RU")} companies</div>
              </div>
              <span>{item.entity}</span>
              <span className="truncate text-ink-muted">
                {item.rules.map((rule) => `${rule.columnId} ${rule.operator} ${rule.value ?? ""}`).join(" AND ")}
              </span>
              <span className="text-ink-muted">
                {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true, locale: ruLocale })}
              </span>
              <span>{item.destinations.join(", ") || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
