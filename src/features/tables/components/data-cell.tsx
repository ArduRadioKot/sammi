import { formatDistanceToNow } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";
import { Globe, Loader2, Mail, Phone, Sparkles } from "lucide-react";
import { memo } from "react";
import { Badge } from "@/components/ui/forms";
import { formatCurrencyRub, formatNumber, hashHue, initials } from "@/lib/utils";
import { statusLabel } from "@/features/tables/lib/column-types";
import type { CellValue, ColumnDefinition, RunStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

function asString(value: unknown) {
  if (value == null) return "";
  return String(value);
}

function StatusDot({ status }: { status?: RunStatus }) {
  if (!status || status === "idle") return null;
  const color: Record<string, string> = {
    queued: "bg-ink-faint",
    running: "bg-accent animate-pulse",
    success: "bg-success",
    not_found: "bg-warning",
    error: "bg-danger",
    skipped: "bg-ink-faint",
  };
  return <span className={cn("size-1.5 rounded-full", color[status])} title={statusLabel[status]} />;
}

function ProvenanceHint({ cell }: { cell: CellValue }) {
  if (!cell.provenance) return null;
  const ago = formatDistanceToNow(new Date(cell.provenance.updatedAt), {
    addSuffix: true,
    locale: ruLocale,
  });
  return (
    <span className="block truncate text-[10px] text-ink-faint">
      {cell.provenance.providerName} · {ago}
    </span>
  );
}

export const DataCell = memo(function DataCell({
  column,
  cell,
  onOpenDetails,
  onOpenCompany,
  onBooleanChange,
}: {
  column: ColumnDefinition;
  cell: CellValue | undefined;
  onOpenDetails?: () => void;
  onOpenCompany?: () => void;
  onBooleanChange?: (value: boolean) => void;
}) {
  const value = cell?.value;
  const text = asString(value);
  const status = cell?.status;

  if (status === "running") {
    return (
      <div className="flex items-center gap-2 text-ink-muted">
        <Loader2 className="size-3.5 animate-spin" />
        <span>Running…</span>
      </div>
    );
  }

  if (status === "queued") {
    return <span className="text-ink-faint">Queued</span>;
  }

  if (column.type === "company") {
    const hue = hashHue(text);
    return (
      <button type="button" onClick={onOpenCompany} className="flex min-w-0 items-center gap-2 text-left">
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-medium"
          style={{ background: `hsl(${hue} 18% 88%)`, color: `hsl(${hue} 22% 28%)` }}
        >
          {initials(text)}
        </span>
        <span className="truncate">{text}</span>
      </button>
    );
  }

  if (column.type === "person") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-full bg-surface-2 text-[10px]">
          {initials(text)}
        </span>
        <span className="truncate">{text}</span>
      </div>
    );
  }

  if (column.type === "url") {
    return (
      <a
        href={`https://${text}`}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 items-center gap-1.5 text-accent hover:underline"
      >
        <Globe className="size-3.5 shrink-0" />
        <span className="truncate">{text}</span>
      </a>
    );
  }

  if (column.type === "email") {
    return (
      <button type="button" onClick={onOpenDetails} className="flex min-w-0 flex-col text-left">
        <span className="flex items-center gap-1.5">
          <Mail className="size-3.5 text-ink-faint" />
          <span className="truncate">{text || (status && status !== "idle" ? statusLabel[status] : "")}</span>
          <StatusDot status={status} />
        </span>
        {text ? <ProvenanceHint cell={cell!} /> : null}
      </button>
    );
  }

  if (column.type === "phone") {
    return (
      <div className="flex items-center gap-1.5 text-ink-muted">
        <Phone className="size-3.5" />
        <span>{text || "—"}</span>
      </div>
    );
  }

  if (column.type === "number") {
    return <div className="w-full text-right tabular-nums">{text ? formatNumber(Number(value)) : ""}</div>;
  }

  if (column.type === "currency") {
    return (
      <div className="w-full text-right tabular-nums text-ink-muted">
        {text ? formatCurrencyRub(Number(value)) : ""}
      </div>
    );
  }

  if (column.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => {
          event.stopPropagation();
          onBooleanChange?.(event.target.checked);
        }}
        onClick={(event) => event.stopPropagation()}
        className="size-3.5"
      />
    );
  }

  if (column.type === "select") {
    const tone = text === "High" ? "green" : text === "Medium" ? "amber" : "neutral";
    return text ? <Badge tone={tone}>{text}</Badge> : null;
  }

  if (column.type === "score") {
    const score = Number(value) || 0;
    return (
      <div className="flex items-center gap-2">
        <span className="w-6 tabular-nums">{score}</span>
        <span className="h-1 w-12 overflow-hidden rounded-full bg-surface-2">
          <span className="block h-full bg-accent" style={{ width: `${score}%` }} />
        </span>
      </div>
    );
  }

  if (column.type === "ai") {
    return (
      <button type="button" onClick={onOpenDetails} className="flex min-w-0 items-start gap-1.5 text-left">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" />
        <span className="line-clamp-2">{text || (status && status !== "idle" ? statusLabel[status] : "")}</span>
      </button>
    );
  }

  if (column.type === "enrichment" || column.type === "status") {
    return (
      <button type="button" onClick={onOpenDetails} className="flex min-w-0 flex-col text-left">
        <span className="flex items-center gap-1.5">
          <span className="truncate">{text || (status && status !== "idle" ? statusLabel[status] : "—")}</span>
          <StatusDot status={status} />
        </span>
        {cell?.provenance ? <ProvenanceHint cell={cell} /> : null}
      </button>
    );
  }

  return <span className="truncate">{text}</span>;
});
