import uuid
from typing import Literal

from pydantic import BaseModel, Field


class MapColumnOption(BaseModel):
    id: uuid.UUID
    name: str


class MapPoint(BaseModel):
    row_id: uuid.UUID
    lat: float
    lon: float
    address: str
    display_name: str | None = None


class MapPointsResponse(BaseModel):
    table_id: uuid.UUID
    column_id: uuid.UUID
    column_name: str
    points: list[MapPoint] = Field(default_factory=list)
    total_rows: int
    resolved: int
    unresolved: int
    geocoded: int
    cached: int
    geocode_limit_reached: bool
    source: Literal["geocoded", "cache"] | None = None
