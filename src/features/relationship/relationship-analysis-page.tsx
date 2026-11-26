import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Sheet } from "@/components/ui/dialog";
import { Badge, Skeleton } from "@/components/ui/forms";
import { ApiError } from "@/lib/api/errors";
import { relationshipAnalysis, type AnalysisDocument, type AnalysisPublications, type AnalysisRun, type AnalysisSetup, type ColumnMapping, type RefreshHours, type ReviewItem } from "@/services/relationship-analysis";
import { tablesService } from "@/services/tables";
import type { ColumnDefinition } from "@/types/domain";
import { AnalysisAssistant } from "./analysis-assistant";
import { ReportView } from "./analysis-report";
import { parseRefresh, refreshOptions, SetupForm } from "./analysis-setup";
import { PublicationReview } from "./publication-review";

const statuses = {
  queued: "В очереди", running: "Обрабатывается Gemma 4", completed: "Анализ готов",
  partial: "Частичный результат", failed: "Анализ прерван",
};

const isActive = (run: AnalysisRun | null) => run?.status === "queued" || run?.status === "running";
const message = (reason: unknown) => reason instanceof ApiError && reason.code !== "NETWORK_ERROR"
  ? reason.message
  : "Не удалось связаться с API. Повторите запрос.";

export default function RelationshipAnalysisPage() {
  const { id = "" } = useParams();
  return <AnalysisPage key={id} tableId={id} />;
}

