import { useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { tablesService } from "@/services/tables";
import type { TableWithRows } from "@/types/domain";
import { ExportDialog } from "./dialogs";

export function AnalysisDatasetTable({ table }: { table: TableWithRows }) {
  const [rows, setRows] = useState(table.rows);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function loadMore() {
    setLoading(true);
    setFailed(false);
    try {
      const result = await tablesService.listRows(table.id, table.columns, 200, rows.length);
      setRows((current) => [...current, ...result.rows]);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-surface-0">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <Link to={`/app/tables/${table.relationshipSourceId}/relationship-analysis`}
            className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
            <ArrowLeft className="size-3.5" /> Анализ отношений
          </Link>
          <h1 className="mt-1 break-words text-lg font-medium">{table.name}</h1>
          <p className="text-xs text-ink-muted">{table.rowCount} строк · Обновляется после анализа</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setExporting(true)}>
          <Download /> Экспорт CSV
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto" role="region" aria-label={table.name} tabIndex={0}>
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-1 text-xs">
            <tr>
              {table.columns.map((column) => (
                <th key={column.id} scope="col" className="whitespace-nowrap border-b border-r border-line px-3 py-2 font-medium">
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-surface-1">
                {table.columns.map((column) => {
                  const value = row.cells[column.id]?.value;
                  const text = typeof value === "boolean" ? value ? "Да" : "Нет" : String(value ?? "");
                  return (
                    <td key={column.id} className="min-w-32 max-w-96 wrap-break-word whitespace-pre-wrap border-b border-r border-line px-3 py-2">
                      {column.type === "url" && /^https?:\/\//i.test(text)
                        ? <a href={text} target="_blank" rel="noreferrer" className="text-accent underline">{text}</a>
                        : text || <span className="text-ink-faint">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-4 text-sm text-ink-muted">Пока нет подтверждённых записей.</p>}
        {rows.length < table.rowCount && (
          <div className="flex items-center gap-2 p-4">
            <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={loading}>Показать ещё</Button>
            {failed && <p role="status" className="text-xs text-danger">Не удалось загрузить строки.</p>}
          </div>
        )}
      </div>
      <ExportDialog tableId={table.id} open={exporting} onOpenChange={setExporting} />
    </div>
  );
}
