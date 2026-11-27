import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Building2, MessageSquareText, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/forms";
import { AnalysisAssistant } from "@/features/relationship/analysis-assistant";
import { AnalysisProgress } from "@/features/relationship/analysis-progress";
import { ReportView } from "@/features/relationship/analysis-report";
import { RowSource } from "@/features/relationship/row-source";
import { selectClass } from "@/features/relationship/analysis-setup";
import { ENABLE_DEMO_DATA } from "@/lib/constants/config";
import { stakeholderRepository, type StakeholderAccount } from "@/features/stakeholders/repository";
import { relationshipAnalysis, type AnalysisMapSummary, type AnalysisSetup } from "@/services/relationship-analysis";
import { useAuthStore } from "@/stores/auth-store";

export default function CompaniesPage() {
  const workspaceId = useAuthStore((state) => state.workspace?.id);
  return <CompanyDirectory key={workspaceId} workspaceId={workspaceId} />;
}

function CompanyDirectory({ workspaceId }: { workspaceId?: string }) {
  const [params, setParams] = useSearchParams();
  const [maps, setMaps] = useState<AnalysisMapSummary[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [demos, setDemos] = useState<StakeholderAccount[]>([]);
  const tableId = params.get("analysis") || maps?.[0]?.table_id || "";

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    void relationshipAnalysis.maps(workspaceId, controller.signal).then(setMaps).catch(() => {
      if (!controller.signal.aborted) setError("Не удалось загрузить список клиентов.");
    });
    return () => controller.abort();
  }, [workspaceId, attempt]);

  useEffect(() => {
    if (ENABLE_DEMO_DATA) void stakeholderRepository.listAccounts().then(setDemos);
  }, []);

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-y-contain">
      <div className="mx-auto max-w-[88rem] space-y-3 px-4 pt-4 pb-8 sm:space-y-5 sm:px-8 sm:pt-7">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Компании</h1>
          <Button asChild size="sm" variant="ghost"><Link to="/app/tables">К таблицам <ArrowUpRight /></Link></Button>
        </header>
        {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
          {error}
          <Button size="sm" variant="secondary" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Повторить</Button>
        </div>}
        {!maps && !error && !tableId && <Skeleton className="h-40" />}
        {!!maps?.length && (
          <label className="grid max-w-lg min-w-0 gap-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-3">
            <span className="text-sm text-ink-muted">Клиент</span>
            <select className={`${selectClass} min-w-0`} value={tableId} onChange={(event) => setParams({ analysis: event.target.value })}>
              {!maps.some((item) => item.table_id === tableId) && <option value={tableId}>Выбранная таблица</option>}
              {maps.map((item) => <option key={item.table_id} value={item.table_id}>
                {item.company}{item.table_name !== item.company ? ` · ${item.table_name}` : ""}
              </option>)}
            </select>
          </label>
        )}
        {tableId ? (
          <ClientMap
            key={tableId}
            tableId={tableId}
            hasClientPicker={Boolean(maps?.some((map) => map.table_id === tableId))}
            contactId={params.get("contact") ?? ""}
            rowId={params.get("row") ?? ""}
            onContact={(contact) => setParams({ analysis: tableId, contact }, { replace: true })}
          />
        ) : maps?.length === 0 && (
          <section className="rounded-xl bg-surface-0 p-6 sm:p-10">
            <Network className="mb-4 size-6 text-accent" />
            <h2 className="text-lg font-medium">Пока нет карт клиентов</h2>
            <p className="mt-2 max-w-lg text-sm text-ink-muted">Откройте таблицу с контактами, нажмите «Анализ» и укажите, из каких столбцов взять данные.</p>
          </section>
        )}
        {!!demos.length && <section className="space-y-2">
          <h2 className="text-sm font-medium">Демонстрационные клиенты</h2>
          <ul className="divide-y divide-line rounded-lg bg-surface-0 px-4">
            {demos.map((account) => <li key={account.id}>
              <Link className="block py-3 text-sm hover:text-accent" to={`/app/companies/${account.id}/stakeholders`}>{account.name}</Link>
            </li>)}
          </ul>
        </section>}
      </div>
    </div>
  );
}

