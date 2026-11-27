import { MessageSquareText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AssistantThread } from "@/services/assistant";

const date = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short" });

export function AssistantHistory({
  items, activeId, hasMore, loading, error, hasArchive, onNew, onOpen, onMore, onRestore,
}: {
  items: AssistantThread[];
  activeId: string;
  hasMore: boolean;
  loading: boolean;
  error: string;
  hasArchive: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onMore: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Button variant="secondary" onClick={onNew}><Plus /> Новый чат</Button>
      {hasArchive && <Button variant="ghost" onClick={onRestore}>Восстановить прошлый чат</Button>}
      <nav aria-label="История чатов" className="min-h-0 flex-1 overflow-y-auto">
        {items.length > 0 ? (
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" aria-current={activeId === item.id ? "page" : undefined}
                  className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-1 ${activeId === item.id ? "bg-accent-soft" : ""}`}
                  onClick={() => onOpen(item.id)}>
                  <MessageSquareText className="mt-0.5 size-4 text-ink-muted" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate" title={item.title}>{item.title}</span>
                    <time className="block text-xs text-ink-muted" dateTime={item.updated_at}>{date.format(new Date(item.updated_at))}</time>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : !loading && !error && <p className="px-2 py-4 text-sm text-ink-muted">Здесь появятся ваши чаты.</p>}
        {loading && <p role="status" className="px-2 py-2 text-sm text-ink-muted">Загрузка истории…</p>}
        {error && <p role="alert" className="px-2 py-2 text-sm text-danger">{error}</p>}
        {(hasMore || error) && <Button className="mt-2 w-full" variant="ghost" disabled={loading} onClick={onMore}>
          {error ? "Повторить" : "Показать ещё"}
        </Button>}
      </nav>
    </div>
  );
}
