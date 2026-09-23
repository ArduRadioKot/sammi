import { formatDistanceToNow } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/dialog";
import { hashHue, initials } from "@/lib/utils";
import { enrichmentService, type CellProvenance } from "@/services/enrichment";
import type { TableRow } from "@/types/domain";

function val(row: TableRow, id: string) {
  return row.cells[id]?.value;
}

export function RowDetails({
  open,
  onOpenChange,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: TableRow | null;
}) {
  if (!row) return null;
  const name = String(val(row, "company") ?? "");
  const hue = hashHue(name);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Company Details" width={440}>
      <div className="flex items-center gap-3">
        <span
          className="flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[13px] font-medium"
          style={{ background: `hsl(${hue} 18% 88%)`, color: `hsl(${hue} 22% 28%)` }}
        >
          {initials(name)}
        </span>
        <div>
          <div className="text-[16px] font-medium">{name || "Строка"}</div>
          <div className="text-[12px] text-ink-muted">{row.id}</div>
        </div>
      </div>
    </Sheet>
  );
}

export function CellDetails({
  open,
  onOpenChange,
  title,
  tableId,
  row,
  columnId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  tableId?: string;
  row: TableRow | null;
  columnId: string;
}) {
  const cell = row?.cells[columnId];
  const [provenance, setProvenance] = useState<CellProvenance | null>(null);

  useEffect(() => {
    if (!open || !tableId || !row?.id || !columnId) return;
    let cancelled = false;
    enrichmentService
      .getProvenance(tableId, row.id, columnId)
      .then((item) => {
        if (!cancelled) setProvenance(item);
      })
      .catch(() => {
        if (!cancelled) setProvenance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tableId, row?.id, columnId]);

  const local = cell?.provenance;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} width={400}>
      <div className="space-y-3 text-[13px]">
        <div>
          <div className="text-[11px] text-ink-faint uppercase">Value</div>
          <div className="mt-1">{String(cell?.value || cell?.error?.message || "—")}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint uppercase">Provider</div>
          <div className="mt-1">{provenance?.source_label ?? local?.providerName ?? "—"}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint uppercase">Operation</div>
          <div className="mt-1">{provenance?.operation ?? "—"}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint uppercase">Input</div>
          <div className="mt-1 font-mono text-[12px]">{String(provenance?.metadata?.input ?? "—")}</div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint uppercase">Retrieved</div>
          <div className="mt-1">
            {provenance?.retrieved_at
              ? formatDistanceToNow(new Date(provenance.retrieved_at), { addSuffix: true, locale: ruLocale })
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-ink-faint uppercase">Credits</div>
          <div className="mt-1">{provenance?.credits_charged ?? local?.credits ?? 0}</div>
        </div>
        {cell?.error && (
          <div className="rounded-[var(--radius-sm)] bg-danger-soft p-2 text-danger">{cell.error.message}</div>
        )}
        <div>
          <div className="text-[11px] text-ink-faint uppercase">Normalized fields</div>
          <pre className="mt-1 overflow-auto rounded-[var(--radius-sm)] bg-surface-1 p-2 font-mono text-[11px]">
            {JSON.stringify(provenance?.metadata?.normalized ?? { value: cell?.value, status: cell?.status }, null, 2)}
          </pre>
        </div>
      </div>
    </Sheet>
  );
}
