from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


SUCCESS = "success"
NOT_FOUND = "not_found"
NO_VALUE = "no_value"
ERROR = "error"
SKIPPED = "skipped"

COMPANY_BY_IDENTIFIER = "company_by_identifier"

OUTPUT_FIELDS: tuple[dict[str, str], ...] = (
    {"id": "company_name", "label": "Название компании"},
    {"id": "company_short_name", "label": "Короткое название"},
    {"id": "inn", "label": "ИНН"},
    {"id": "kpp", "label": "КПП"},
    {"id": "ogrn", "label": "ОГРН"},
    {"id": "status", "label": "Статус"},
    {"id": "address", "label": "Адрес"},
    {"id": "management_name", "label": "Руководитель"},
    {"id": "management_post", "label": "Должность руководителя"},
    {"id": "okved", "label": "ОКВЭД"},
    {"id": "revenue", "label": "Выручка"},
)

OUTPUT_FIELD_IDS = tuple(item["id"] for item in OUTPUT_FIELDS)

STATUS_LABELS = {
    "ACTIVE": "Действующая",
    "LIQUIDATING": "Ликвидируется",
    "LIQUIDATED": "Ликвидирована",
    "BANKRUPT": "Банкротство",
    "REORGANIZING": "Реорганизация",
}


@dataclass(frozen=True)
class EnrichmentField:
    id: str
    label: str


@dataclass(frozen=True)
class EnrichmentOperation:
    id: str
    label: str
    inputs: tuple[str, ...]
    outputs: tuple[EnrichmentField, ...]
    credits_per_success: int


@dataclass(frozen=True)
class ProviderCapabilities:
    operations: tuple[EnrichmentOperation, ...] = ()


@dataclass(frozen=True)
class EnrichmentRequest:
    operation: str
    input: dict[str, Any]
    requested_field: str
    context: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EnrichmentResult:
    status: str
    data: dict[str, Any] = field(default_factory=dict)
    value: Any = None
    provider: str = ""
    operation: str = ""
    source: str = ""
    confidence: float | None = None
    error_code: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] | None = None


class EnrichmentProvider(Protocol):
    provider_id: str
    display_name: str
    region: str

    def configured(self) -> bool: ...

    def capabilities(self) -> ProviderCapabilities: ...

    async def health_check(self) -> tuple[bool | None, str | None]: ...

    async def enrich(self, request: EnrichmentRequest) -> EnrichmentResult: ...


def mask_identifier(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 4:
        return "***"
    return f"{value[:2]}***{value[-2:]}"


def identifier_to_text(value: Any) -> str | None:
    if value is None or value is False:
        return None
    if value is True:
        return None
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return None
    text = str(value).strip()
    return text or None
