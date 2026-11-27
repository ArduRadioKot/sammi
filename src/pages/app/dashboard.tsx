import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/forms";
import { tablesService } from "@/services";
import { formatNumber } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";
import type { DataTable } from "@/types/domain";
import { useAuthStore } from "@/stores/auth-store";
import { ImportWizard } from "@/features/tables/components/csv-import-wizard";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<DataTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const workspace = useAuthStore((s) => s.workspace);
  const workspaceId = workspace?.id;
  const name = user?.name ?? "коллега";

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    tablesService.listTables(workspaceId).then((items) => {
      if (cancelled) return;
      setTables(items);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1180px] px-6 py-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="ds-label text-ink-faint">Рабочее место</div>
            <h1 className="mt-1 text-[22px] font-medium tracking-[-0.03em]">Рабочий контур, {name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate("/app/tables")}>Создать таблицу</Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              Импорт CSV
            </Button>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-[13px] font-medium">Недавние таблицы</h2>
          <div className="mt-2 overflow-x-auto rounded-[var(--radius-md)] border border-line">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1.6fr_110px_80px_160px] bg-surface-1 px-3 py-2 text-[11px] text-ink-muted">
                <span>Название</span>
                <span>Тип</span>
                <span>Строки</span>
                <span>Изменено</span>
              </div>
              {loading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="mx-3 my-2 h-8" />
                  ))
                : tables.length === 0 ? (
                    <div className="border-t border-line px-3 py-6 text-center">
                      <div className="text-[13px] text-ink-muted">Таблиц пока нет.</div>
                      <Button className="mt-3" size="sm" onClick={() => navigate("/app/tables")}>
                        Создать таблицу
                      </Button>
                    </div>
                  ) : (
                    tables.slice(0, 5).map((table) => (
                    <Link
                      key={table.id}
                      to={`/app/tables/${table.id}`}
                      className="grid grid-cols-[1.6fr_110px_80px_160px] items-center border-t border-line px-3 py-2 text-[13px] hover:bg-row-hover"
                    >
                      <span className="truncate">{table.name}</span>
                      <span className="text-ink-muted">{table.type}</span>
                      <span>{formatNumber(table.rowCount)}</span>
                      <span className="text-ink-muted">
                        {formatDistanceToNow(new Date(table.updatedAt), {
                          addSuffix: true,
                          locale: ruLocale,
                        })}
                      </span>
                    </Link>
                    ))
                  )}
            </div>
          </div>
        </section>

      </div>
      <ImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        mode="workspace"
        onImported={() => {
          if (!workspaceId) return;
          void tablesService.listTables(workspaceId).then(setTables);
        }}
      />
    </div>
  );
}
