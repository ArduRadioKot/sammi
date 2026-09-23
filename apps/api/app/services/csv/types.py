from dataclasses import dataclass, field
from typing import Any


DELIMITER_NAMES = {
    "comma": ",",
    ",": ",",
    "semicolon": ";",
    ";": ";",
    "tab": "\t",
    "\t": "\t",
}

DELIMITER_LABELS = {",": "comma", ";": "semicolon", "\t": "tab"}

CSV_CREATE_TYPES = {"text", "number", "boolean", "date", "url", "email", "phone"}

INFERABLE_TYPES = ("text", "number", "boolean", "date", "email", "url", "phone")


def normalize_delimiter(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    mapped = DELIMITER_NAMES.get(value)
    if mapped is None:
        mapped = DELIMITER_NAMES.get(value.lower())
    if mapped is None:
        raise ValueError(value)
    return mapped


def delimiter_label(character: str) -> str:
    return DELIMITER_LABELS.get(character, character)


@dataclass
class ParsedHeader:
    index: int
    name: str
    original: str
    suggested_type: str = "text"


@dataclass
class ParsedCsv:
    filename: str
    encoding: str
    delimiter: str
    signature: str
    headers: list[ParsedHeader]
    rows: list[list[str]]
    warnings: list[str] = field(default_factory=list)

    @property
    def row_count(self) -> int:
        return len(self.rows)


@dataclass
class MappingColumn:
    csv_index: int
    action: str
    name: str | None = None
    type: str | None = None
    column_id: str | None = None


@dataclass
class ImportPlan:
    columns: list[MappingColumn]


@dataclass
class ImportResult:
    table_id: Any
    table_name: str
    rows_imported: int
    columns_created: int
    columns_mapped: int
    columns_skipped: int
    column_count: int
