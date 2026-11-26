import {
  ChevronDown,
  Columns3,
  Filter,
  Group,
  Network,
  Plus,
  Redo2,
  Search,
  Share,
  Sparkles,
  Star,
  Undo2,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/forms";
import { DEMO_TABLE_ID, ENABLE_DEMO_DATA } from "@/lib/constants/config";
import { ApiError } from "@/lib/api/errors";
import { tablesService } from "@/services";
import { creditsService } from "@/services/credits";
import { enrichmentService } from "@/services/enrichment";
import { columnCreateConfig, mapApiColumn, STEP3_COLUMN_TYPES, type Step3ColumnType } from "@/services/tables";
import { useAuthStore } from "@/stores/auth-store";
import { useTableEditorStore } from "@/stores/table-editor-store";
import { useUiStore } from "@/stores/ui-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { AddColumnPopover } from "@/features/tables/components/add-column-popover";
import { AnalysisDatasetTable } from "@/features/tables/components/analysis-dataset-table";
import { Spreadsheet } from "@/features/tables/components/spreadsheet";
import { RowDetails, CellDetails } from "@/features/tables/components/detail-panels";
import {
  CrmDialog,
  ExportDialog,
  ImportWizard,
  RunConfirmDialog,
} from "@/features/tables/components/dialogs";
import { EnrichmentDrawer, WaterfallDrawer } from "@/features/enrichments/enrichment-drawers";
import { AgentDrawer, AiColumnDrawer, FormulaDrawer } from "@/features/ai/ai-drawers";
import { applyFilters, applySearch, applySorts } from "@/features/tables/lib/query";
import type { ColumnDefinition, TableRow } from "@/types/domain";
import { Skeleton } from "@/components/ui/forms";

function emptyRow(id: string, columns: ColumnDefinition[], data: Record<string, unknown> = {}): TableRow {
  return {
    id,
    cells: Object.fromEntries(columns.map((column) => [column.id, { value: data[column.id] ?? null, status: "idle" }])),
  };
}

function isStep3Type(type: string): type is Step3ColumnType {
  return (STEP3_COLUMN_TYPES as readonly string[]).includes(type);
}

function identifierText(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  const text = String(value).trim();
  return text || null;
}

export function TableEditor({ tableId }: { tableId: string }) {
  const table = useTableEditorStore((s) => s.table);
  const loading = useTableEditorStore((s) => s.loading);
  const viewId = useTableEditorStore((s) => s.viewId);
  const selectedRowIds = useTableEditorStore((s) => s.selectedRowIds);
  const focusedCell = useTableEditorStore((s) => s.focusedCell);
  const search = useTableEditorStore((s) => s.search);
  const filters = useTableEditorStore((s) => s.filters);
  const sorts = useTableEditorStore((s) => s.sorts);
  const drawer = useTableEditorStore((s) => s.drawer);
  const setTable = useTableEditorStore((s) => s.setTable);
  const setLoading = useTableEditorStore((s) => s.setLoading);
  const setView = useTableEditorStore((s) => s.setView);
  const toggleRow = useTableEditorStore((s) => s.toggleRow);
  const toggleAll = useTableEditorStore((s) => s.toggleAll);
  const setFocusedCell = useTableEditorStore((s) => s.setFocusedCell);
  const setSearch = useTableEditorStore((s) => s.setSearch);
  const setDrawer = useTableEditorStore((s) => s.setDrawer);
  const addColumn = useTableEditorStore((s) => s.addColumn);
  const updateColumn = useTableEditorStore((s) => s.updateColumn);
  const hideColumn = useTableEditorStore((s) => s.hideColumn);
  const removeColumn = useTableEditorStore((s) => s.removeColumn);
  const resizeColumn = useTableEditorStore((s) => s.resizeColumn);
  const setStarred = useTableEditorStore((s) => s.setStarred);
  const undo = useTableEditorStore((s) => s.undo);
  const redo = useTableEditorStore((s) => s.redo);
  const updateCell = useTableEditorStore((s) => s.updateCell);
  const appendRow = useTableEditorStore((s) => s.addRow);
  const removeRows = useTableEditorStore((s) => s.removeRows);
  const clearSelection = useTableEditorStore((s) => s.clearSelection);
  const commandIntent = useUiStore((s) => s.commandIntent);
  const consumeCommand = useUiStore((s) => s.consumeCommand);
  const reset = useTableEditorStore((s) => s.reset);
  const [errorForId, setErrorForId] = useState<{ id: string; kind: "not-found" | "forbidden" } | null>(null);
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const workspaceId = useAuthStore((s) => s.workspace?.id);
  const invalidateCredits = useWorkspaceStore((s) => s.invalidateCredits);
  const isDemo = tableId === DEMO_TABLE_ID && ENABLE_DEMO_DATA;
  const errorKind = errorForId?.id === tableId ? errorForId.kind : null;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await tablesService.getTable(tableId);
        if (!cancelled) setTable(data);
      } catch (error) {
        if (cancelled) return;
        reset();
        setLoading(false);
        if (error instanceof ApiError && error.status === 403) {
          setErrorForId({ id: tableId, kind: "forbidden" });
          return;
        }
        setErrorForId({ id: tableId, kind: "not-found" });
      }
    };

    if (tableId === DEMO_TABLE_ID) {
      if (!ENABLE_DEMO_DATA) {
        reset();
        setLoading(false);
        return () => {
          cancelled = true;
        };
      }
      void import("@/lib/mock/data").then(({ createDemoTable }) => {
        if (!cancelled) setTable(createDemoTable());
      });
    } else {
      setLoading(true);
      void load();
    }

    return () => {
      cancelled = true;
    };
  }, [tableId, setTable, setLoading, reset]);

  useEffect(() => {
    if (!commandIntent) return;
    if (commandIntent.action === "add-enrichment") setDrawer({ type: "enrichment" });
    if (commandIntent.action === "add-ai-column") toast.message("AI Column появится позже");
    if (commandIntent.action === "import") setDrawer({ type: "import" });
    if (commandIntent.action === "search-table") {
      document.getElementById("table-search")?.focus();
    }
    consumeCommand();
  }, [commandIntent, consumeCommand, setDrawer]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (event.key === "Escape") setDrawer(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, setDrawer]);

  const visibleRows = useMemo(() => {
    if (!table) return [];
    return applySorts(applyFilters(applySearch(table.rows, search), filters), sorts);
  }, [table, search, filters, sorts]);

  const selectedVisible = selectedRowIds.filter((id) => visibleRows.some((row) => row.id === id));
  const rowForDrawer = table?.rows.find((row) =>
    drawer?.type === "row" || drawer?.type === "cell" ? row.id === drawer.rowId : false,
  );

  const blocked = !ENABLE_DEMO_DATA && tableId === DEMO_TABLE_ID;
  if (blocked) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-md">
          <h1 className="text-[18px] font-medium">Demo data disabled</h1>
          <p className="mt-2 text-[13px] text-ink-muted">Демо-данные выключены.</p>
          <Link to="/app/tables" className="mt-4 inline-flex h-9 items-center text-[13px] underline">
            К таблицам
          </Link>
        </div>
      </div>
    );
  }

  if (errorKind) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="max-w-md">
          <h1 className="text-[18px] font-medium">
            {errorKind === "forbidden" ? "Нет доступа к таблице" : "Таблица не найдена"}
          </h1>
          <p className="mt-2 text-[13px] text-ink-muted">
            {errorKind === "forbidden"
              ? "Эта таблица принадлежит другому workspace."
              : "Проверьте ссылку или вернитесь к списку таблиц."}
          </p>
          <Link to="/app/tables" className="mt-4 inline-flex h-9 items-center text-[13px] underline">
            К таблицам
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !table) {
    return (
      <div className="p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-[70vh] w-full" />
      </div>
    );
  }

  if (table.relationshipSourceId) return <AnalysisDatasetTable key={table.id} table={table} />;

  const soon = (feature: string) => toast.message(`${feature} появится позже`);

  const handleAddColumn = async (id: string) => {
    if (id === "enrichment") {
      setDrawer({ type: "enrichment" });
      return;
    }
    if (!isStep3Type(id)) {
      soon("Этот тип колонки");
      return;
    }
    try {
      const column = await tablesService.createColumn(tableId, {
        name: id === "text" ? "Text" : id === "boolean" ? "Active" : id.charAt(0).toUpperCase() + id.slice(1),
        type: id,
        config: columnCreateConfig(id),
      });
      addColumn(column);
    } catch {
      toast.error("Не удалось добавить колонку");
    }
  };

  const persistRename = async (columnId: string) => {
    const next = window.prompt("Название колонки");
    if (!next) return;
    const previous = table.columns.find((column) => column.id === columnId)?.name;
    updateColumn(columnId, { name: next });
    try {
      await tablesService.updateColumn(tableId, columnId, { name: next });
    } catch {
      if (previous) updateColumn(columnId, { name: previous });
      toast.error("Не удалось переименовать колонку");
    }
  };

  const persistDeleteColumn = async (columnId: string) => {
    try {
      await tablesService.deleteColumn(tableId, columnId);
      removeColumn(columnId);
    } catch {
      toast.error("Не удалось удалить колонку");
    }
  };

  const persistInsert = async (columnId: string, side: "left" | "right") => {
    try {
      const created = await tablesService.createColumn(tableId, {
        name: "Text",
        type: "text",
        config: {},
      });
      const index = table.columns.findIndex((column) => column.id === columnId);
      const insertAt = side === "left" ? index : index + 1;
      addColumn(created, insertAt);
      const nextIds = table.columns.map((column) => column.id);
      nextIds.splice(insertAt, 0, created.id);
      await tablesService.reorderColumns(tableId, nextIds);
    } catch {
      toast.error("Не удалось вставить колонку");
    }
  };

  const persistDuplicate = async (columnId: string) => {
    const column = table.columns.find((item) => item.id === columnId);
    if (!column || !isStep3Type(column.type)) {
      soon("Этот тип колонки");
      return;
    }
    try {
      const created = await tablesService.createColumn(tableId, {
        name: `${column.name} copy`,
        type: column.type,
        config: columnCreateConfig(column.type),
      });
      const index = table.columns.findIndex((item) => item.id === columnId);
      addColumn(created, index + 1);
    } catch {
      toast.error("Не удалось дублировать колонку");
    }
  };

  const commitCell = async (rowId: string, columnId: string, value: unknown) => {
    const previous = table.rows.find((row) => row.id === rowId)?.cells[columnId]?.value;
    if (Object.is(previous, value) || ((previous == null || previous === "") && value == null)) return;
    updateCell(rowId, columnId, { value, status: "idle" });
    try {
      await tablesService.updateRow(tableId, rowId, { [columnId]: value });
    } catch {
      updateCell(rowId, columnId, { value: previous });
      toast.error("Не удалось сохранить ячейку");
    }
  };

  const handleAddRow = async () => {
    try {
      const created = await tablesService.createRow(tableId, {});
      appendRow(emptyRow(created.id, table.columns, created.data));
    } catch {
      toast.error("Не удалось добавить строку");
    }
  };

  const handleDeleteRows = async (rowIds: string[]) => {
    if (rowIds.length === 0) return;
    try {
      if (rowIds.length === 1) await tablesService.deleteRow(tableId, rowIds[0]);
      else await tablesService.bulkDeleteRows(tableId, rowIds);
      removeRows(rowIds);
      clearSelection();
    } catch {
      toast.error("Не удалось удалить строки");
    }
  };

  const enrichmentColumns = table.columns.filter((column) => column.type === "enrichment");

  const runTargetIds = (columnId: string) => {
    const column = table.columns.find((item) => item.id === columnId);
    const inputId = column?.config?.kind === "enrichment" ? column.config.inputColumnId : "";
    const selected = selectedVisible.length ? selectedVisible : visibleRows.map((row) => row.id);
    const candidates = selected.filter((rowId) => {
      const row = table.rows.find((item) => item.id === rowId);
      return Boolean(identifierText(row?.cells[inputId]?.value));
    });
    const cost = column?.config?.kind === "enrichment" ? column.config.creditsPerSuccess ?? 1 : 1;
    return { selected, candidates, cost };
  };

  const openRun = (columnId: string) => {
    const column = table.columns.find((item) => item.id === columnId);
    if (!column || column.type !== "enrichment") {
      soon("Run / Enrichment");
      return;
    }
    if (workspaceId) {
      creditsService.getBalance(workspaceId).then((balance) => setAvailableCredits(balance.available)).catch(() => setAvailableCredits(null));
    }
    const { selected } = runTargetIds(columnId);
    setDrawer({ type: "run-confirm", columnId, limit: selected.length });
  };

  const executeRun = async (columnId: string) => {
    const { selected, candidates } = runTargetIds(columnId);
    if (candidates.length === 0) {
      toast.error("Нет строк с заполненным идентификатором");
      return;
    }
    setRunning(true);
    selected.forEach((rowId) => updateCell(rowId, columnId, { status: "running" }));
    try {
      const result = await enrichmentService.createRun(
        tableId,
        { column_id: columnId, row_ids: selected },
        crypto.randomUUID(),
      );
      const released = Math.max(0, result.reserved_credits - result.charged_credits);
      toast.success(
        `${result.success_count} найдено · ${result.not_found_count} не найдено · ${result.error_count} ошибок · ${result.skipped_count} пропущено · ${result.charged_credits} credits списано · ${released} возвращено`,
      );
      const data = await tablesService.getTable(tableId);
      setTable(data);
      invalidateCredits();
      setDrawer(null);
    } catch (error) {
      selected.forEach((rowId) => updateCell(rowId, columnId, { status: "error" }));
      if (error instanceof ApiError && error.code === "INSUFFICIENT_CREDITS") {
        const details = error.details as { needed?: number; available?: number } | null;
        toast.error(`Не хватает credits. Нужно: ${details?.needed ?? "—"} · Доступно: ${details?.available ?? "—"}`);
      } else if (error instanceof ApiError && error.code === "ENRICHMENT_PROVIDER_NOT_CONFIGURED") {
        toast.error("DaData не настроен. Задайте DADATA_API_KEY на backend.");
      } else if (error instanceof ApiError && error.code === "ENRICHMENT_ASYNC_REQUIRED") {
        toast.error(error.message);
      } else {
        toast.error(error instanceof ApiError ? error.message : "Не удалось запустить enrichment");
      }
    } finally {
      setRunning(false);
    }
  };

  const renameTable = async () => {
    const next = window.prompt("Название таблицы", table.name);
    if (!next || next === table.name) return;
    const previous = table.name;
    setTable({ ...table, name: next });
    try {
      await tablesService.updateTable(tableId, { name: next });
    } catch {
      setTable({ ...table, name: previous });
      toast.error("Не удалось переименовать таблицу");
    }
  };

  return (
    <div className="flex h-full flex-col" data-capture="table-editor">
      <header className="flex h-10 items-center justify-between border-b border-line px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-[12px] text-ink-muted">
            Tables / <span className="text-ink">{table.name}</span>
          </div>
          <button
            type="button"
            aria-label="В избранное"
            onClick={() => {
              if (isDemo) setStarred(!table.starred);
              else soon("Избранное");
            }}
            className="flex size-8 items-center justify-center"
          >
            <Star className={`size-3.5 ${table.starred ? "fill-warning text-warning" : "text-ink-faint"}`} />
          </button>
          <button type="button" className="flex items-center gap-1 text-[13px] font-medium" onClick={() => void renameTable()}>
            {table.name}
            <ChevronDown className="size-3.5 text-ink-muted" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {!isDemo && (
            <Button variant="secondary" size="sm" asChild>
              <Link to={`/app/tables/${tableId}/relationship-analysis`} aria-label="Анализ отношений">
                <Network /><span className="hidden md:inline">Анализ отношений</span>
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Undo" onClick={undo}>
            <Undo2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Redo" onClick={redo}>
            <Redo2 className="size-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => soon("Share")}>
            <Share className="size-3.5" /> Share
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDrawer({ type: "export" })}>
            Export
          </Button>
          <Button
            variant="accent"
            size="sm"
            data-capture="run"
            onClick={() => {
              const column = enrichmentColumns[0];
              if (column) openRun(column.id);
              else soon("Run / Enrichment");
            }}
          >
            Run
          </Button>
        </div>
      </header>

      <div className="flex h-10 items-center gap-1 border-b border-line px-4">
        {table.views.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => setView(view.id)}
            className={`h-8 rounded-[var(--radius-sm)] px-2 text-[13px] ${
              viewId === view.id ? "bg-surface-1 text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            {view.name}
          </button>
        ))}
      </div>

      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-1">
          <AddColumnPopover onSelect={(id) => void handleAddColumn(id)} />
          <Button variant="ghost" size="sm" onClick={() => void handleAddRow()}>
            <Plus className="size-3.5" /> Row
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDrawer({ type: "import" })}>
            Import
          </Button>
          <Button variant="ghost" size="sm" onClick={() => soon("Filter")}>
            <Filter className="size-3.5" /> Filter
          </Button>
          <Button variant="ghost" size="sm" onClick={() => soon("Sort")}>
            Sort
          </Button>
          <Button variant="ghost" size="sm" onClick={() => soon("Group")}>
            <Group className="size-3.5" /> Group
          </Button>
          <Button variant="ghost" size="sm" onClick={() => soon("Columns")}>
            <Columns3 className="size-3.5" /> Columns
          </Button>
          <div className="relative ml-1">
            <Search className="pointer-events-none absolute top-2 left-2 size-3.5 text-ink-faint" />
            <Input
              id="table-search"
              className="h-8 w-48 pl-7"
              placeholder="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button variant="ghost" size="sm" data-capture="enrich" onClick={() => setDrawer({ type: "enrichment" })}>
            Enrich
          </Button>
          <Button variant="ghost" size="sm" data-capture="ai" onClick={() => soon("AI Column")}>
            <WandSparkles className="size-3.5" /> AI
          </Button>
          <Button variant="ghost" size="sm" onClick={() => soon("Signals")}>
            <Sparkles className="size-3.5" /> Signals
          </Button>
        </div>
        <div className="text-[12px] text-ink-muted">
          {table.rowCount} rows
          {selectedVisible.length ? ` · Selected ${selectedVisible.length}` : ""}
          {table.rowCount > visibleRows.length ? " · поиск по загруженной странице" : ""}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <Spreadsheet
          rows={visibleRows}
          columns={table.columns}
          selectedRowIds={selectedRowIds}
          focusedCell={focusedCell}
          onToggleRow={toggleRow}
          onToggleAll={() => toggleAll(visibleRows.map((row) => row.id))}
          onFocus={(rowId, columnId) => setFocusedCell({ rowId, columnId })}
          onOpenCompany={(rowId) => setDrawer({ type: "row", rowId })}
          onOpenCell={(rowId, columnId) => setDrawer({ type: "cell", rowId, columnId })}
          onRename={(columnId) => void persistRename(columnId)}
          onDuplicate={(columnId) => void persistDuplicate(columnId)}
          onInsert={(columnId, side) => void persistInsert(columnId, side)}
          onSort={() => soon("Sort")}
          onFilter={() => soon("Filter")}
          onHide={hideColumn}
          onDelete={(columnId) => void persistDeleteColumn(columnId)}
          onRunColumn={(columnId) => openRun(columnId)}
          onGenerate={() => soon("Generate")}
          onResize={resizeColumn}
          onCommitCell={(rowId, columnId, value) => void commitCell(rowId, columnId, value)}
        />

        {selectedVisible.length > 0 && (
          <div className="glass-float absolute bottom-16 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-md)] px-3 py-2">
            <span className="text-[13px]">{selectedVisible.length} selected</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const column = enrichmentColumns[0];
                if (column) openRun(column.id);
                else setDrawer({ type: "enrichment" });
              }}
            >
              Enrich
            </Button>
            <Button variant="ghost" size="sm" onClick={() => soon("AI Column")}>
              AI
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDrawer({ type: "export" })}>
              Export
            </Button>
            <Button variant="ghost" size="sm" onClick={() => soon("CRM")}>
              Send to CRM
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleDeleteRows(selectedVisible)}>
              Delete
            </Button>
          </div>
        )}

        {running && (
          <div className="glass-float absolute bottom-3 left-1/2 z-30 w-[min(560px,calc(100%-24px))] -translate-x-1/2 rounded-[var(--radius-md)] px-4 py-3 text-[13px]">
            Обогащение выполняется…
          </div>
        )}
      </div>

      <EnrichmentDrawer
        open={drawer?.type === "enrichment"}
        onOpenChange={(open) => !open && setDrawer(null)}
        tableId={tableId}
        columns={table.columns}
        onCreated={(column) => {
          addColumn(mapApiColumn(column));
          toast.success("Enrichment-колонка создана");
        }}
      />
      <WaterfallDrawer open={drawer?.type === "waterfall"} onOpenChange={(open) => !open && setDrawer(null)} />
      <AiColumnDrawer
        open={drawer?.type === "ai"}
        onOpenChange={(open) => !open && setDrawer(null)}
        columns={table.columns}
        onSave={() => {
          setDrawer(null);
          soon("AI Column");
        }}
      />
      <FormulaDrawer
        open={drawer?.type === "formula"}
        onOpenChange={(open) => !open && setDrawer(null)}
        onSave={() => {
          setDrawer(null);
          soon("Formula");
        }}
      />
      <AgentDrawer
        open={drawer?.type === "agent"}
        onOpenChange={(open) => !open && setDrawer(null)}
        onSave={() => {
          setDrawer(null);
          soon("AI Research Agent");
        }}
      />
      {drawer?.type === "row" && (
        <RowDetails
          open
          onOpenChange={(open) => !open && setDrawer(null)}
          row={rowForDrawer ?? null}
          tableId={isDemo ? undefined : tableId}
        />
      )}
      <CellDetails
        open={drawer?.type === "cell"}
        onOpenChange={(open) => !open && setDrawer(null)}
        title="Cell details"
        tableId={tableId}
        row={rowForDrawer ?? null}
        columnId={drawer?.type === "cell" ? drawer.columnId : ""}
      />
      <ImportWizard
        open={drawer?.type === "import"}
        onOpenChange={(open) => !open && setDrawer(null)}
        mode="table"
        tableId={tableId}
        existingColumns={table.columns}
        onImported={() => {
          void tablesService.getTable(tableId).then(setTable);
        }}
      />
      <ExportDialog
        open={drawer?.type === "export"}
        onOpenChange={(open) => !open && setDrawer(null)}
        tableId={tableId}
      />
      <CrmDialog
        open={drawer?.type === "crm"}
        onOpenChange={(open) => !open && setDrawer(null)}
        count={selectedVisible.length || 0}
        onSend={() => soon("CRM")}
      />
      <RunConfirmDialog
        open={drawer?.type === "run-confirm"}
        onOpenChange={(open) => !open && setDrawer(null)}
        rows={drawer?.type === "run-confirm" ? runTargetIds(drawer.columnId).selected.length : 0}
        candidates={drawer?.type === "run-confirm" ? runTargetIds(drawer.columnId).candidates.length : 0}
        maxReservation={
          drawer?.type === "run-confirm"
            ? runTargetIds(drawer.columnId).candidates.length * runTargetIds(drawer.columnId).cost
            : 0
        }
        costPerSuccess={drawer?.type === "run-confirm" ? runTargetIds(drawer.columnId).cost : 1}
        availableCredits={availableCredits}
        running={running}
        onConfirm={() => {
          if (drawer?.type === "run-confirm") void executeRun(drawer.columnId);
        }}
      />
    </div>
  );
}
