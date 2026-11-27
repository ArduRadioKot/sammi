from fastapi import APIRouter

from app.api.v1.ai_providers import router as ai_providers_router
from app.api.v1.assistant import router as assistant_router
from app.api.v1.auth import router as auth_router
from app.api.v1.credits import dev_router as credits_dev_router
from app.api.v1.credits import router as credits_router
from app.api.v1.health import router as health_router
from app.api.v1.csv import router as csv_router
from app.api.v1.enrichment import router as enrichment_router
from app.api.v1.integrations import router as integrations_router
from app.api.v1.map import router as map_router
from app.api.v1.relationship import router as relationship_router
from app.api.v1.tables import router as tables_router
from app.api.v1.workspaces import router as workspaces_router
from app.core.config import get_settings

router = APIRouter()
router.include_router(health_router, tags=["health"])
router.include_router(auth_router)
router.include_router(workspaces_router)
router.include_router(credits_router)
router.include_router(ai_providers_router)
router.include_router(assistant_router)
router.include_router(tables_router)
router.include_router(map_router)
router.include_router(csv_router)
router.include_router(enrichment_router)
router.include_router(integrations_router)
router.include_router(relationship_router)
if get_settings().app_env == "development":
    router.include_router(credits_dev_router)
