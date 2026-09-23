import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge, Input, Label } from "@/components/ui/forms";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api/errors";
import {
  enrichmentService,
  type EnrichmentOperation,
  type EnrichmentProviderStatus,
} from "@/services/enrichment";
import type { ColumnDefinition } from "@/types/domain";

export function EnrichmentDrawer({
  open,
  onOpenChange,
  tableId,
  columns,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  columns: ColumnDefinition[];
  onCreated: (column: {
    id: string;
    table_id: string;
    name: string;
    type: string;
    position: number;
    config: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }) => void;
}) {
  const [providers, setProviders] = useState<EnrichmentProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [operationId, setOperationId] = useState("");
  const [inputColumnId, setInputColumnId] = useState("");
  const [outputField, setOutputField] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    enrichmentService
      .listProviders()
      .then((payload) => {
        if (cancelled) return;
        setProviders(payload.items);
        const first = payload.items[0];
        if (first) {
          setProviderId(first.id);
          const nextOperation = first.operations[0];
          setOperationId(nextOperation?.id ?? "");
          setOutputField(nextOperation?.outputs[0]?.id ?? "");
          setName(nextOperation?.outputs[0]?.label ?? "");
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Не удалось загрузить провайдеров");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const provider = providers.find((item) => item.id === providerId) ?? null;
  const operation: EnrichmentOperation | null =
    provider?.operations.find((item) => item.id === operationId) ?? provider?.operations[0] ?? null;
  const inputColumns = useMemo(
    () => columns.filter((column) => column.type !== "enrichment" && column.type !== "ai"),
    [columns],
  );
  const cost = operation?.credits_per_success ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Добавить enrichment" width={480}>
      {loading ? (
        <p className="text-[13px] text-ink-muted">Загружаем провайдеров…</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {providers.map((item) => {
              const disabled = !item.configured;
              const selected = item.id === providerId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setProviderId(item.id);
                    setOperationId(item.operations[0]?.id ?? "");
                    setOutputField(item.operations[0]?.outputs[0]?.id ?? "");
                  }}
                  className={`flex w-full items-start justify-between gap-3 rounded-[var(--radius-md)] border px-3 py-3 text-left ${
                    selected ? "border-ink bg-surface-1" : "border-line hover:bg-surface-1"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{item.name}</span>
                      {item.region === "RU" && <Badge>RU</Badge>}
                    </div>
                    <div className="mt-1 text-[12px] text-ink-muted">
                      {item.configured ? "Настроен" : "Не настроен"}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-ink-muted">
                    {disabled ? "Нет API key" : `${item.operations[0]?.credits_per_success ?? 0} credit / success`}
                  </div>
                </button>
              );
            })}
            <div className="rounded-[var(--radius-md)] border border-dashed border-line px-3 py-3 text-[12px] text-ink-faint">
              Контур · ЕГРЮЛ · 2ГИС · HH · Скоро. Waterfall — следующий шаг.
            </div>
          </div>

          {provider && (
            <>
              {!provider.configured && (
                <p className="text-[13px] text-ink-muted">
                  DaData не настроен. Задайте `DADATA_API_KEY` на backend — без ключа запуск enrichment будет заблокирован.
                </p>
              )}
              <div>
                <Label htmlFor="enrichment-operation">Операция</Label>
                <select
                  id="enrichment-operation"
                  className="mt-1 h-8 w-full rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2.5 text-[13px]"
                  value={operation?.id ?? ""}
                  onChange={(event) => setOperationId(event.target.value)}
                >
                  {(provider.operations ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="enrichment-input">Input column</Label>
                <select
                  id="enrichment-input"
                  className="mt-1 h-8 w-full rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2.5 text-[13px]"
                  value={inputColumnId}
                  onChange={(event) => setInputColumnId(event.target.value)}
                >
                  <option value="">Выберите колонку ИНН / ОГРН</option>
                  {inputColumns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                      {column.type !== "text" ? ` (${column.type})` : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[12px] text-ink-muted">Рекомендуется Text. ИНН и ОГРН — идентификаторы, не числа.</p>
              </div>
              <div>
                <Label htmlFor="enrichment-output">Output</Label>
                <select
                  id="enrichment-output"
                  className="mt-1 h-8 w-full rounded-[var(--radius-sm)] border border-line bg-surface-0 px-2.5 text-[13px]"
                  value={outputField}
                  onChange={(event) => {
                    setOutputField(event.target.value);
                    const label = operation?.outputs.find((item) => item.id === event.target.value)?.label;
                    if (label) setName(label);
                  }}
                >
                  {(operation?.outputs ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="enrichment-name">Название колонки</Label>
                <Input id="enrichment-name" className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="rounded-[var(--radius-sm)] bg-surface-1 px-3 py-2 text-[13px]">
                {cost} credit / successful result
              </div>
              <Button
                className="w-full"
                disabled={saving || !name || !providerId || !operation || !inputColumnId || !outputField}
                onClick={async () => {
                  if (!providerId || !operation || !inputColumnId || !outputField) return;
                  setSaving(true);
                  try {
                    const column = await enrichmentService.createColumn(tableId, {
                        name,
                        provider_id: providerId,
                        operation: operation.id,
                        input_column_id: inputColumnId,
                        output_field: outputField,
                      },
                    );
                    onCreated(column);
                    onOpenChange(false);
                  } catch (error) {
                    const message = error instanceof ApiError ? error.message : "Не удалось создать колонку";
                    toast.error(message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Сохраняем…" : "Save"}
              </Button>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function WaterfallDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (config: unknown) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Email waterfall" width={480}>
      <p className="text-[13px] text-ink-muted">
        Waterfall enrichment появится на следующем шаге. Сейчас доступен один провайдер — DaData.
      </p>
    </Sheet>
  );
}
