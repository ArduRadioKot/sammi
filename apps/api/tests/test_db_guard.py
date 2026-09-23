import pytest

from tests.db_guard import assert_safe_to_destroy_data, database_name_from_url, require_test_database_url


def test_require_test_database_url_rejects_development_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql+asyncpg://sammi:change-me@localhost:5432/sammi")
    with pytest.raises(RuntimeError, match="not a test database"):
        require_test_database_url()


def test_assert_safe_to_destroy_data_rejects_sammi() -> None:
    with pytest.raises(RuntimeError, match="non-test database"):
        assert_safe_to_destroy_data(url="postgresql+asyncpg://sammi:change-me@localhost:5432/sammi")


def test_test_database_url_is_isolated() -> None:
    url = require_test_database_url()
    name = database_name_from_url(url)
    assert name.endswith("_test")
    assert_safe_to_destroy_data(url=url)
    assert name != "sammi"
