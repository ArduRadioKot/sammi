import { create } from "zustand";
import type {
  CellValue,
  ColumnDefinition,
  FilterRule,
  RunJob,
  SortRule,
  TableRow,
  TableView,
  TableWithRows,
} from "@/types/domain";

type DrawerState =
  | { type: "enrichment" }
  | { type: "row"; rowId: string }
  | { type: "cell"; rowId: string; columnId: string }
  | { type: "import" }
  | { type: "export" }
  | { type: "run-confirm"; columnId: string; limit: number }
  | null;

interface HistorySnapshot {
  rows: TableRow[];
  columns: ColumnDefinition[];
}

interface TableEditorState {
  table: TableWithRows | null;
  loading: boolean;
  viewId: string;
  selectedRowIds: string[];
  focusedCell: { rowId: string; columnId: string } | null;
  search: string;
  filters: FilterRule[];
  sorts: SortRule[];
  drawer: DrawerState;
  run: RunJob | null;
  history: HistorySnapshot[];
  future: HistorySnapshot[];
  setTable: (table: TableWithRows) => void;
  setLoading: (loading: boolean) => void;
  setView: (viewId: string) => void;
  toggleRow: (rowId: string) => void;
  toggleAll: (rowIds: string[]) => void;
  clearSelection: () => void;
  setFocusedCell: (cell: { rowId: string; columnId: string } | null) => void;
  setSearch: (search: string) => void;
  setFilters: (filters: FilterRule[]) => void;
  setSorts: (sorts: SortRule[]) => void;
  setDrawer: (drawer: DrawerState) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  addColumn: (column: ColumnDefinition, index?: number) => void;
  setColumns: (columns: ColumnDefinition[]) => void;
  updateColumn: (columnId: string, patch: Partial<ColumnDefinition>) => void;
  hideColumn: (columnId: string) => void;
  removeColumn: (columnId: string) => void;
  duplicateColumn: (columnId: string) => void;
  resizeColumn: (columnId: string, width: number) => void;
  addRow: (row: TableRow) => void;
  removeRows: (rowIds: string[]) => void;
  updateCell: (rowId: string, columnId: string, patch: Partial<CellValue>) => void;
  updateCells: (
    updates: Array<{ rowId: string; columnId: string; patch: Partial<CellValue> }>,
  ) => void;
  clearCell: (rowId: string, columnId: string) => void;
  setStarred: (starred: boolean) => void;
  setRun: (run: RunJob | null) => void;
  patchRun: (patch: Partial<RunJob>) => void;
  addView: (view: TableView) => void;
  reset: () => void;
}

function cloneRows(rows: TableRow[]): TableRow[] {
  return rows.map((row) => ({
    id: row.id,
    cells: Object.fromEntries(Object.entries(row.cells).map(([k, v]) => [k, { ...v }])),
  }));
}

