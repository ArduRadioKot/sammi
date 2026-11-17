from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ENV = Path(__file__).resolve().parents[4] / ".env"


def normalize_asyncpg_url(value: str) -> str:
    """Accept Render's postgresql:// URL and the local postgresql+asyncpg:// URL."""
    url = value.strip()
    scheme, separator, rest = url.partition("://")
    if separator and scheme in {"postgres", "postgresql"}:
        return f"postgresql+asyncpg://{rest}"
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_REPO_ENV, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str
    secret_key: str
    cors_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"
    log_level: str = "INFO"
    app_name: str = Field(default="Sammi API")
    access_token_expire_minutes: int = 10080

    credits_initial_grant: int = Field(default=1000, ge=0)

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = ""
    ollama_timeout_seconds: float = Field(default=60, gt=0)

    yandex_ai_api_key: str = ""
    yandex_ai_project_id: str = ""
    yandex_ai_base_url: str = "https://ai.api.cloud.yandex.net/v1"
    yandex_ai_model: str = ""

    gigachat_auth_key: str = ""
    gigachat_scope: str = "GIGACHAT_API_PERS"
    gigachat_base_url: str = "https://api.giga.chat"
    gigachat_auth_url: str = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    gigachat_model: str = ""
    gigachat_verify_ssl: bool = True

    csv_max_file_size_mb: int = 10
    csv_max_rows: int = 10000
    csv_preview_rows: int = 20

    dadata_api_key: str = ""
    dadata_base_url: str = "https://suggestions.dadata.ru/suggestions/api/4_1/rs"
    dadata_timeout_seconds: float = Field(default=15, gt=0)
    dadata_company_lookup_credits: int = Field(default=1, ge=0)

    geocoding_base_url: str = "https://nominatim.openstreetmap.org"
    geocoding_user_agent: str = "sammi-beta/0.1 (beta contact map)"
    geocoding_timeout_seconds: float = Field(default=10, gt=0)
    geocoding_max_requests: int = Field(default=25, ge=0)

    enrichment_sync_max_rows: int = Field(default=50, ge=1)
    enrichment_provider_concurrency: int = Field(default=5, ge=1)
    enrichment_store_raw_responses: bool = False

    @field_validator("database_url")
    @classmethod
    def use_async_driver(cls, value: str) -> str:
        return normalize_asyncpg_url(value)

    @field_validator("app_env")
    @classmethod
    def normalize_env(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("secret_key")
    @classmethod
    def reject_placeholder_secret(cls, value: str, info) -> str:
        env = str(info.data.get("app_env", "development")).lower()
        if env == "production" and value.strip() in {"", "change-me", "change-me-in-production"}:
            raise ValueError("SECRET_KEY must be set to a real value in production")
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [item.strip() for item in self.cors_origins.split(",") if item.strip()]
        if self.app_env == "production" and (not origins or "*" in origins):
            raise ValueError("CORS_ORIGINS must be an explicit list in production")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
