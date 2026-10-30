from __future__ import annotations

import asyncio
import hashlib
import time
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.models.table import TableColumn, TableRow
from app.models.user import User
from app.repositories.geocode import GeocodeCacheRepository
from app.providers.geocoding.nominatim import NominatimGeocodingProvider
from app.schemas.map import MapColumnOption, MapPoint, MapPointsResponse
from app.services.table import TableAccess, TableService

logger = get_logger("app.map")

QUERY_BATCH_ROW_LIMIT = 1000
NOMINATIM_MIN_INTERVAL_SECONDS = 1.05

_ADDRESS_NAME_TOKENS = ("адрес", "address", "адр")
_OUTPUT_FIELD_ADDRESS = "address"


class MapColumnNotMappableError(AppError):
    def __init__(self) -> None:
        super().__init__(
            "MAP_COLUMN_NOT_MAPPABLE",
            "Only text or enrichment columns can be mapped",
            status_code=400,
        )


def _cell_text(value: Any) -> str | None:
    if value is None or isinstance(value, (dict, list, bool)):
        return None
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        text = value.strip()
        return text or None
    return None


def _address_column_score(column: TableColumn) -> int:
    if column.type == "enrichment" and column.config.get("output_field") == _OUTPUT_FIELD_ADDRESS:
        return 100
    name = column.name.strip().lower()
    if name in _ADDRESS_NAME_TOKENS:
        return 50
    if any(token in name for token in _ADDRESS_NAME_TOKENS):
        return 30
    if column.type == "enrichment":
        return 1
    return 0


def _query_hash(query: str) -> str:
    normalized = " ".join(query.strip().lower().split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


class MapService:
    """Build map points for a table by geocoding one address column."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        provider: NominatimGeocodingProvider | None = None,
    ) -> None:
        self.session = session
        self.settings = get_settings()
        self.provider = provider or NominatimGeocodingProvider(
            base_url=self.settings.geocoding_base_url,
            user_agent=self.settings.geocoding_user_agent,
            timeout_seconds=self.settings.geocoding_timeout_seconds,
            max_requests=self.settings.geocoding_max_requests,
        )
        self._rate_lock = asyncio.Lock()
        self._last_request_at = 0.0

    async def points(
        self,
        table_id: uuid.UUID,
        user: User,
        *,
        column_id: uuid.UUID | None = None,
    ) -> MapPointsResponse:
        table, columns, _, _ = await TableService(self.session).get(table_id, user)
        column = self._resolve_column(columns, column_id)

        rows, total = await TableAccess(self.session).rows.list_for_table(
            table.id, limit=QUERY_BATCH_ROW_LIMIT, offset=0
        )

        row_queries = self._collect_row_queries(rows, column)
        points, geocoded, cached, unresolved, limit_reached = await self._resolve_points(
            row_queries
        )
        return MapPointsResponse(
            table_id=table.id,
            column_id=column.id,
            column_name=column.name,
            points=points,
            total_rows=total,
            resolved=len(points),
            unresolved=unresolved,
            geocoded=geocoded,
            cached=cached,
            geocode_limit_reached=limit_reached,
            source=self._source(geocoded, cached),
        )

    def column_options(self, columns: list[TableColumn]) -> list[MapColumnOption]:
        options = []
        for column in columns:
            if column.type not in ("text", "enrichment"):
                continue
            if _address_column_score(column) <= 0:
                continue
            options.append(MapColumnOption(id=column.id, name=column.name))
        return options

    def _resolve_column(
        self, columns: list[TableColumn], column_id: uuid.UUID | None
    ) -> TableColumn:
        if column_id is not None:
            for column in columns:
                if column.id == column_id:
                    if column.type not in ("text", "enrichment"):
                        raise MapColumnNotMappableError()
                    return column
            raise AppError("MAP_COLUMN_NOT_FOUND", "Column not found", status_code=404)
        best: TableColumn | None = None
        best_score = 0
        for column in columns:
            if column.type not in ("text", "enrichment"):
                continue
            score = _address_column_score(column)
            if score > best_score:
                best, best_score = column, score
        if best is None:
            raise AppError(
                "MAP_NO_ADDRESS_COLUMN",
                "Table has no address-like column",
                status_code=400,
            )
        return best

    def _collect_row_queries(
        self, rows: list[TableRow], column: TableColumn
    ) -> list[tuple[TableRow, str]]:
        column_id_text = str(column.id)
        row_queries: list[tuple[TableRow, str]] = []
        for row in rows:
            query = _cell_text(row.data.get(column_id_text))
            if query:
                row_queries.append((row, query))
        return row_queries

    async def _resolve_points(
        self,
        row_queries: list[tuple[TableRow, str]],
    ) -> tuple[list[MapPoint], int, int, int, bool]:
        if not row_queries:
            return [], 0, 0, 0, False

        repository = GeocodeCacheRepository(self.session)
        queries = {query for _, query in row_queries}
        cached_entries = await repository.get_many([_query_hash(query) for query in queries])

        misses = [query for query in queries if _query_hash(query) not in cached_entries]
        allowed = self.provider.max_requests()
        limit_reached = len(misses) > allowed
        to_geocode = misses if not limit_reached else misses[:allowed]

        geocoded = 0
        for query in to_geocode:
            match = await self._geocode_rate_limited(query)
            if match is None:
                continue
            lat, lon, display_name = match
            await repository.upsert(
                query_hash=_query_hash(query),
                query=query,
                lat=lat,
                lon=lon,
                display_name=display_name,
                provider=self.provider.provider_id,
            )
            await repository.commit()
            geocoded += 1

        refreshed = await repository.get_many([_query_hash(query) for query in queries])
        unresolved = len(row_queries) - sum(
            1 for _, query in row_queries if _query_hash(query) in refreshed
        )

        points: list[MapPoint] = []
        for row, query in row_queries:
            entry = refreshed.get(_query_hash(query))
            if entry is None:
                continue
            points.append(
                MapPoint(
                    row_id=row.id,
                    lat=entry.lat,
                    lon=entry.lon,
                    address=query,
                    display_name=entry.display_name,
                )
            )
        cache_hits = sum(1 for query in queries if _query_hash(query) in cached_entries)
        return points, geocoded, cache_hits, unresolved, limit_reached

    async def _geocode_rate_limited(self, query: str):
        async with self._rate_lock:
            delay = NOMINATIM_MIN_INTERVAL_SECONDS - (time.monotonic() - self._last_request_at)
            if delay > 0:
                await asyncio.sleep(delay)
            try:
                match = await self.provider.geocode(query)
            finally:
                self._last_request_at = time.monotonic()
        return match

    def _source(self, geocoded: int, cached: int) -> str | None:
        if geocoded:
            return "geocoded"
        if cached:
            return "cache"
        return None
