from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.geocode import GeocodeCache
from app.models.user import utc_now


class GeocodeCacheRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_many(self, query_hashes: list[str]) -> dict[str, GeocodeCache]:
        if not query_hashes:
            return {}
        result = await self.session.scalars(
            select(GeocodeCache).where(GeocodeCache.query_hash.in_(query_hashes))
        )
        return {item.query_hash: item for item in result}

    async def upsert(self, **kwargs: Any) -> GeocodeCache:
        statement = insert(GeocodeCache).values(**kwargs)
        update_columns = {
            column: getattr(statement.excluded, column)
            for column in ("lat", "lon", "display_name", "provider")
        }
        statement = statement.on_conflict_do_update(
            index_elements=[GeocodeCache.query_hash],
            set_={**update_columns, "created_at": utc_now()},
        )
        result = await self.session.scalars(
            statement.returning(GeocodeCache),
        )
        return result.one()

    async def commit(self) -> None:
        await self.session.commit()
