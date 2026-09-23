"""Hard guard: destructive pytest fixtures must never touch a development database."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

TEST_DB_NAMES = {"sammi_test"}
_REPO_ENV = Path(__file__).resolve().parents[3] / ".env"


def database_name_from_url(url: str) -> str:
    normalized = url.replace("postgresql+asyncpg://", "postgresql://", 1).replace(
        "postgresql+psycopg://", "postgresql://", 1
    )
    parsed = urlparse(normalized)
    return (parsed.path or "").lstrip("/").split("?")[0]


def is_test_database_name(name: str) -> bool:
    return name in TEST_DB_NAMES or name.endswith("_test")


def rewrite_docker_hostname(url: str) -> str:
    """Host pytest cannot resolve Compose hostname `db`; map it to localhost."""
    return url.replace("@db:", "@localhost:")


def _read_dotenv_value(key: str) -> str:
    if not _REPO_ENV.exists():
        return ""
    prefix = f"{key}="
    for raw in _REPO_ENV.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith(prefix) and not line.startswith("#"):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def assert_safe_to_destroy_data(*, url: str | None = None) -> str:
    env = os.environ.get("APP_ENV", "").strip().lower()
    if env != "test":
        raise RuntimeError("Destructive test fixtures require APP_ENV=test")
    resolved = (url or os.environ.get("DATABASE_URL") or "").strip()
    if not resolved:
        raise RuntimeError("DATABASE_URL is not set for tests")
    name = database_name_from_url(resolved)
    if not is_test_database_name(name):
        raise RuntimeError(
            f"Refusing destructive SQL against non-test database '{name}'. "
            "Set TEST_DATABASE_URL to a database named sammi_test (or ending in _test)."
        )
    return name


def require_test_database_url() -> str:
    test_url = os.environ.get("TEST_DATABASE_URL", "").strip() or _read_dotenv_value("TEST_DATABASE_URL")
    if not test_url:
        raise RuntimeError(
            "TEST_DATABASE_URL is required. Tests must not fall back to DATABASE_URL. "
            "Create PostgreSQL database sammi_test and set "
            "TEST_DATABASE_URL=postgresql+asyncpg://sammi:change-me@localhost:5432/sammi_test"
        )
    name = database_name_from_url(test_url)
    if not is_test_database_name(name):
        raise RuntimeError(
            f"TEST_DATABASE_URL points at '{name}', which is not a test database. "
            "Use sammi_test or a name ending in _test."
        )
    return rewrite_docker_hostname(test_url)
