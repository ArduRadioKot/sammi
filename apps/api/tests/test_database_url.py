from app.core.config import normalize_asyncpg_url


def test_render_postgres_url_uses_asyncpg() -> None:
    url = normalize_asyncpg_url("postgresql://sammi:secret@dpg-abc:5432/sammi")
    assert url == "postgresql+asyncpg://sammi:secret@dpg-abc:5432/sammi"


def test_legacy_postgres_scheme_uses_asyncpg() -> None:
    url = normalize_asyncpg_url("postgres://sammi:secret@localhost:5432/sammi")
    assert url == "postgresql+asyncpg://sammi:secret@localhost:5432/sammi"


def test_existing_asyncpg_url_is_unchanged() -> None:
    url = "postgresql+asyncpg://sammi:change-me@localhost:5432/sammi_test"
    assert normalize_asyncpg_url(url) == url
