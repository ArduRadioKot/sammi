from fastapi import APIRouter, Body, Depends

from app.api.deps import get_current_user
from app.core.errors import AppError
from app.models.user import User
from app.schemas.ai import (
    AIChatRequest,
    AIChatResponse,
    AIModelListResponse,
    AIModelRead,
    AIProviderCheckResponse,
    AIProviderListResponse,
    AIProviderStatus,
    AIProviderTestRequest,
    AIProviderTestResponse,
)
from app.services.ai_providers import AIProviderStatusService, get_ai_registry

router = APIRouter(prefix="/system/ai", tags=["ai"])

ASSISTANT_SYSTEM_PROMPT = """Ты — ИИ-помощник по рабочим задачам внутри CRM Sammi. Отвечай по-русски, если пользователь не попросил другой язык. Помогай анализировать клиентов, готовить встречи и письма, структурировать заметки, планировать следующие шаги и объяснять данные. Не утверждай, что выполнил действие в CRM или получил доступ к данным, которых нет в переписке. Если контекста недостаточно — уточни его. Пиши конкретно и по делу."""


@router.post("/chat", response_model=AIChatResponse)
async def chat(payload: AIChatRequest, _user: User = Depends(get_current_user)) -> AIChatResponse:
    messages = [message.model_dump() for message in payload.messages]
    if any(message["role"] not in {"user", "assistant"} for message in messages):
        raise AppError("AI_CHAT_INVALID_ROLE", "Сообщения должны быть от пользователя или помощника.", 422)
    if messages[-1]["role"] != "user":
        raise AppError("AI_CHAT_INVALID_TURN", "Последнее сообщение должно содержать вопрос.", 422)
    provider = get_ai_registry().get("ollama")
    if provider is None or not provider.is_configured():
        raise AppError("AI_PROVIDER_NOT_CONFIGURED", "Локальная модель Ollama не настроена.", 503)
    if not provider.capabilities().generation:
        raise AppError("AI_PROVIDER_ERROR", "У Ollama отключена генерация.", 501)
    result = await provider.generate(
        model=payload.model,
        messages=messages,
        system=ASSISTANT_SYSTEM_PROMPT,
        temperature=0.35,
    )
    return AIChatResponse(content=result.content, model=result.model, duration_ms=result.duration_ms)


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
