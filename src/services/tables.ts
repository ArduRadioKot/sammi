import { apiClient } from "@/lib/api/client";
import type {
  ColumnConfig,
  ColumnDefinition,
  ColumnType,
  CreateTableInput,
  DataTable,
  SelectOption,
  TableRow,
  TableType,
  TableWithRows,
} from "@/types/domain";

const ALL_VIEW = { id: "all", name: "Все", filters: [], sorts: [] };
const DEFAULT_WIDTH = 180;
const ROW_PAGE_LIMIT = 200;

export const STEP3_COLUMN_TYPES = [
  "text",
  "number",
  "boolean",
  "date",
  "url",
  "email",
  "phone",
  "select",
] as const;

export type Step3ColumnType = (typeof STEP3_COLUMN_TYPES)[number];

type ApiTable = {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  description: string | null;
  object_type: string;
  relationship_source_id?: string | null;
  created_at: string;
  updated_at: string;
  row_count: number;
  column_count: number;
  columns?: ApiColumn[] | null;
};

type ApiColumn = {
  id: string;
  table_id: string;
  name: string;
  type: string;
  position: number;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ApiRow = {
  id: string;
  table_id: string;
  position: number;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type PaginatedRows = {
  items: ApiRow[];
  total: number;
  limit: number;
  offset: number;
};

const OBJECT_TO_TYPE: Record<string, TableType> = {
  company: "companies",
  person: "people",
  custom: "custom",
};

const TYPE_TO_OBJECT: Record<TableType, string> = {
  companies: "company",
  people: "person",
  custom: "custom",
};

function mapTableType(objectType: string): TableType {
  return OBJECT_TO_TYPE[objectType] ?? "custom";
}

function mapColumnType(type: string): ColumnType {
  return type as ColumnType;
}

function mapSelectOptions(config: Record<string, unknown>): SelectOption[] {
  const raw = config.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    if (typeof item === "string") return { id: item, label: item };
    if (item && typeof item === "object") {
      const record = item as { id?: string; label?: string };
      const label = record.label ?? record.id ?? `option-${index}`;
      return { id: record.id ?? label, label };
    }
    return { id: String(index), label: String(item) };
  });
}

function mapColumnConfig(type: string, config: Record<string, unknown>): ColumnConfig | undefined {
  if (type === "select") {
    return { kind: "select", options: mapSelectOptions(config) };
  }
  if (type === "enrichment") {
    const outputField = String(config.output_field ?? "");
    return {
      kind: "enrichment",
      providerId: String(config.provider_id ?? ""),
      operation: String(config.operation ?? ""),
      inputColumnId: String(config.input_column_id ?? ""),
      outputField,
      field: outputField,
      creditsPerSuccess: Number(config.credits_per_success ?? 0),
      conditions: [],
    };
  }
  return undefined;
}

export function mapApiColumn(column: ApiColumn): ColumnDefinition {
  return mapColumn(column);
}

function mapColumn(column: ApiColumn): ColumnDefinition {
  return {
    id: column.id,
    name: column.name,
    type: mapColumnType(column.type),
    width: DEFAULT_WIDTH,
    config: mapColumnConfig(column.type, column.config ?? {}),
    analysisOutput: typeof column.config?.relationship_output === "string",
  };
}

function mapTable(table: ApiTable, columns: ColumnDefinition[] = []): DataTable {
  return {
    id: table.id,
    name: table.name,
    type: mapTableType(table.object_type),
    description: table.description ?? undefined,
    relationshipSourceId: table.relationship_source_id ?? undefined,
    columns,
    views: [ALL_VIEW],
    defaultViewId: "all",
    rowCount: table.row_count,
    enrichmentCount: 0,
    creditsUsed: 0,
    owner: "",
    updatedAt: table.updated_at,
  };
}

function mapRow(row: ApiRow, columns: ColumnDefinition[]): TableRow {
  const cells: TableRow["cells"] = {};
  for (const column of columns) {
    cells[column.id] = { value: row.data[column.id] ?? null, status: "idle" };
  }
  return { id: row.id, cells };
}

function selectConfigPayload(config?: ColumnConfig): Record<string, unknown> {
  if (config && config.kind === "select") {
    return { options: config.options.map((option) => option.label) };
  }
  return {};
}

export interface TablesService {
  listTables(workspaceId: string, signal?: AbortSignal): Promise<DataTable[]>;
  createTable(workspaceId: string, input: CreateTableInput): Promise<DataTable>;
  getTable(tableId: string): Promise<TableWithRows>;
  updateTable(tableId: string, input: { name?: string; description?: string }): Promise<DataTable>;
  deleteTable(tableId: string): Promise<void>;
  listColumns(tableId: string, signal?: AbortSignal): Promise<ColumnDefinition[]>;
  createColumn(
    tableId: string,
    input: { name: string; type: Step3ColumnType; config?: Record<string, unknown> },
  ): Promise<ColumnDefinition>;
  updateColumn(
    tableId: string,
    columnId: string,
    input: { name?: string; config?: Record<string, unknown> },
  ): Promise<ColumnDefinition>;
  deleteColumn(tableId: string, columnId: string): Promise<void>;
  reorderColumns(tableId: string, columnIds: string[]): Promise<ColumnDefinition[]>;
  listRows(tableId: string, columns: ColumnDefinition[], limit?: number, offset?: number, signal?: AbortSignal): Promise<{ rows: TableRow[]; total: number }>;
  createRow(tableId: string, data?: Record<string, unknown>): Promise<{ id: string; data: Record<string, unknown> }>;
  updateRow(tableId: string, rowId: string, data: Record<string, unknown>): Promise<{ id: string; data: Record<string, unknown> }>;
  deleteRow(tableId: string, rowId: string): Promise<void>;
  bulkDeleteRows(tableId: string, rowIds: string[]): Promise<void>;
  duplicateTable(id: string): Promise<DataTable>;
  archiveTable(id: string): Promise<void>;
  toggleStar(id: string): Promise<DataTable>;
}

