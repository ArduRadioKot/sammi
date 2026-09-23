import { useVirtualizer } from "@tanstack/react-virtual";
import { getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  EyeOff,
  Filter,
  Pencil,
  Play,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/overlays";
import { HEADER_HEIGHT, ROW_HEIGHT } from "@/lib/constants/config";
import { DataCell } from "@/features/tables/components/data-cell";
import type { ColumnDefinition, TableRow } from "@/types/domain";
import { cn } from "@/lib/utils";

const CHECKBOX_WIDTH = 40;

export function Spreadsheet({
  rows,
  columns,
  selectedRowIds,
  focusedCell,
  onToggleRow,
  onToggleAll,
  onFocus,
  onOpenCompany,
  onOpenCell,
  onRename,
  onDuplicate,
  onInsert,
  onSort,
  onFilter,
  onHide,
  onDelete,
  onRunColumn,
  onGenerate,
  onResize,
  onCommitCell,
}: {
  rows: TableRow[];
  columns: ColumnDefinition[];
  selectedRowIds: string[];
  focusedCell: { rowId: string; columnId: string } | null;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onFocus: (rowId: string, columnId: string) => void;
  onOpenCompany: (rowId: string) => void;
  onOpenCell: (rowId: string, columnId: string) => void;
  onRename: (columnId: string) => void;
  onDuplicate: (columnId: string) => void;
  onInsert: (columnId: string, side: "left" | "right") => void;
  onSort: (columnId: string, direction: "asc" | "desc") => void;
  onFilter: (columnId: string) => void;
  onHide: (columnId: string) => void;
  onDelete: (columnId: string) => void;
  onRunColumn: (columnId: string) => void;
  onGenerate: (columnId: string) => void;
  onResize: (columnId: string, width: number) => void;
  onCommitCell?: (rowId: string, columnId: string, value: unknown) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null);
  const visible = useMemo(
    () => columns.filter((column) => !column.hidden),
    [columns],
  );
  const tableColumns = useMemo<ColumnDef<TableRow>[]>(
    () =>
      visible.map((column) => ({
        id: column.id,
        accessorFn: (row) => row.cells[column.id]?.value,
        header: column.name,
        size: column.width,
      })),
    [visible],
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table v8 API
  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });
  const tableRows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const totalWidth = CHECKBOX_WIDTH + visible.reduce((sum, column) => sum + column.width, 0);
  const allSelected = rows.length > 0 && selectedRowIds.length === rows.length;

  return (
    <div ref={parentRef} data-capture="spreadsheet" className="scrollbar-thin h-full overflow-auto bg-surface-0">
      <div style={{ width: totalWidth, minWidth: "100%" }}>
        <div
          className="sticky top-0 z-20 flex border-b border-line bg-surface-1"
          style={{ height: HEADER_HEIGHT }}
        >
          <div
            className="sticky left-0 z-30 flex items-center justify-center border-r border-line bg-surface-1"
            style={{ width: CHECKBOX_WIDTH }}
          >
            <Checkbox checked={allSelected} onCheckedChange={() => onToggleAll()} aria-label="Выбрать все" />
          </div>
          {visible.map((column, index) => (
            <div
              key={column.id}
              className={cn(
                "relative flex items-center border-r border-line px-2 text-[12px] font-medium",
                column.frozen && "sticky z-20 bg-surface-1",
              )}
              style={{
                width: column.width,
                left: column.frozen ? CHECKBOX_WIDTH : undefined,
              }}
            >
              <DropdownMenu>
                <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-1 truncate text-left">
                  <span className="truncate">{column.name}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => onRename(column.id)}>
                    <Pencil className="size-3.5" /> Edit column / Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onDuplicate(column.id)}>
                    <Copy className="size-3.5" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onInsert(column.id, "left")}>Insert left</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onInsert(column.id, "right")}>Insert right</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onSort(column.id, "asc")}>
                    <ArrowUp className="size-3.5" /> Sort A→Z
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onSort(column.id, "desc")}>
                    <ArrowDown className="size-3.5" /> Sort Z→A
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onFilter(column.id)}>
                    <Filter className="size-3.5" /> Filter
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onHide(column.id)}>
                    <EyeOff className="size-3.5" /> Hide
                  </DropdownMenuItem>
                  {column.type === "enrichment" || column.config?.kind === "waterfall" ? (
                    <DropdownMenuItem onSelect={() => onRunColumn(column.id)}>
                      <Play className="size-3.5" /> Run column
                    </DropdownMenuItem>
                  ) : null}
                  {column.type === "ai" ? (
                    <DropdownMenuItem onSelect={() => onGenerate(column.id)}>
                      <Sparkles className="size-3.5" /> Generate
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onDelete(column.id)}>
                    <Trash2 className="size-3.5" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div
                role="separator"
                aria-orientation="vertical"
                className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-accent"
                onMouseDown={(event) => {
                  event.preventDefault();
                  const startX = event.clientX;
                  const startWidth = column.width;
                  const move = (ev: MouseEvent) => onResize(column.id, Math.max(80, startWidth + ev.clientX - startX));
                  const up = () => {
                    window.removeEventListener("mousemove", move);
                    window.removeEventListener("mouseup", up);
                  };
                  window.addEventListener("mousemove", move);
                  window.addEventListener("mouseup", up);
                }}
              />
              {index === visible.length - 1 ? null : null}
            </div>
          ))}
        </div>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const tableRow = tableRows[virtualRow.index];
            const row = tableRow?.original;
            if (!row) return null;
            const selected = selectedRowIds.includes(row.id);
            return (
              <div
                key={row.id}
                className={cn(
                  "absolute left-0 flex border-b border-line",
                  selected ? "bg-row-selected" : "bg-surface-0 hover:bg-row-hover",
                )}
                style={{
                  height: ROW_HEIGHT,
                  transform: `translateY(${virtualRow.start}px)`,
                  width: totalWidth,
                }}
              >
                <div
                  className="sticky left-0 z-10 flex items-center justify-center border-r border-line bg-inherit"
                  style={{ width: CHECKBOX_WIDTH }}
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => onToggleRow(row.id)}
                    aria-label={`Выбрать ${String(row.cells.company?.value ?? row.id)}`}
                  />
                </div>
                {visible.map((column) => (
                  <div
                    key={column.id}
                    className={cn(
                      "flex items-center overflow-hidden border-r border-line px-2",
                      column.frozen && "sticky z-10 bg-inherit",
                      focusedCell?.rowId === row.id && focusedCell?.columnId === column.id && "cell-editing",
                    )}
                    style={{
                      width: column.width,
                      left: column.frozen ? CHECKBOX_WIDTH : undefined,
                    }}
                    onClick={() => {
                      onFocus(row.id, column.id);
                      if (column.type !== "boolean") setEditingCell({ rowId: row.id, columnId: column.id });
                    }}
                    onDoubleClick={() => {
                      onFocus(row.id, column.id);
                      if (column.type !== "boolean") setEditingCell({ rowId: row.id, columnId: column.id });
                    }}
                  >
                    {editingCell?.rowId === row.id && editingCell?.columnId === column.id && column.type !== "boolean" ? (
                      <InlineEditor
                        key={`${row.id}:${column.id}:${String(row.cells[column.id]?.value ?? "")}`}
                        column={column}
                        value={row.cells[column.id]?.value}
                        onCommit={(value) => {
                          onCommitCell?.(row.id, column.id, value);
                          setEditingCell(null);
                        }}
                      />
                    ) : (
                      <DataCell
                        column={column}
                        cell={row.cells[column.id]}
                        onOpenCompany={() => onOpenCompany(row.id)}
                        onOpenDetails={() => onOpenCell(row.id, column.id)}
                        onBooleanChange={
                          onCommitCell ? (value) => onCommitCell(row.id, column.id, value) : undefined
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InlineEditor({
  column,
  value,
  onCommit,
}: {
  column: ColumnDefinition;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const initial = value == null ? "" : String(value);
  const [draft, setDraft] = useState(initial);
  const inputType = column.type === "number" ? "number" : column.type === "date" ? "date" : "text";

  const commit = (raw: string) => {
    if (column.type === "number") {
      if (raw.trim() === "") {
        onCommit(null);
        return;
      }
      const parsed = Number(raw);
      onCommit(Number.isFinite(parsed) ? parsed : null);
      return;
    }
    onCommit(raw.trim() === "" ? null : raw);
  };

  return (
    <input
      autoFocus
      type={inputType}
      value={draft}
      className="h-7 w-full bg-transparent text-[13px] outline-none"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget.value);
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(initial);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