export const useTableEditorStore = create<TableEditorState>((set, get) => ({
  table: null,
  loading: true,
  viewId: "all",
  selectedRowIds: [],
  focusedCell: null,
  search: "",
  filters: [],
  sorts: [],
  drawer: null,
  run: null,
  history: [],
  future: [],
  setTable: (table) =>
    set({
      table,
      viewId: table.defaultViewId,
      filters: table.views.find((view) => view.id === table.defaultViewId)?.filters ?? [],
      sorts: table.views.find((view) => view.id === table.defaultViewId)?.sorts ?? [],
      loading: false,
      selectedRowIds: [],
    }),
  setLoading: (loading) => set({ loading }),
  setView: (viewId) => {
    const table = get().table;
    const view = table?.views.find((item) => item.id === viewId);
    set({
      viewId,
      filters: view?.filters ?? [],
      sorts: view?.sorts ?? [],
    });
  },
  toggleRow: (rowId) =>
    set((state) => ({
      selectedRowIds: state.selectedRowIds.includes(rowId)
        ? state.selectedRowIds.filter((id) => id !== rowId)
        : [...state.selectedRowIds, rowId],
    })),
  toggleAll: (rowIds) =>
    set((state) => ({
      selectedRowIds:
        state.selectedRowIds.length === rowIds.length ? [] : rowIds,
    })),
  clearSelection: () => set({ selectedRowIds: [] }),
  setFocusedCell: (focusedCell) => set({ focusedCell }),
  setSearch: (search) => set({ search }),
  setFilters: (filters) => set({ filters }),
  setSorts: (sorts) => set({ sorts }),
  setDrawer: (drawer) => set({ drawer }),
  pushHistory: () => {
    const table = get().table;
    if (!table) return;
    set((state) => ({
      history: [
        ...state.history.slice(-19),
        { rows: cloneRows(table.rows), columns: table.columns.map((c) => ({ ...c })) },
      ],
      future: [],
    }));
  },
  undo: () => {
    const { history, table, future } = get();
    if (!table || history.length === 0) return;
    const snapshot = history[history.length - 1];
    set({
      table: { ...table, rows: snapshot.rows, columns: snapshot.columns },
      history: history.slice(0, -1),
      future: [
        ...future,
        { rows: cloneRows(table.rows), columns: table.columns.map((c) => ({ ...c })) },
      ],
    });
  },
  redo: () => {
    const { future, table, history } = get();
    if (!table || future.length === 0) return;
    const snapshot = future[future.length - 1];
    set({
      table: { ...table, rows: snapshot.rows, columns: snapshot.columns },
      future: future.slice(0, -1),
      history: [
        ...history,
        { rows: cloneRows(table.rows), columns: table.columns.map((c) => ({ ...c })) },
      ],
    });
  },
  addColumn: (column, index) => {
    const table = get().table;
    if (!table) return;
    get().pushHistory();
    const columns = [...table.columns];
    const insertAt = index ?? columns.length;
    columns.splice(insertAt, 0, column);
    set({
      table: {
        ...table,
        columns,
        rows: table.rows.map((row) => ({
          ...row,
          cells: { ...row.cells, [column.id]: { value: null, status: "idle" } },
        })),
      },
    });
  },
  setColumns: (columns) => {
    const table = get().table;
    if (!table) return;
    set({ table: { ...table, columns } });
  },
  addRow: (row) => {
    const table = get().table;
    if (!table) return;
    get().pushHistory();
    set({
      table: { ...table, rows: [...table.rows, row], rowCount: table.rowCount + 1 },
    });
  },
  removeRows: (rowIds) => {
    const table = get().table;
    if (!table) return;
    const remove = new Set(rowIds);
    get().pushHistory();
    set({
      table: {
        ...table,
        rows: table.rows.filter((row) => !remove.has(row.id)),
        rowCount: Math.max(0, table.rowCount - rowIds.length),
      },
      selectedRowIds: get().selectedRowIds.filter((id) => !remove.has(id)),
    });
  },
  updateColumn: (columnId, patch) => {
    const table = get().table;
    if (!table) return;
    set({
      table: {
        ...table,
        columns: table.columns.map((column) =>
          column.id === columnId ? { ...column, ...patch } : column,
        ),
      },
    });
  },
  hideColumn: (columnId) => {
    const table = get().table;
    if (!table) return;
    set({
      table: {
        ...table,
        columns: table.columns.map((column) =>
          column.id === columnId ? { ...column, hidden: true } : column,
        ),
      },
    });
  },
  removeColumn: (columnId) => {
    const table = get().table;
    if (!table) return;
    get().pushHistory();
    set({
      table: {
        ...table,
        columns: table.columns.filter((column) => column.id !== columnId),
      },
    });
  },
  duplicateColumn: (columnId) => {
    const table = get().table;
    if (!table) return;
    const column = table.columns.find((item) => item.id === columnId);
    if (!column) return;
    const index = table.columns.findIndex((item) => item.id === columnId);
    get().addColumn(
      { ...column, id: `${column.id}_${Date.now()}`, name: `${column.name} copy` },
      index + 1,
    );
  },
  resizeColumn: (columnId, width) => {
    const table = get().table;
    if (!table) return;
    set({
      table: {
        ...table,
        columns: table.columns.map((column) =>
          column.id === columnId ? { ...column, width } : column,
        ),
      },
    });
  },
  updateCell: (rowId, columnId, patch) => {
    const table = get().table;
    if (!table) return;
    set({
      table: {
        ...table,
        rows: table.rows.map((row) =>
          row.id === rowId
            ? {
                ...row,
                cells: {
                  ...row.cells,
                  [columnId]: { ...row.cells[columnId], ...patch },
                },
              }
            : row,
        ),
      },
    });
  },
  updateCells: (updates) => {
    const table = get().table;
    if (!table) return;
    const map = new Map(updates.map((item) => [`${item.rowId}:${item.columnId}`, item.patch]));
    set({
      table: {
        ...table,
        rows: table.rows.map((row) => {
          let cells = row.cells;
          let changed = false;
          for (const [key, patch] of map) {
            const [rowId, columnId] = key.split(":");
            if (rowId !== row.id) continue;
            cells = {
              ...cells,
              [columnId]: { ...cells[columnId], ...patch },
            };
            changed = true;
          }
          return changed ? { ...row, cells } : row;
        }),
      },
    });
  },
  clearCell: (rowId, columnId) => {
    get().pushHistory();
    get().updateCell(rowId, columnId, { value: "", display: "", status: "idle", error: undefined });
  },
  setStarred: (starred) => {
    const table = get().table;
    if (!table) return;
    set({ table: { ...table, starred } });
  },
  setRun: (run) => set({ run }),
  patchRun: (patch) => {
    const run = get().run;
    if (!run) return;
    set({ run: { ...run, ...patch } });
  },
  addView: (view) => {
    const table = get().table;
    if (!table) return;
    set({ table: { ...table, views: [...table.views, view] } });
  },
  reset: () =>
    set({
      table: null,
      loading: true,
      selectedRowIds: [],
      drawer: null,
      run: null,
      history: [],
      future: [],
      search: "",
    }),
}));
