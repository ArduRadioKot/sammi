import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/forms";
import { ApiError } from "@/lib/api/errors";
import { formatNumber } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import {
  csvService,
  type CsvColumnType,
  type CsvMappingAction,
  type CsvMappingColumn,
  type CsvPreview,
  type CsvImportResult,
  type CsvValidationErrorItem,
} from "@/services/csv";
import type { ColumnDefinition } from "@/types/domain";

const TYPE_OPTIONS: { value: CsvColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
  { value: "phone", label: "Phone" },
];

type MappingState = {
  action: CsvMappingAction;
  name: string;
  type: CsvColumnType;
  columnId: string;
};

type WizardStep = "upload" | "preview" | "map" | "review" | "result";

function rowsPhrase(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${formatNumber(count)} строку`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${formatNumber(count)} строки`;
  return `${formatNumber(count)} строк`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function delimiterLabel(value: string): string {
  if (value === "semicolon" || value === ";") return "Точка с запятой";
  if (value === "tab" || value === "\t") return "Tab";
  return "Запятая";
}

function asType(value: string): CsvColumnType {
  return TYPE_OPTIONS.some((item) => item.value === value) ? (value as CsvColumnType) : "text";
}

function validationItems(error: ApiError): CsvValidationErrorItem[] {
  const details = error.details as { items?: CsvValidationErrorItem[] } | null;
  return Array.isArray(details?.items) ? details.items : [];
}

export function ImportWizard({
  open,
  onOpenChange,
  mode = "workspace",
  tableId,
  existingColumns = [],
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "workspace" | "table";
  tableId?: string;
  existingColumns?: ColumnDefinition[];
  onImported?: (tableId: string) => void;
}) {
  const navigate = useNavigate();
  const workspaceId = useAuthStore((state) => state.workspace?.id);
  const [step, setStep] = useState<WizardStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [delimiter, setDelimiter] = useState("comma");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<MappingState[]>([]);
  const [tableName, setTableName] = useState("");
  const [objectType, setObjectType] = useState<"company" | "person" | "custom">("custom");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [errors, setErrors] = useState<CsvValidationErrorItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analysisChoice, setAnalysisChoice] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const columnsForMap = preview?.existing_columns?.map((column) => ({
    id: column.id,
    name: column.name,
    type: column.type,
  })) ?? existingColumns.map((column) => ({ id: column.id, name: column.name, type: column.type }));

  const summary = useMemo(() => {
    const created = mapping.filter((item) => item.action === "create").length;
    const mapped = mapping.filter((item) => item.action === "existing").length;
    const skipped = mapping.filter((item) => item.action === "skip").length;
    return { created, mapped, skipped };
  }, [mapping]);
  const names = new Set(mapping.filter((item) => item.action === "create")
    .map((item) => item.name.toLowerCase().replace(/[^a-zа-я0-9]/g, "")));
  const hasName = ["fullname", "contactname", "фио", "контакт"].some((alias) => names.has(alias));
  const hasCompany = ["company", "companyname", "account", "компания", "клиент"].some((alias) => names.has(alias));
  const analyzeAfterImport = analysisChoice ?? (objectType === "person" || (hasName && hasCompany));

  const loadPreview = async (nextFile: File, nextDelimiter: string) => {
    if (!workspaceId && mode === "workspace") {
      toast.error("Workspace не загружен");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setErrors([]);
    try {
      const payload =
        mode === "table" && tableId
          ? await csvService.previewTable(tableId, nextFile, nextDelimiter)
          : await csvService.previewWorkspace(workspaceId!, nextFile, nextDelimiter);
      setPreview(payload);
      setDelimiter(payload.delimiter === ";" ? "semicolon" : payload.delimiter === "\t" ? "tab" : payload.delimiter);
      setTableName((current) => current || payload.suggested_table_name);
      setMapping(
        payload.headers.map((header) => ({
          action: "create",
          name: header.name,
          type: asType(header.suggested_type),
          columnId: "",
        })),
      );
      setStep("preview");
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Не удалось прочитать CSV";
      setErrorMessage(message);
      toast.error("Import failed");
    } finally {
      setLoading(false);
    }
  };

  const onFile = (next: File | undefined) => {
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".csv")) {
      toast.error("Нужен файл .csv");
      return;
    }
    setFile(next);
    void loadPreview(next, delimiter);
  };

  const runImport = async () => {
    if (!file || !preview || importing) return;
    if (mode === "workspace" && !workspaceId) return;
    if (mode === "table" && !tableId) return;
    const columns: CsvMappingColumn[] = mapping.map((item, index) => {
      if (item.action === "skip") return { csv_index: index, action: "skip" };
      if (item.action === "existing") return { csv_index: index, action: "existing", column_id: item.columnId };
      return { csv_index: index, action: "create", name: item.name.trim() || preview.headers[index].name, type: item.type };
    });
    setImporting(true);
    setErrorMessage(null);
    setErrors([]);
    try {
      const options = {
        file_signature: preview.file_signature,
        delimiter,
        table_name: tableName.trim() || preview.suggested_table_name,
        object_type: objectType,
        analyze_relationships: mode === "workspace" && analyzeAfterImport,
      };
      const imported =
        mode === "table" && tableId
          ? await csvService.importTable(tableId, file, columns, options, delimiter)
          : await csvService.importWorkspace(workspaceId!, file, columns, options, delimiter);
      setResult(imported);
      setStep("result");
      toast.success("Импорт завершён");
    } catch (error) {
      toast.error("Import failed");
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
        setErrors(validationItems(error));
      } else {
        setErrorMessage("Не удалось импортировать CSV");
      }
    } finally {
      setImporting(false);
    }
  };

  const stepIndex = ["upload", "preview", "map", "review", "result"].indexOf(step) + 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setStep("upload");
          setFile(null);
          setDragOver(false);
          setDelimiter("comma");
          setPreview(null);
          setMapping([]);
          setTableName("");
          setObjectType("custom");
          setLoading(false);
          setImporting(false);
          setResult(null);
          setErrors([]);
          setErrorMessage(null);
          setAnalysisChoice(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent title="Импорт CSV" className="w-[min(720px,calc(100%-32px))]">
        <div className="text-[12px] text-ink-muted">Шаг {Math.min(stepIndex, 5)} из 5</div>
        {errorMessage && step !== "result" && (
          <div className="mt-3 rounded-[var(--radius-sm)] border border-line bg-surface-1 px-3 py-2 text-[12px] text-danger">
            {errorMessage}
          </div>
        )}

        {step === "upload" && (
          <div className="mt-3 space-y-3">
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                onFile(event.dataTransfer.files[0]);
              }}
              className={`flex min-h-[140px] flex-col items-center justify-center rounded-[var(--radius-md)] border border-dashed px-4 text-center ${
                dragOver ? "border-ink bg-surface-1" : "border-line"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  onFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <div className="text-[14px] font-medium">Перетащите CSV или выберите файл</div>
              <div className="mt-1 text-[12px] text-ink-muted">Только .csv · до 10 МБ · до 10 000 строк</div>
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
              >
                {loading ? "Читаем файл…" : "Choose file"}
              </Button>
            </div>
            {file && (
              <div className="text-[12px] text-ink-muted">
                {file.name} · {formatBytes(file.size)}
              </div>
            )}
          </div>
        )}

        {step === "preview" && preview && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-3 text-[13px]">
              <span>{preview.encoding.toUpperCase()}</span>
              <span>{delimiterLabel(delimiter)}</span>
              <span>{formatNumber(preview.row_count)} rows</span>
              <span>{preview.headers.length} columns</span>
            </div>
            {file && (
              <div className="text-[12px] text-ink-muted">
                {file.name} · {formatBytes(file.size)}
              </div>
            )}
            <div>
              <Label htmlFor="csv-delimiter">Разделитель</Label>
              <select
                id="csv-delimiter"
                className="mt-1 h-8 w-full rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2.5 text-[13px]"
                value={delimiter}
                onChange={(event) => {
                  const next = event.target.value;
                  setDelimiter(next);
                  if (file) void loadPreview(file, next);
                }}
              >
                <option value="comma">Запятая</option>
                <option value="semicolon">Точка с запятой</option>
                <option value="tab">Tab</option>
              </select>
            </div>
            {preview.warnings.length > 0 && (
              <ul className="list-disc pl-4 text-[12px] text-ink-muted">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <div className="max-h-56 overflow-auto rounded-[var(--radius-sm)] border border-line">
              <table className="min-w-full text-left text-[12px]">
                <thead className="bg-surface-1">
                  <tr>
                    {preview.headers.map((header) => (
                      <th key={header.index} className="px-2 py-1.5 font-medium">
                        {header.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample_rows.map((row, index) => (
                    <tr key={index} className="border-t border-line">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="max-w-[160px] truncate px-2 py-1">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === "map" && preview && (
          <div className="mt-3 max-h-[360px] space-y-3 overflow-auto">
            {preview.headers.map((header, index) => {
              const item = mapping[index];
              const samples = preview.sample_rows.map((row) => row[index]).filter(Boolean).slice(0, 3);
              const duplicate = item?.action === "create" && columnsForMap.some((column) => column.name === item.name);
              return (
                <div key={header.index} className="rounded-[var(--radius-md)] border border-line p-3">
                  <div className="text-[13px] font-medium">{header.name}</div>
                  <div className="mt-1 text-[12px] text-ink-muted">{samples.join(" · ") || "Нет значений в preview"}</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <select
                      className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2.5 text-[13px]"
                      value={item?.action ?? "create"}
                      onChange={(event) => {
                        const action = event.target.value as CsvMappingAction;
                        setMapping((current) =>
                          current.map((row, rowIndex) => (rowIndex === index ? { ...row, action } : row)),
                        );
                      }}
                    >
                      <option value="create">Создать колонку</option>
                      {mode === "table" && <option value="existing">Существующая</option>}
                      <option value="skip">Пропустить</option>
                    </select>
                    {item?.action === "create" && (
                      <>
                        <Input
                          value={item.name}
                          onChange={(event) =>
                            setMapping((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index ? { ...row, name: event.target.value } : row,
                              ),
                            )
                          }
                        />
                        <select
                          className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2.5 text-[13px]"
                          value={item.type}
                          onChange={(event) =>
                            setMapping((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index ? { ...row, type: event.target.value as CsvColumnType } : row,
                              ),
                            )
                          }
                        >
                          {TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                    {item?.action === "existing" && (
                      <select
                        className="h-8 rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2.5 text-[13px] sm:col-span-2"
                        value={item.columnId}
                        onChange={(event) =>
                          setMapping((current) =>
                            current.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, columnId: event.target.value } : row,
                            ),
                          )
                        }
                      >
                        <option value="">Выберите колонку</option>
                        {columnsForMap.map((column) => (
                          <option key={column.id} value={column.id}>
                            {column.name} ({column.type})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {duplicate && (
                    <div className="mt-2 text-[12px] text-ink-muted">Колонка с таким именем уже есть — будет создана ещё одна.</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === "review" && preview && (
          <div className="mt-3 space-y-2 text-[13px]">
            {mode === "workspace" && (
              <>
                <Label htmlFor="import-table-name">Название таблицы</Label>
                <Input id="import-table-name" value={tableName} onChange={(event) => setTableName(event.target.value)} />
                <Label className="mt-2 block" htmlFor="import-object-type">
                  Тип
                </Label>
                <select
                  id="import-object-type"
                  className="mt-1 h-8 w-full rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2.5 text-[13px]"
                  value={objectType}
                  onChange={(event) => setObjectType(event.target.value as typeof objectType)}
                >
                  <option value="custom">Custom</option>
                  <option value="company">Companies</option>
                  <option value="person">People</option>
                </select>
              </>
            )}
            <div>Table: {mode === "workspace" ? tableName || preview.suggested_table_name : "текущая таблица"}</div>
            <div>Rows: {formatNumber(preview.row_count)}</div>
            <div>Columns: {preview.headers.length}</div>
            <div>New columns: {summary.created}</div>
            <div>Existing mappings: {summary.mapped}</div>
            <div>Skipped: {summary.skipped}</div>
            <div className="text-[12px] text-ink-muted">Импорт добавит новые строки. Дедупликации нет.</div>
            {mode === "workspace" && (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5 accent-accent" checked={analyzeAfterImport}
                  onChange={(event) => setAnalysisChoice(event.target.checked)} />
                <span>Запустить анализ и автоматически искать публикации после импорта
                  <span className="block text-xs text-ink-muted">При подключённом SearXNG в поиск передаются ФИО и компания. Sammi повторяет поиск раз в сутки.</span>
                </span>
              </label>
            )}
            {errors.length > 0 && (
              <div className="max-h-40 overflow-auto rounded-[var(--radius-sm)] border border-line p-2">
                {errors.map((item) => (
                  <div key={`${item.row}-${item.column}`} className="py-1 text-[12px]">
                    Строка {item.row} · {item.column} · `{item.value}` · {item.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "result" && result && (
          <div className="mt-3 space-y-2 text-[13px]">
            <div>
              Импортировано: {formatNumber(result.rows_imported)} строк · {result.column_count} колонок.
            </div>
            {result.analysis_started && <p role="status" className="text-xs text-ink-muted">Анализ поставлен в очередь.</p>}
            {result.analysis_error && <p role="status" className="text-xs text-warning">{result.analysis_error}</p>}
            <Button
              onClick={() => {
                onOpenChange(false);
                onImported?.(result.table_id);
                if (mode === "workspace") {
                  const destination = `/app/tables/${result.table_id}`;
                  navigate(analyzeAfterImport ? `${destination}/relationship-analysis` : destination);
                }
              }}
            >
              {mode === "workspace" && analyzeAfterImport ? "Открыть анализ" : "Открыть таблицу"}
            </Button>
          </div>
        )}

        {step !== "result" && (
          <div className="mt-4 flex justify-end gap-2">
            {step !== "upload" && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (step === "preview") setStep("upload");
                  else if (step === "map") setStep("preview");
                  else setStep("map");
                }}
              >
                Назад
              </Button>
            )}
            {step === "preview" && (
              <Button disabled={!preview || loading} onClick={() => setStep("map")}>
                Далее
              </Button>
            )}
            {step === "map" && (
              <Button
                disabled={mapping.some((item) => item.action === "existing" && !item.columnId)}
                onClick={() => setStep("review")}
              >
                Далее
              </Button>
            )}
            {step === "review" && preview && (
              <Button disabled={importing || !file} onClick={() => void runImport()}>
                {importing ? "Импортируем…" : `Импортировать ${rowsPhrase(preview.row_count)}`}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  tableId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId?: string;
}) {
  const [delimiter, setDelimiter] = useState<"comma" | "semicolon">("comma");
  const [safe, setSafe] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!tableId || downloading) return;
    setDownloading(true);
    try {
      await csvService.exportTable(tableId, { delimiter, bom: true, safeForSpreadsheets: safe });
      onOpenChange(false);
    } catch {
      toast.error("Не удалось экспортировать CSV");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Экспорт">
        <div className="space-y-3">
          <div>
            <Label htmlFor="export-delimiter">CSV delimiter</Label>
            <select
              id="export-delimiter"
              className="mt-1 h-8 w-full rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2.5 text-[13px]"
              value={delimiter}
              onChange={(event) => setDelimiter(event.target.value as "comma" | "semicolon")}
            >
              <option value="comma">Запятая</option>
              <option value="semicolon">Точка с запятой</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={safe} onChange={(event) => setSafe(event.target.checked)} />
            Safe for Excel / spreadsheets
          </label>
          <p className="text-[12px] text-ink-muted">
            UTF-8 с BOM. Safe mode добавляет `'` к значениям, которые Excel может принять за формулу.
          </p>
          <Button disabled={!tableId || downloading} onClick={() => void download()}>
            {downloading ? "Скачиваем…" : "Скачать CSV"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