function ClientMap({ tableId, hasClientPicker, contactId, rowId, onContact }: {
  tableId: string; hasClientPicker: boolean; contactId: string; rowId: string; onContact: (id: string) => void;
}) {
  const [setup, setSetup] = useState<AnalysisSetup | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [sourceId, setSourceId] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [rowMatch, setRowMatch] = useState<{ rowId: string; contactId: string } | null>(null);
  const run = setup?.run;
  const report = run?.report;
  const running = run?.status === "queued" || run?.status === "running";
  const canResolveRow = Boolean(report && rowId);
  const resolvingContact = canResolveRow && !contactId && rowMatch?.rowId !== rowId;
  const selected = contactId || (rowMatch?.rowId === rowId ? rowMatch.contactId : "");
  const reportPath = `/app/tables/${tableId}/relationship-analysis`;
  const extendedPath = `${reportPath}?v=extended${selected ? `&contact=${encodeURIComponent(selected)}` : ""}`;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let pollInterval: number | undefined;
    const load = async () => {
      try {
        const value = await relationshipAnalysis.setup(tableId, controller.signal);
        if (controller.signal.aborted) return;
        setSetup(value);
        setError("");
        const active = value.run?.status === "queued" || value.run?.status === "running";
        pollInterval = active ? 2500 : value.run?.next_refresh_at ? 15000 : undefined;
      } catch {
        if (controller.signal.aborted) return;
        setError("Не удалось загрузить анализ клиента.");
      }
      if (pollInterval !== undefined) timer = setTimeout(load, pollInterval);
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [tableId, attempt]);

  useEffect(() => {
    if (!canResolveRow) return;
    const controller = new AbortController();
    const unavailable = () => { if (!controller.signal.aborted) setRowMatch({ rowId, contactId: "" }); };
    void relationshipAnalysis.contactCard(tableId, rowId, controller.signal).then((card) => {
      if (!controller.signal.aborted) setRowMatch({ rowId, contactId: card?.contact.id ?? "" });
    }).catch(unavailable);
    return () => controller.abort();
  }, [tableId, rowId, canResolveRow, run?.id, run?.status]);

  return (
    <section className="space-y-3" aria-label="Карта клиента">
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className={`min-w-0 ${hasClientPicker && !running && !run?.stale ? "sr-only sm:not-sr-only" : ""}`}>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Building2 className="size-5 shrink-0 text-accent" />{report?.company ?? setup?.company_hint ?? "Карта клиента"}</h2>
          {run?.stale && <Badge tone="amber" className="mt-1">Таблица изменилась после анализа</Badge>}
        </div>
        {setup && <div className="flex flex-wrap gap-2">
          {report?.contacts.length ? <Button size="sm" variant="secondary" aria-label="Спросить по клиенту" onClick={() => setAssistantOpen(true)}>
            <MessageSquareText /> Спросить<span className="hidden sm:contents"> по клиенту</span>
          </Button> : null}
          <Button asChild size="sm" variant={report ? "secondary" : "accent"}>
            <Link to={report ? extendedPath : reportPath}>{report ? "Расширенный анализ" : running ? "Ход анализа" : run ? "Настроить анализ" : "Подготовить анализ"} <ArrowUpRight /></Link>
          </Button>
        </div>}
      </div>
      {((!setup && !error) || setup?.enabled || run) && (
        <AnalysisProgress run={run ?? null} loading={!setup} />
      )}
      {error && <div role="alert" className="flex items-center gap-3 text-sm text-danger">
        {error}<Button size="sm" variant="secondary" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Повторить</Button>
      </div>}
      {!setup && !error && <Skeleton className="h-72" />}
      {setup && !report && !running && <p className="rounded-lg bg-surface-0 p-4 text-sm text-ink-muted">Карта появится после обработки таблицы контактов.</p>}
      {rowId && ((rowMatch?.rowId === rowId && !rowMatch.contactId) || (setup && !report && !running)) && (
        <p className="text-sm text-ink-muted">В отчёте нет контакта для этой точки. <button type="button" className="text-accent underline" onClick={() => setSourceId(rowId)}>Открыть исходную строку</button></p>
      )}
      {resolvingContact && <Skeleton className="h-72" />}
      {run && report && !resolvingContact && <ReportView mode="overview" run={run} report={report}
        contactId={selected} onContact={onContact} onSource={setSourceId} />}
      {sourceId && <RowSource key={sourceId} tableId={tableId} rowId={sourceId} onClose={() => setSourceId("")} />}
      {run && report && !!report.contacts.length && <AnalysisAssistant key={run.id}
        tableId={tableId} contacts={report.contacts} contactId={selected} onSource={setSourceId}
        disabled={run.stale || !setup?.enabled} open={assistantOpen} onOpenChange={setAssistantOpen} />}
    </section>
  );
}
