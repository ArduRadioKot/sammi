import { apiClient } from "@/lib/api/client";
import type { TableMapPoints } from "@/types/domain";

export const mapService = {
  async getTableMap(tableId: string, columnId?: string, signal?: AbortSignal) {
    const path = `/api/v1/tables/${tableId}/map${columnId ? `?column_id=${columnId}` : ""}`;
    return apiClient.get<TableMapPoints>(path, signal);
  },
};
