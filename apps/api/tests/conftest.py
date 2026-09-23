import os

os.environ["APP_ENV"] = "test"
os.environ.setdefault("SECRET_KEY", "test-secret")

from tests.db_guard import require_test_database_url

os.environ["DATABASE_URL"] = require_test_database_url()

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.main import app
from tests.db_guard import assert_safe_to_destroy_data

get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _guard_test_database() -> None:
    assert_safe_to_destroy_data()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http