export class FastApiTablesService implements TablesService {
  async listTables(workspaceId: string, signal?: AbortSignal) {
    const payload = await apiClient.get<{ items: ApiTable[] }>(`/api/v1/workspaces/${workspaceId}/tables`, signal);
    return payload.items.map((table) => mapTable(table));
  }

  async createTable(workspaceId: string, input: CreateTableInput) {
    const table = await apiClient.post<ApiTable>(`/api/v1/workspaces/${workspaceId}/tables`, {
      name: input.name,
      object_type: TYPE_TO_OBJECT[input.type],
    });
    return mapTable(table, []);
  }

  async getTable(tableId: string): Promise<TableWithRows> {
    const table = await apiClient.get<ApiTable>(`/api/v1/tables/${tableId}`);
    const columns = (table.columns ?? []).map(mapColumn);
    const rows = await apiClient.get<PaginatedRows>(
      `/api/v1/tables/${tableId}/rows?limit=${ROW_PAGE_LIMIT}&offset=0`,
    );
    return {
      ...mapTable(table, columns),
      rowCount: rows.total,
      rows: rows.items.map((row) => mapRow(row, columns)),
    };
  }

  async updateTable(tableId: string, input: { name?: string; description?: string }) {
    const table = await apiClient.patch<ApiTable>(`/api/v1/tables/${tableId}`, input);
    return mapTable(table);
  }

  async deleteTable(tableId: string) {
    await apiClient.delete(`/api/v1/tables/${tableId}`);
  }

  async listColumns(tableId: string, signal?: AbortSignal) {
    const payload = await apiClient.get<{ items: ApiColumn[] }>(`/api/v1/tables/${tableId}/columns`, signal);
    return payload.items.map(mapColumn);
  }

  async createColumn(
    tableId: string,
    input: { name: string; type: Step3ColumnType; config?: Record<string, unknown> },
  ) {
    const column = await apiClient.post<ApiColumn>(`/api/v1/tables/${tableId}/columns`, {
      name: input.name,
      type: input.type,
      config: input.config ?? (input.type === "select" ? { options: [] } : {}),
    });
    return mapColumn(column);
  }

  async updateColumn(
    tableId: string,
    columnId: string,
    input: { name?: string; config?: Record<string, unknown> },
  ) {
    const column = await apiClient.patch<ApiColumn>(`/api/v1/tables/${tableId}/columns/${columnId}`, input);
    return mapColumn(column);
  }

  async deleteColumn(tableId: string, columnId: string) {
    await apiClient.delete(`/api/v1/tables/${tableId}/columns/${columnId}`);
  }

  async reorderColumns(tableId: string, columnIds: string[]) {
    const payload = await apiClient.post<{ items: ApiColumn[] }>(`/api/v1/tables/${tableId}/columns/reorder`, {
      column_ids: columnIds,
    });
    return payload.items.map(mapColumn);
  }

  async listRows(tableId: string, columns: ColumnDefinition[], limit = ROW_PAGE_LIMIT, offset = 0, signal?: AbortSignal) {
    const payload = await apiClient.get<PaginatedRows>(
      `/api/v1/tables/${tableId}/rows?limit=${limit}&offset=${offset}`,
      signal,
    );
    return { rows: payload.items.map((row) => mapRow(row, columns)), total: payload.total };
  }

  async createRow(tableId: string, data: Record<string, unknown> = {}) {
    const row = await apiClient.post<ApiRow>(`/api/v1/tables/${tableId}/rows`, { data });
    return { id: row.id, data: row.data };
  }

  async updateRow(tableId: string, rowId: string, data: Record<string, unknown>) {
    const row = await apiClient.patch<ApiRow>(`/api/v1/tables/${tableId}/rows/${rowId}`, { data });
    return { id: row.id, data: row.data };
  }

  async deleteRow(tableId: string, rowId: string) {
    await apiClient.delete(`/api/v1/tables/${tableId}/rows/${rowId}`);
  }

  async bulkDeleteRows(tableId: string, rowIds: string[]) {
    await apiClient.post(`/api/v1/tables/${tableId}/rows/bulk-delete`, { row_ids: rowIds });
  }

  async duplicateTable(): Promise<DataTable> {
    throw new Error("DUPLICATE_NOT_IMPLEMENTED");
  }

  async archiveTable(): Promise<void> {
    throw new Error("ARCHIVE_NOT_IMPLEMENTED");
  }

  async toggleStar(): Promise<DataTable> {
    throw new Error("STAR_NOT_IMPLEMENTED");
  }
}

export const tablesService: TablesService = new FastApiTablesService();

export function columnCreateConfig(type: Step3ColumnType): Record<string, unknown> {
  return type === "select" ? { options: [] } : {};
}

export { selectConfigPayload };
