import { useId } from "react";
import type { AnalysisRun } from "@/services/relationship-analysis";

const statuses = {
  queued: "В очереди",
  running: "Обрабатывается Gemma 4",
  completed: "Готов",
  partial: "Обработка завершена с частичным результатом",
  failed: "Обработка прервана",
};

function stageLabel(run: AnalysisRun) {
  if (run.status !== "running") return statuses[run.status];
  const { progress, report } = run;
  if (progress < 25 && report?.recordings.some((item) => item.state === "pending" || item.retryable)) {
    return "Расшифровываются записи";
  }
  if (progress < 40 && report?.web_search?.state === "pending") {
    return "Ищутся публикации по ФИО и компании";
  }
  if (progress < 55 && (report?.publications.some((item) => item.state === "pending" || item.retryable)
    || report?.feeds.some((item) => item.state === "pending" || item.retryable))) {
    return "Проверяются публичные источники";
  }
  return statuses.running;
}

export function AnalysisProgress({ run, loading = false, pollError }: {
  run: AnalysisRun | null;
  loading?: boolean;
  pollError?: string;
}) {
  const labelId = useId();
  const statusId = useId();
  const progress = loading ? undefined : (run?.progress ?? 0);
  const status = loading ? "Загружается состояние" : run ? stageLabel(run) : "Ещё не запущен";

  return (
    <section className="space-y-2 rounded-lg border border-line bg-surface-0 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={labelId} className="text-sm font-medium">Готовность расширенного анализа</h2>
        {progress !== undefined && <span aria-hidden="true" className="text-sm font-medium text-accent tabular-nums">{progress}%</span>}
      </div>
      <progress aria-labelledby={labelId} aria-describedby={statusId} max={100} value={progress}
        className="block h-2 w-full accent-accent" />
      <p id={statusId} role="status" className="text-xs text-ink-muted">{status}</p>
      {pollError && <p role="status" className="text-xs text-ink-muted">{pollError} Проверка состояния продолжится.</p>}
    </section>
  );
}
