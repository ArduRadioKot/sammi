import { apiClient } from "@/lib/api/client";

export type CsvDelimiter = "comma" | "semicolon" | "tab";

export type CsvColumnType = "text" | "number" | "boolean" | "date" | "email" | "url" | "phone";

export type CsvMappingAction = "create" | "existing" | "skip";

export type CsvPreviewHeader = {
  index: number;
  name: string;
  suggested_type: CsvColumnType | string;
};

export type CsvExistingColumn = {
  id: string;
  name: string;
  type: string;
};

export type CsvPreview = {
  filename: string;
  encoding: string;
  delimiter: CsvDelimiter | string;
  file_signature: string;
  row_count: number;
  suggested_table_name: string;
  headers: CsvPreviewHeader[];
  sample_rows: string[][];
  warnings: string[];
  existing_columns?: CsvExistingColumn[] | null;
};

export type CsvMappingColumn = {
  csv_index: number;
  action: CsvMappingAction;
  name?: string;
  type?: string;
  column_id?: string;
};

export type CsvImportOptions = {
  file_signature: string;
  delimiter?: CsvDelimiter | string;
  table_name?: string;
  object_type?: "company" | "person" | "custom";
};

export type CsvImportResult = {
  table_id: string;
  table_name: string;
  rows_imported: number;
  columns_created: number;
  columns_mapped: number;
  columns_skipped: number;
  column_count: number;
};

export type CsvValidationErrorItem = {
  row: number;
  column: string;
  value: string;
  reason: string;
};

function appendFile(form: FormData, file: File, delimiter?: string) {
  form.append("file", file);
  if (delimiter) form.append("delimiter", delimiter);
}

export const csvService = {
  previewWorkspace(workspaceId: string, file: File, delimiter?: string) {
    const form = new FormData();
    appendFile(form, file, delimiter);
    return apiClient.postForm<CsvPreview>(`/api/v1/workspaces/${workspaceId}/imports/csv/preview`, form);
  },

  importWorkspace(workspaceId: string, file: File, mapping: CsvMappingColumn[], options: CsvImportOptions, delimiter?: string) {
    const form = new FormData();
    appendFile(form, file, delimiter ?? options.delimiter);
    form.append("mapping_json", JSON.stringify({ columns: mapping }));
    form.append("options_json", JSON.stringify(options));
    return apiClient.postForm<CsvImportResult>(`/api/v1/workspaces/${workspaceId}/imports/csv`, form);
  },

  previewTable(tableId: string, file: File, delimiter?: string) {
    const form = new FormData();
    appendFile(form, file, delimiter);
    return apiClient.postForm<CsvPreview>(`/api/v1/tables/${tableId}/imports/csv/preview`, form);
  },

  importTable(tableId: string, file: File, mapping: CsvMappingColumn[], options: CsvImportOptions, delimiter?: string) {
    const form = new FormData();
    appendFile(form, file, delimiter ?? options.delimiter);
    form.append("mapping_json", JSON.stringify({ columns: mapping }));
    form.append("options_json", JSON.stringify(options));
    return apiClient.postForm<CsvImportResult>(`/api/v1/tables/${tableId}/imports/csv`, form);
  },

  async exportTable(
    tableId: string,
    options: { delimiter?: "comma" | "semicolon"; bom?: boolean; safeForSpreadsheets?: boolean } = {},
  ) {
    const params = new URLSearchParams({
      delimiter: options.delimiter ?? "comma",
      bom: String(options.bom ?? true),
      safe_for_spreadsheets: String(options.safeForSpreadsheets ?? true),
    });
    const { blob, filename } = await apiClient.getBlob(`/api/v1/tables/${tableId}/export.csv?${params.toString()}`);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