function AnalysisPage({ tableId }: { tableId: string }) {
  const [setup, setSetup] = useState<AnalysisSetup | null>(null);
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [configure, setConfigure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selected, setSelected] = useState<{ runId: string; id: string } | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [reviewItem, setReviewItem] = useState<{ runId: string; item: ReviewItem } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [publication, setPublication] = useState<{ runId: string; message: string } | null>(null);
  const [pollError, setPollError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const active = isActive(run);
  const runId = run?.id;
  const nextRefreshAt = run?.next_refresh_at;
  const report = run?.report;
  const running = run?.status === "running";
  const inputStatus = running && (
    run.progress < 25 && report?.recordings.some((item) => item.state === "pending" || item.retryable)
      ? "Расшифровываются записи"
      : run.progress < 40 && report?.web_search?.state === "pending"
        ? "Ищутся публикации по ФИО и компании"
        : run.progress < 55 && (report?.publications.some((item) => item.state === "pending" || item.retryable)
        || report?.feeds.some((item) => item.state === "pending" || item.retryable))
        ? "Проверяются публичные источники"
        : null
  );
  const contactId = selected?.runId === runId ? selected?.id ?? "" : "";

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([relationshipAnalysis.setup(tableId, controller.signal), tablesService.listColumns(tableId, controller.signal)])
      .then(([data, fields]) => {
        if (controller.signal.aborted) return;
        setSetup(data);
        setColumns(fields);
        setRun(data.run);
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setLoadError(message(error)); });
    return () => controller.abort();
  }, [tableId, attempt]);

  useEffect(() => {
    if (!active && !nextRefreshAt) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const data = await relationshipAnalysis.status(tableId, controller.signal);
        if (controller.signal.aborted) return;
        setPollError("");
        setRun(data);
        if (!isActive(data) && !data?.next_refresh_at) return;
        timer = setTimeout(() => void check(), isActive(data) ? 2200 : 15000);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setPollError(message(reason));
        timer = setTimeout(() => void check(), active ? 2200 : 15000);
      }
    };
    timer = setTimeout(() => void check(), active ? 1300 : 15000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [tableId, active, runId, nextRefreshAt]);

  const start = async (mapping: ColumnMapping, documents: AnalysisDocument[], publications: AnalysisPublications) => {
    setSaving(true);
    setActionError("");
    try {
      const data = await relationshipAnalysis.start(tableId, mapping, documents, publications);
      setSetup((value) => value && { ...value, columns: mapping });
      setRun(data);
      setConfigure(false);
    } catch (reason) {
      setActionError(message(reason));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setActionError("");
    try {
      await relationshipAnalysis.remove(tableId);
      setRun(null);
      setConfirmDelete(false);
    } catch (reason) {
      setActionError(message(reason));
      setConfirmDelete(false);
    } finally {
      setSaving(false);
    }
  };

  const retry = async () => {
    setSaving(true);
    setActionError("");
    try {
      setRun(await relationshipAnalysis.retry(tableId));
      setConfigure(false);
    } catch (reason) {
      setActionError(message(reason));
    } finally {
      setSaving(false);
    }
  };

  const changeRefresh = async (hours: RefreshHours) => {
    setSaving(true);
    setActionError("");
    try {
      setRun(await relationshipAnalysis.updateRefresh(tableId, hours));
    } catch (reason) {
      setActionError(message(reason));
    } finally {
      setSaving(false);
    }
  };

  const approveRelationship = async (proposalId: string) => {
    if (!runId) return;
    setSaving(true);
    setActionError("");
    try {
      setRun(await relationshipAnalysis.approveRelationship(tableId, runId, proposalId));
    } catch (reason) {
      setActionError(message(reason));
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!runId) return;
    setSaving(true);
    setActionError("");
    try {
      const result = await relationshipAnalysis.publish(tableId, runId);
      setRun((value) => value?.id === runId ? { ...value, datasets: result.datasets } : value);
      setPublication({
        runId,
        message: `Столбцов в таблице · ${result.columns.length}. Строк обновлено · ${result.updated_rows}.`,
      });
    } catch (reason) {
      setActionError(message(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-[1260px] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <Link className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink" to={`/app/tables/${tableId}`}>
          <ArrowLeft className="size-4" /> К таблице
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-1 text-sm text-ink-muted">{report?.company ?? setup?.company_hint}</div>
            <h1 className="text-2xl font-medium tracking-tight">Анализ отношений</h1>
          </div>
          {setup && <Badge tone="violet">Локальная Gemma 4 · Ollama</Badge>}
        </header>
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
            {loadError}
            <Button variant="secondary" size="sm" onClick={() => { setLoadError(""); setAttempt(attempt + 1); }}>Повторить</Button>
          </div>
        )}
        {!setup && !loadError && <Skeleton className="h-44" />}
        {setup && (
          <>
            {!setup.enabled && <p role="status" className="text-sm text-ink-muted">Анализ отключён в настройках API.</p>}
            {run && (
              <section className="space-y-2 rounded-lg border border-line bg-surface-0 p-4" aria-label="Состояние анализа">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div role="status" className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {inputStatus || statuses[run.status]}
                    {active && <span className="text-xs tabular-nums text-ink-muted">{run.progress}%</span>}
                    {run.stale && <Badge tone="amber">Таблица изменилась</Badge>}
                  </div>
                  {setup.can_write && (
                    <div className="flex flex-wrap gap-2">
                      {!active && !run.stale && report && (
                        <Button size="sm" variant="accent" onClick={() => void publish()} disabled={saving}>Сохранить столбцы в таблицу</Button>
                      )}
                      {run.status === "partial" && setup.enabled && !run.stale && (
                        <Button size="sm" variant="secondary" onClick={() => void retry()} disabled={saving}>
                          Повторить обработку
                        </Button>
                      )}
                      {!active && setup.enabled && (
                        <Button size="sm" variant="secondary" onClick={() => setConfigure(!configure)} disabled={saving}>
                          <RotateCcw /> {configure ? "Свернуть настройки" : "Запустить заново"}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={saving}>
                        {active ? "Отменить" : "Удалить отчёт"}
                      </Button>
                    </div>
                  )}
                </div>
                {active && <progress aria-label="Прогресс анализа" max={100} value={run.progress} className="block h-2 w-full accent-accent" />}
                {pollError && active && <p role="status" className="text-xs text-ink-muted">{pollError} Проверка состояния продолжится.</p>}
                {run.error && !active && <p className="text-sm text-ink-muted">Обработка части материалов не завершилась. Доступны базовые метрики и обработанные источники.</p>}
                {publication?.runId === run.id && <p role="status" className="text-xs text-success">{publication.message}</p>}
                {!!run.datasets.length && (
                  <nav aria-label="Таблицы анализа" className="flex flex-wrap items-center gap-2 pt-1">
                    {run.datasets.map((dataset) => (
                      <Button key={dataset.entity} size="sm" variant="secondary" asChild>
                        <Link to={`/app/tables/${dataset.table_id}`}>{dataset.name}</Link>
                      </Button>
                    ))}
                  </nav>
                )}
                {(!!report?.feeds.length || report?.web_search) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    {setup.can_write && (
                      <label className="flex items-center gap-2">
                        {report?.web_search ? "Обновлять поиск" : "Проверять ленты"}
                        <select className="rounded-md border border-line bg-surface-0 px-2 py-1 text-ink"
                          value={run.refresh_hours ?? ""} disabled={saving || active}
                          onChange={(event) => void changeRefresh(parseRefresh(event.target.value))}>
                          {refreshOptions.map((option) => (
                            <option key={option.value} value={option.value} disabled={!!option.value && (run.stale || !setup.enabled)}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {run.next_refresh_at && <time dateTime={run.next_refresh_at}>
                      Следующее обновление · {new Date(run.next_refresh_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
                    </time>}
                    {run.refresh_hours && run.stale && <span>Обновления приостановлены до нового анализа таблицы.</span>}
                  </div>
                )}
              </section>
            )}
            {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}
            {setup.enabled && setup.can_write && !active && (!run || configure) && (
              <SetupForm columns={columns} initial={setup.columns} saving={saving} replacing={!!run}
                webSearchConfigured={setup.web_search_configured} onStart={start} />
            )}
            {!run && !setup.can_write && <p className="text-sm text-ink-muted">Для этой таблицы ещё нет отчёта.</p>}
            {run && report && (
              <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]" key={run.id}>
                <ReportView run={run} report={report} contactId={contactId} onSource={setSourceId}
                  onContact={(id) => setSelected({ runId: run.id, id })}
                  onReview={(item) => setReviewItem({ runId: run.id, item })}
                  canApprove={setup.can_write && setup.enabled && !active && !run.stale && !saving}
                  onApproveRelationship={(proposalId) => void approveRelationship(proposalId)} />
                <AnalysisAssistant tableId={tableId} contacts={report.contacts} contactId={contactId}
                  onSource={setSourceId} disabled={run.stale || !setup.enabled} />
              </div>
            )}
          </>
        )}
      </div>
      {sourceId && <RowSource key={sourceId} tableId={tableId} rowId={sourceId} columns={columns} onClose={() => setSourceId("")} />}
      {run && report && reviewItem?.runId === run.id && reviewItem.item.source_id && (
        <PublicationReview
          key={reviewItem.item.source_id} tableId={tableId} runId={run.id} sourceId={reviewItem.item.source_id}
          item={reviewItem.item} contacts={report.contacts} canDecide={!!setup?.can_write && !!setup.enabled && !active && !run.stale}
          onClose={() => setReviewItem(null)}
          onSaved={(updated) => { setRun(updated); setReviewItem(null); }}
        />
      )}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title={active ? "Отменить анализ?" : "Удалить отчёт?"}>
          <p className="text-sm text-ink-muted">Отчёт, приложенные материалы и сформированные таблицы анализа будут удалены.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Назад</Button>
            <Button variant="danger" disabled={saving} onClick={() => void remove()}>{active ? "Отменить анализ" : "Удалить"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowSource({
  tableId, rowId, columns, onClose,
}: { tableId: string; rowId: string; columns: ColumnDefinition[]; onClose: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void relationshipAnalysis.row(tableId, rowId, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setData(result.data); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(message(reason)); });
    return () => controller.abort();
  }, [tableId, rowId]);

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }} title="Строка CRM">
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!error && !data && <Skeleton className="h-36" />}
      {data && (
        <dl className="space-y-3">
          {columns.filter((column) => data[column.id] != null).map((column) => (
            <div key={column.id} className="border-b border-line pb-2">
              <dt className="text-xs text-ink-muted">{column.name}</dt>
              <dd className="mt-1 whitespace-pre-wrap wrap-break-word text-sm">
                {typeof data[column.id] === "object" ? JSON.stringify(data[column.id]) : String(data[column.id])}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Sheet>
  );
}
