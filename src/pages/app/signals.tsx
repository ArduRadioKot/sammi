import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Input, Skeleton } from "@/components/ui/forms";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { signalsService, tablesService } from "@/services";
import type { DataTable, Signal } from "@/types/domain";
import { useAuthStore } from "@/stores/auth-store";
import { formatDistanceToNow } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";

const TYPES = [
  "New vacancies",
  "Job change",
  "ЕГРЮЛ changes",
  "New director",
  "Company status change",
  "News mention",
  "Telegram mention",
  "Website visit",
  "Custom signal",
];

export default function SignalsPage() {
  const [items, setItems] = useState<Signal[]>([]);
  const [tables, setTables] = useState<DataTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [signalType, setSignalType] = useState(TYPES[0]);
  const [tableId, setTableId] = useState("");
  const workspace = useAuthStore((s) => s.workspace);
  const workspaceId = workspace?.id;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [signals, tableList] = await Promise.all([
        signalsService.listSignals(),
        workspaceId ? tablesService.listTables(workspaceId) : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setItems(signals);
      setTables(tableList);
      setTableId(tableList[0]?.id ?? "");
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <div className="h-full overflow-auto p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.03em]">Сигналы</h1>
          <p className="text-[13px] text-ink-muted">События, которые меняют приоритет аккаунта</p>
        </div>
        <Button onClick={() => setOpen(true)}>Create Signal</Button>
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
              <Badge tone={item.status === "active" ? "green" : "neutral"}>{item.status}</Badge>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Create Signal">
          <div className="text-[12px] text-ink-muted">Шаг {step}: source → table → conditions → frequency → destination</div>
          {step === 1 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSignalType(type)}
                  className={`rounded-[var(--radius-md)] border px-3 py-2 text-left text-[13px] ${
                    signalType === type ? "border-ink" : "border-line"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <select
              className="mt-3 h-8 w-full rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2 text-[13px]"
              value={tableId}
              onChange={(event) => setTableId(event.target.value)}
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </select>
          )}
          {step === 3 && <p className="mt-3 text-[13px]">Employees &gt; 50 AND Industry contains IT</p>}
          {step === 4 && <Input className="mt-3" defaultValue="Ежедневно" />}
          {step === 5 && <p className="mt-3 text-[13px]">Destination: таблица + уведомление</p>}
          <div className="mt-4 flex justify-end gap-2">
            {step > 1 && (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                Назад
              </Button>
            )}
            <Button
              onClick={async () => {
                if (step < 5) {
                  setStep((s) => s + 1);
                  return;
                }
                const table = tables.find((item) => item.id === tableId);
                try {
                  const created = await signalsService.createSignal({
                    name: signalType,
                    tableId,
                    tableName: table?.name,
                    source: signalType,
                  });
                  setItems((current) => [created, ...current]);
                  setOpen(false);
                  setStep(1);
                  toast.success("Signal создан");
                } catch {
                  toast.message("Сигналы появятся после backend-модуля");
                }
                setStep(1);
                toast.success("Signal создан");
              }}
            >
              {step === 5 ? "Создать" : "Далее"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
