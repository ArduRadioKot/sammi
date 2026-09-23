from app.core.config import Settings
from app.providers.enrichment.dadata import DaDataEnrichmentProvider
from app.providers.enrichment.types import EnrichmentProvider

PROVIDER_ORDER = ("dadata",)


class EnrichmentProviderRegistry:
    def __init__(self, settings: Settings, *, providers: dict[str, EnrichmentProvider] | None = None) -> None:
        self._providers: dict[str, EnrichmentProvider] = providers or {
            "dadata": DaDataEnrichmentProvider(
                api_key=settings.dadata_api_key,
                base_url=settings.dadata_base_url,
                timeout_seconds=settings.dadata_timeout_seconds,
                credits_per_success=settings.dadata_company_lookup_credits,
                store_raw=settings.enrichment_store_raw_responses,
            )
        }

    def get(self, provider_id: str) -> EnrichmentProvider | None:
        return self._providers.get(provider_id)

    def list(self) -> list[EnrichmentProvider]:
        return [self._providers[key] for key in PROVIDER_ORDER if key in self._providers]
