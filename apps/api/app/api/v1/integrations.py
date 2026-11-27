import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.models.user import User
from app.services.relationship import web_search
from app.services.relationship.publications import PublicationError

router = APIRouter(prefix="/system/integrations", tags=["integrations"])


class SearchStatus(BaseModel):
    configured: bool
    available: bool | None = None
    results: int | None = None
    message: str | None = None
    provider: str | None = None


@router.get("/search", response_model=SearchStatus)
async def search_status(_user: User = Depends(get_current_user)) -> SearchStatus:
    try:
        web_search.search_endpoint()
    except PublicationError as exc:
        return SearchStatus(configured=False, message=str(exc))
    return SearchStatus(configured=True)


@router.post("/search/check", response_model=SearchStatus)
async def check_search(_user: User = Depends(get_current_user)) -> SearchStatus:
    try:
        endpoint = web_search.search_endpoint()
    except PublicationError as exc:
        return SearchStatus(configured=False, available=False, message=str(exc))
    async with httpx.AsyncClient(timeout=web_search.TIMEOUT_SECONDS, trust_env=False) as client:
        result = await web_search.check(client, endpoint)
    provider = result.results[0].provider if result.results else None
    message = "SearXNG не вернул ссылки. Ответил резервный поиск Wikipedia." if provider == "wikipedia" else result.error
    return SearchStatus(configured=True, available=bool(result.results), results=len(result.results), provider=provider,
                        message=message or (None if result.results else "Движок ответил без результатов."))
