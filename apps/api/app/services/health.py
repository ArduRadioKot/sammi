from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.logging import get_logger, redact

logger = get_logger("app.health")


class HealthService:
    async def assert_database(self, session: AsyncSession) -> None:
        try:
            await session.execute(text("SELECT 1"))
        except Exception as exc:
            logger.error("database check failed type=%s detail=%s", type(exc).__name__, redact(str(exc)))
            raise AppError(
                "DATABASE_UNAVAILABLE",
                "Database is unavailable",
                status_code=503,
            ) from exc


health_service = HealthService()
