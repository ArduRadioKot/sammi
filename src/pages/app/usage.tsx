import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/forms";
import { creditsService, type CreditBalance, type CreditTransaction } from "@/services/credits";
import { formatCredits } from "@/lib/utils";
import { format } from "date-fns";
import { ru as ruLocale } from "date-fns/locale";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

const TYPE_LABELS: Record<string, string> = {
  grant: "Grant",
  reserve: "Reserve",
  charge: "Charge",
  release: "Release",
  refund: "Refund",
  adjustment: "Adjustment",
};

function typeClass(type: string) {
  if (type === "grant" || type === "refund") return "text-success";
  if (type === "adjustment") return "text-warning";
  if (type === "release") return "text-ink-muted";
  return "text-ink";
}

function amountLabel(item: CreditTransaction) {
  const delta = item.available_delta !== 0 ? item.available_delta : item.reserved_delta;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatCredits(delta)}`;
}

export default function UsagePage() {
  const workspaceId = useAuthStore((s) => s.workspace?.id);
  const creditsEpoch = useWorkspaceStore((s) => s.creditsEpoch);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    Promise.all([
      creditsService.getBalance(workspaceId, controller.signal),
      creditsService.listTransactions(workspaceId, { limit: 50, offset: 0 }, controller.signal),
    ])
      .then(([nextBalance, history]) => {
        setBalance(nextBalance);
        setTransactions(history.items);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Не удалось загрузить credits");
      });
    return () => controller.abort();
  }, [workspaceId, creditsEpoch]);

  if (!workspaceId || (!balance && !error)) {
    return (
      <div className="p-5">
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (error || !balance) {
    return (
      <div className="h-full overflow-auto p-5">
        <h1 className="text-[22px] font-medium tracking-[-0.03em]">Credits</h1>
        <p className="mt-4 text-[13px] text-ink-muted">{error ?? "Не удалось загрузить credits"}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-5">
      <h1 className="text-[22px] font-medium tracking-[-0.03em]">Credits</h1>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-[var(--radius-md)] border border-line p-3">
          <div className="text-[11px] text-ink-muted">Available credits</div>
          <div className="mt-1 text-[22px] tracking-[-0.03em]">{formatCredits(balance.available)}</div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-line p-3">
          <div className="text-[11px] text-ink-muted">Reserved credits</div>
          <div className="mt-1 text-[22px] tracking-[-0.03em]">{formatCredits(balance.reserved)}</div>
        </div>
        <div className="rounded-[var(--radius-md)] border border-line p-3">
          <div className="text-[11px] text-ink-muted">Total</div>
          <div className="mt-1 text-[22px] tracking-[-0.03em]">{formatCredits(balance.total)}</div>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="text-[13px] font-medium">Transaction History</h2>
        <div className="mt-2 overflow-hidden rounded-[var(--radius-md)] border border-line">
          <div className="grid grid-cols-[140px_110px_90px_110px_110px_1fr_1.2fr] bg-surface-1 px-3 py-2 text-[11px] text-ink-muted">
            <span>Date</span>
            <span>Type</span>
            <span>Amount</span>
            <span>Available after</span>
            <span>Reserved after</span>
            <span>Reference</span>
            <span>Description</span>
          </div>
          {transactions.length === 0 ? (
            <div className="border-t border-line px-3 py-6 text-[13px] text-ink-muted">Операций пока нет.</div>
          ) : (
            transactions.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[140px_110px_90px_110px_110px_1fr_1.2fr] border-t border-line px-3 py-2 text-[13px]"
              >
                <span className="text-ink-muted">
                  {format(new Date(item.created_at), "d MMM yyyy, HH:mm", { locale: ruLocale })}
                </span>
                <span className={typeClass(item.type)}>{TYPE_LABELS[item.type] ?? item.type}</span>
                <span>{amountLabel(item)}</span>
                <span>{formatCredits(item.available_after)}</span>
                <span>{formatCredits(item.reserved_after)}</span>
                <span className="truncate text-ink-muted">
                  {item.reference_type ? `${item.reference_type}${item.reference_id ? ` · ${item.reference_id}` : ""}` : "—"}
                </span>
                <span className="truncate">{item.description ?? "—"}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
