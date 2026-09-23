from app.core.errors import AppError
from app.providers.enrichment.types import EnrichmentProvider, EnrichmentRequest, EnrichmentResult


class EnrichmentProviderMixin:
    provider_id: str

    def _not_configured(self) -> AppError:
        return AppError(
            "ENRICHMENT_PROVIDER_NOT_CONFIGURED",
            f"{self.provider_id} is not configured",
            status_code=400,
        )

    async def enrich(self, request: EnrichmentRequest) -> EnrichmentResult:
        raise self._not_configured()
