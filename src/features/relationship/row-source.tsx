import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/forms";
import { ApiError } from "@/lib/api/errors";
import { relationshipAnalysis } from "@/services/relationship-analysis";
import { tablesService } from "@/services/tables";
import type { ColumnDefinition } from "@/types/domain";

export function RowSource({
  tableId, rowId, columns, onClose,
}: { tableId: string; rowId: string; columns?: ColumnDefinition[]; onClose: () => void }) {
  const [loadedColumns, setLoadedColumns] = useState<ColumnDefinition[]>([]);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      relationshipAnalysis.row(tableId, rowId, controller.signal),
      columns ?? tablesService.listColumns(tableId, controller.signal),
    ]).then(([result, fields]) => {
      if (controller.signal.aborted) return;
      setData(result.data);
      setLoadedColumns(fields);
    })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof ApiError && reason.code !== "NETWORK_ERROR" ? reason.message : "Не удалось открыть строку CRM."); });
    return () => controller.abort();
  }, [tableId, rowId, columns]);

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }} title="Строка CRM">
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!error && !data && <Skeleton className="h-36" />}
      {data && (
        <dl className="space-y-3">
          {loadedColumns.filter((column) => data[column.id] != null).map((column) => (
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
