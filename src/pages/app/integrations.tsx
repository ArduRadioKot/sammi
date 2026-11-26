import { useEffect, useMemo, useState } from "react";
import { Badge, Input, Skeleton } from "@/components/ui/forms";
import { integrationsService } from "@/services";
import type { Integration } from "@/types/domain";

const CATEGORIES = ["all", "crm", "data", "ai", "communication", "automation", "storage"] as const;

export default function IntegrationsPage() {
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("all");

  useEffect(() => {
    integrationsService.listIntegrations().then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const matchesQuery = `${item.name} ${item.description}`.toLowerCase().includes(query.toLowerCase());
        const matchesCategory = category === "all" || item.category === category;
        return matchesQuery && matchesCategory;
      }),
    [items, query, category],
  );

  return (
    <div className="h-full overflow-auto p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.03em]">Интеграции</h1>
          <p className="text-[13px] text-ink-muted">CRM, данные, AI и automation</p>
        </div>
        <Input className="w-64" placeholder="Search integrations" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-1">
        {CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`h-8 rounded-[var(--radius-sm)] px-2.5 text-[12px] ${
              category === item ? "bg-ink text-primary-foreground" : "bg-surface-1 text-ink-muted"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-24" />
      ) : (
        <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {filtered.map((item) => (
            <div key={item.id} className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-medium">{item.name}</div>
                  <div className="mt-1 text-[12px] text-ink-muted">{item.description}</div>
                </div>
                <Badge tone={item.connected ? "violet" : "neutral"}>
                  {item.connected ? "Connected" : "Not connected"}
                </Badge>
              </div>
              <p className="mt-3 text-[11px] text-ink-faint">Подключение появится после реализации серверной интеграции.</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
