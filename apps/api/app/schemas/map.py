import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


MAP_RESPONSE_CONFIG = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class MapColumnOption(BaseModel):
    model_config = MAP_RESPONSE_CONFIG

    id: uuid.UUID
    name: str


class MapPoint(BaseModel):
    model_config = MAP_RESPONSE_CONFIG

    row_id: uuid.UUID
    lat: float
    lon: float
    address: str
    display_name: str | None = None
    company_name: str | None = None
    person_name: str | None = None
    person_title: str | None = None


class MapPointsResponse(BaseModel):
    model_config = MAP_RESPONSE_CONFIG

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
