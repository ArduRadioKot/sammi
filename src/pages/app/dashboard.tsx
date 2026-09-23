import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/forms";
import { tablesService } from "@/services";
import { creditsService } from "@/services/credits";
import { formatCredits, formatNumber } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";
import type { DataTable } from "@/types/domain";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { ImportWizard } from "@/features/tables/components/csv-import-wizard";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [tables, setTables] = useState<DataTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const user = useAuthStore((s) => s.user);
  const workspace = useAuthStore((s) => s.workspace);
  const workspaceId = workspace?.id;
  const creditsEpoch = useWorkspaceStore((s) => s.creditsEpoch);
  const name = user?.name ?? "коллега";

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    tablesService.listTables(workspaceId).then((items) => {
      if (cancelled) return;
      setTables(items);
      setLoading(false);
    });
    creditsService.getBalance(workspaceId).then((balance) => {
      if (cancelled) return;
      setCredits(balance.available);
    }).catch(() => {
      if (cancelled) return;
      setCredits(null);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, creditsEpoch]);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1180px] px-6 py-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[11px] tracking-[0.14em] text-ink-faint uppercase">Home</div>
            <h1 className="mt-1 text-[22px] font-medium tracking-[-0.03em]">Рабочий контур, {name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate("/app/tables")}>Создать таблицу</Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.message("AI Column появится позже")}
            >
              Create with AI
            </Button>
          </div>
        </div>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-[var(--radius-md)] border border-line px-4 py-3">
            <div className="text-[11px] text-ink-muted">Credits remaining</div>
            <div className="mt-1 text-[22px] tracking-[-0.03em]">
              {credits == null ? "—" : formatCredits(credits)}
            </div>
          </div>
          <div className="rounded-[var(--radius-md)] border border-line px-4 py-3">
            <div className="text-[11px] text-ink-muted">Signals today</div>
            <div className="mt-1 text-[22px] tracking-[-0.03em]">0</div>
          </div>
          <div className="rounded-[var(--radius-md)] border border-line px-4 py-3">
            <div className="text-[11px] text-ink-muted">Last run</div>
            <div className="mt-1 text-[15px]">Нет запусков</div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[13px] font-medium">Recent tables</h2>
          <div className="mt-2 overflow-x-auto rounded-[var(--radius-md)] border border-line">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1.6fr_110px_80px_160px] bg-surface-1 px-3 py-2 text-[11px] text-ink-muted">
                <span>Название</span>
                <span>Тип</span>
                <span>Rows</span>
                <span>Last edited</span>
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

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <section>
            <h2 className="text-[13px] font-medium">Activity</h2>
            <div className="mt-2 divide-y divide-line rounded-[var(--radius-md)] border border-line">
              <div className="px-3 py-6 text-[13px] text-ink-muted">Истории списаний пока нет.</div>
            </div>
          </section>
          <section>
            <h2 className="text-[13px] font-medium">Signals</h2>
            <div className="mt-2 divide-y divide-line rounded-[var(--radius-md)] border border-line">
              <div className="px-3 py-6 text-[13px] text-ink-muted">Сигналов пока нет.</div>
            </div>
          </section>
        </div>

        <section className="mt-8">
          <h2 className="text-[13px] font-medium">Templates</h2>
          <div className="mt-2 divide-y divide-line rounded-[var(--radius-md)] border border-line">
            <div className="px-3 py-6 text-[13px] text-ink-muted">Шаблонов пока нет.</div>
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
