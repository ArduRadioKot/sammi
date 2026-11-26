import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Map as MapIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/forms";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api/client";
import { mapService } from "@/services/map";
import { tablesService } from "@/services/tables";
import type { ColumnDefinition, DataTable, TableMapPoints } from "@/types/domain";
import { useAuthStore } from "@/stores/auth-store";

function sourceLabel(source: TableMapPoints["source"], geocoded: number, cached: number) {
  if (source === "geocoded") return `Геокодировано: ${geocoded} · из кэша: ${cached}`;
  if (source === "cache") return `Из кэша: ${cached}`;
  return null;
}

function MapCanvas({ points }: { points: TableMapPoints["points"] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    return {
      southWest: [Math.min(...lats), Math.min(...lons)] as [number, number],
      northEast: [Math.max(...lats), Math.max(...lons)] as [number, number],
      center: [
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lons) + Math.max(...lons)) / 2,
      ] as [number, number],
    };
  }, [points]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [55.7558, 37.6173],
      zoom: 10,
      scrollWheelZoom: true,
      attributionControl: true,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    for (const point of points) {
      const text = document.createElement("div");
      text.className = "min-w-44 space-y-1";
      if (point.companyName) {
        const company = document.createElement("div");
        company.className = "font-semibold";
        company.textContent = point.companyName;
        text.append(company);
      }
      if (point.personName) {
        const person = document.createElement("div");
        person.textContent = point.personName;
        text.append(person);
      }
      if (point.personTitle) {
        const title = document.createElement("div");
        title.className = "text-xs text-gray-500";
        title.textContent = point.personTitle;
        text.append(title);
      }
      const address = document.createElement("div");
      address.className = "text-xs text-gray-500";
      address.textContent = point.address;
      text.append(address);
      if (point.displayName) {
        const muted = document.createElement("div");
        muted.style.color = "#6b7280";
        muted.style.fontSize = "11px";
        muted.textContent = point.displayName;
        text.append(muted);
      }
      L.circleMarker([point.lat, point.lon], {
        radius: 8,
        color: "#3500d3",
        fillColor: "#967cff",
        fillOpacity: 0.88,
        weight: 2,
      })
        .bindPopup(text)
        .addTo(layer);
    }
    if (bounds) {
      map.fitBounds([bounds.southWest, bounds.northEast], {
        padding: [40, 40],
        maxZoom: 16,
      });
    }
  }, [points, bounds]);

  return <div ref={containerRef} className="h-full w-full" />;
}

export default function MapPage() {
  const workspaceId = useAuthStore((s) => s.workspace?.id);
  const [tables, setTables] = useState<DataTable[]>([]);
  const [tableId, setTableId] = useState("");
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);
  const [columnId, setColumnId] = useState("");
  const [payload, setPayload] = useState<TableMapPoints | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    tablesService
      .listTables(workspaceId)
      .then((items) => {
        if (cancelled) return;
        const candidate = items[0];
        if (candidate) setTableId(candidate.id);
        setTables(items);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Не удалось загрузить таблицы");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!tableId) return;
    let cancelled = false;
    tablesService
      .listColumns(tableId)
      .then((list) => {
        if (cancelled) return;
        setColumns(list.filter((column) => column.type === "text" || column.type === "enrichment"));
        setColumnId("");
      })
      .catch(() => {
        if (cancelled) return;
        setColumns([]);
        setColumnId("");
      });
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  const loadMap = useCallback(
    (nextTableId: string, nextColumnId: string, explicit: boolean) => {
      if (!nextTableId) return;
      const controller = new AbortController();
      startTransition(() => {
        setMapLoading(true);
        setError(null);
      });
      mapService
        .getTableMap(nextTableId, nextColumnId || undefined, controller.signal)
        .then((result) => {
          setPayload(result);
          if (result.points.length === 0 && result.totalRows > 0) {
            setError(
              explicit
                ? "В выбранной колонке нет адресов, которые удалось определить"
                : "Не удалось определить адреса в этой таблице — выберите колонку с адресами",
            );
          } else {
            setError(null);
          }
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          const apiError = caught instanceof ApiError ? caught : null;
          if (apiError && apiError.code === "MAP_NO_ADDRESS_COLUMN") {
            setError(
              "В таблице нет колонки с адресами — добавьте колонку «Адрес» или импортируйте CSV с адресами",
            );
            setPayload(null);
            return;
          }
          setError(apiError ? apiError.message : "Не удалось построить карту");
          setPayload(null);
        })
        .finally(() => setMapLoading(false));
    },
    [],
  );

  useEffect(() => {
    if (!tableId) return;
    loadMap(tableId, columnId, false);
  }, [tableId, columnId, loadMap]);

  const stats = payload ? sourceLabel(payload.source, payload.geocoded, payload.cached) : null;

  if (loading) {
    return (
      <div className="p-5">
        <h1 className="text-[22px] font-medium tracking-[-0.03em]">Карта контактов</h1>
        <Skeleton className="mt-4 h-96" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-medium tracking-[-0.03em]">Карта контактов</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Геокодирование адресов через Nominatim (OpenStreetMap); результаты кэшируются
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!tableId || mapLoading}
          onClick={() => {
            if (tableId) void loadMap(tableId, columnId, true);
          }}
        >
          <RefreshCw className="size-4" />
          Обновить
        </Button>
      </div>

      {tables.length === 0 ? (
        <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-0">
          <MapIcon className="size-8 text-ink-muted" />
          <p className="text-[13px] text-ink-muted">
            Нет таблиц — создайте таблицу с колонкой адресов
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={tableId} onValueChange={(next) => setTableId(next)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Таблица" />
            </SelectTrigger>
            <SelectContent>
              {tables.map((table) => (
                <SelectItem key={table.id} value={table.id}>
                  {table.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {columns.length > 0 && (
            <Select value={columnId} onValueChange={(next) => setColumnId(next)}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder={payload?.columnName ?? "Колонка адресов"} />
              </SelectTrigger>
              <SelectContent>
                {columns.map((column) => (
                  <SelectItem key={column.id} value={column.id}>
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {stats && (
            <span className="text-[12px] text-ink-muted">
              {stats} · точек: {payload?.resolved ?? 0}
              {payload && payload.unresolved > 0 ? ` · не определено: ${payload.unresolved}` : ""}
            </span>
          )}
          {payload?.geocodeLimitReached && (
            <span className="text-[12px] text-warning">
              Лимит геокодирования на запрос достигнут — обновите позже, остальное подгрузится из кэша
            </span>
          )}
        </div>
      )}

      {error && <p className="text-[13px] text-warning">{error}</p>}

      <div className="relative min-h-96 flex-1 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-0">
        {mapLoading && (
          <div className="absolute inset-0 z-[1000] grid place-items-center bg-surface-0/70 text-[13px] text-ink-muted">
            Загрузка точек…
          </div>
        )}
        {payload && payload.points.length > 0 ? (
          <MapCanvas points={payload.points} />
        ) : !mapLoading && payload === null ? (
          <div className="grid h-full place-items-center">
            {tables.length > 0 && (
              <p className="flex items-center gap-2 text-[13px] text-ink-muted">
                <MapIcon className="size-4" />
                Точек пока нет
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
