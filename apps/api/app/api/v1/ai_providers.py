from fastapi import APIRouter, Body, Depends

from app.api.deps import get_current_user
from app.core.errors import AppError
from app.models.user import User
from app.schemas.ai import (
    AIModelListResponse,
    AIModelRead,
    AIProviderCheckResponse,
    AIProviderListResponse,
    AIProviderStatus,
    AIProviderTestRequest,
    AIProviderTestResponse,
)
from app.services.ai_providers import AIProviderStatusService

router = APIRouter(prefix="/system/ai", tags=["ai"])


@router.get("/providers", response_model=AIProviderListResponse)
async def list_ai_providers(_user: User = Depends(get_current_user)) -> AIProviderListResponse:
    items = await AIProviderStatusService().list_status()
    return AIProviderListResponse(providers=[AIProviderStatus.model_validate(item) for item in items])


@router.post("/providers/{provider_id}/check", response_model=AIProviderCheckResponse)
async def check_ai_provider(provider_id: str, _user: User = Depends(get_current_user)) -> AIProviderCheckResponse:
    provider, health = await AIProviderStatusService().check(provider_id)
    if not health.available:
        raise AppError(
            health.error_code or "AI_PROVIDER_UNAVAILABLE",
            health.message or "Provider is unavailable",
            status_code=503,
        )
    return AIProviderCheckResponse(
        id=provider.provider_id,
        configured=True,
        available=True,
        error_code=None,
    )


@router.get("/providers/{provider_id}/models", response_model=AIModelListResponse)
async def list_ai_provider_models(provider_id: str, _user: User = Depends(get_current_user)) -> AIModelListResponse:
    models = await AIProviderStatusService().list_models(provider_id)
    return AIModelListResponse(
        items=[
            AIModelRead(
                id=model.id,
                name=model.name,
                provider=model.provider,
                parameter_size=model.parameter_size,
                quantization=model.quantization,
            )
            for model in models
        ]
    )


@router.post("/providers/ollama/test", response_model=AIProviderTestResponse)
async def test_ollama_generation(
    payload: AIProviderTestRequest = Body(default=AIProviderTestRequest()),
    _user: User = Depends(get_current_user),
) -> AIProviderTestResponse:
    result = await AIProviderStatusService().test_generation("ollama", payload.model)
    return AIProviderTestResponse.model_validate(result)
