import json
import os

import httpx
import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from app.core.errors import AppError
from app.providers.ai.gigachat import GigaChatProvider
from app.providers.ai.ollama import OllamaProvider
from app.providers.ai.registry import AIProviderRegistry
from app.providers.ai.yandex import YandexProvider
from app.providers.ai.base import ProviderMixin


@pytest.mark.asyncio
async def test_ollama_health_ok() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/api/tags")
        return httpx.Response(200, json={"models": []})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", None, client=client)
    health = await provider.health_check()
    assert health.available is True


@pytest.mark.asyncio
async def test_ollama_health_unavailable() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", None, client=client)
    health = await provider.health_check()
    assert health.available is False
    assert health.error_code == "AI_PROVIDER_UNAVAILABLE"


@pytest.mark.asyncio
async def test_ollama_timeout() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", None, client=client)
    health = await provider.health_check()
    assert health.available is False
    assert health.error_code == "AI_PROVIDER_TIMEOUT"


@pytest.mark.asyncio
async def test_ollama_list_models_normalized() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/api/tags")
        return httpx.Response(
            200,
            json={
                "models": [
                    {
                        "name": "qwen2.5:7b",
                        "details": {"parameter_size": "7B", "quantization_level": "Q4_K_M"},
                    }
                ]
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", None, client=client)
    models = await provider.list_models()
    assert models[0].id == "qwen2.5:7b"
    assert models[0].provider == "ollama"
    assert models[0].parameter_size == "7B"
    assert models[0].quantization == "Q4_K_M"


@pytest.mark.asyncio
async def test_ollama_generate_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/api/chat")
        body = json.loads(request.content.decode())
        assert body["stream"] is False
        assert body["model"] == "demo"
        assert body["messages"][-1]["content"] == "ping"
        return httpx.Response(
            200,
            json={
                "model": "demo",
                "message": {"role": "assistant", "content": "OK", "thinking": "hidden"},
                "prompt_eval_count": 4,
                "eval_count": 1,
            },
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", "demo", client=client)
    result = await provider.generate(prompt="ping")
    assert result.provider == "ollama"
    assert result.model == "demo"
    assert result.content == "OK"
    assert "hidden" not in result.content
    assert result.prompt_tokens == 4
    assert result.completion_tokens == 1


@pytest.mark.asyncio
async def test_ollama_generate_timeout() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", "demo", client=client)
    with pytest.raises(AppError) as error:
        await provider.generate(prompt="ping")
    assert error.value.code == "AI_PROVIDER_TIMEOUT"


@pytest.mark.asyncio
async def test_ollama_model_not_found() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "model 'missing' not found"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", "missing", client=client)
    with pytest.raises(AppError) as error:
        await provider.generate(prompt="ping")
    assert error.value.code == "AI_MODEL_NOT_FOUND"


@pytest.mark.asyncio
async def test_ollama_structured_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode())
        assert body["format"]["required"] == ["status"]
        return httpx.Response(
            200,
            json={"model": "demo", "message": {"role": "assistant", "content": '{"status":"ok"}'}},
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", "demo", client=client)
    result = await provider.generate_structured(
        prompt="верни status = ok",
        json_schema={
            "type": "object",
            "properties": {"status": {"type": "string"}},
            "required": ["status"],
        },
    )
    assert result.structured == {"status": "ok"}


@pytest.mark.asyncio
async def test_ollama_structured_invalid_json() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"model": "demo", "message": {"role": "assistant", "content": "not-json"}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OllamaProvider("http://ollama.test", "demo", client=client)
    with pytest.raises(AppError) as error:
        await provider.generate_structured(
            prompt="bad",
            json_schema={"type": "object", "properties": {"status": {"type": "string"}}, "required": ["status"]},
        )
    assert error.value.code == "AI_STRUCTURED_OUTPUT_INVALID"


@pytest.mark.asyncio
async def test_yandex_generation_not_implemented() -> None:
    provider = YandexProvider("key", "folder", "https://ai.api.cloud.yandex.net/v1", None)
    with pytest.raises(AppError) as error:
        await provider.generate(prompt="hi")
    assert error.value.status_code == 501


@pytest.mark.asyncio
async def test_yandex_unconfigured() -> None:
    provider = YandexProvider("", "", "https://ai.api.cloud.yandex.net/v1", None)
    assert provider.is_configured() is False
    health = await provider.health_check()
    assert health.error_code == "AI_PROVIDER_NOT_CONFIGURED"


@pytest.mark.asyncio
async def test_yandex_auth_failed() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorized"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = YandexProvider("key", "folder", "https://ai.api.cloud.yandex.net/v1", None, client=client)
    health = await provider.health_check()
    assert health.available is False
    assert health.error_code == "AI_PROVIDER_AUTH_FAILED"


@pytest.mark.asyncio
async def test_gigachat_token_is_cached() -> None:
    calls = {"oauth": 0, "models": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/oauth"):
            calls["oauth"] += 1
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 1800})
        calls["models"] += 1
        return httpx.Response(200, json={"data": []})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = GigaChatProvider(
        "auth-key",
        "GIGACHAT_API_PERS",
        "https://api.giga.chat",
        "https://auth.example/oauth",
        None,
        client=client,
    )
    first = await provider.health_check()
    second = await provider.health_check()
    assert first.available and second.available
    assert calls["oauth"] == 1
    assert calls["models"] == 2


@pytest.mark.asyncio
async def test_ai_providers_require_auth(client: AsyncClient) -> None:
    denied = await client.get("/api/v1/system/ai/providers")
    assert denied.status_code == 401
    assert denied.json()["error"]["code"] == "UNAUTHORIZED"
    models = await client.get("/api/v1/system/ai/providers/ollama/models")
    assert models.status_code == 401
    test = await client.post("/api/v1/system/ai/providers/ollama/test", json={})
    assert test.status_code == 401


def test_registry_known_providers() -> None:
    registry = AIProviderRegistry(get_settings())
    assert registry.get("ollama") is not None
    assert registry.get("yandex") is not None
    assert registry.get("gigachat") is not None
    assert [item.provider_id for item in registry.list()] == ["ollama", "yandex", "gigachat"]
    assert registry.get("missing") is None
    assert registry.get("yandex").is_configured() is False
    assert registry.get("gigachat").is_configured() is False
    ollama = registry.get("ollama")
    assert ollama is not None
    assert ollama.capabilities().generation is True
    assert ollama.capabilities().structured_output is True
    assert isinstance(registry.get("yandex"), ProviderMixin)
    assert registry.get("yandex").capabilities().generation is False


@pytest.mark.ollama
@pytest.mark.asyncio
async def test_live_ollama_structured_if_enabled() -> None:
    if os.environ.get("OLLAMA_INTEGRATION_TEST") != "true":
        pytest.skip("OLLAMA_INTEGRATION_TEST is not enabled")
    base = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    provider = OllamaProvider(base, os.environ.get("OLLAMA_MODEL") or None)
    health = await provider.health_check()
    if not health.available:
        pytest.skip("local Ollama is unavailable")
    models = await provider.list_models()
    if not models:
        pytest.skip("no Ollama models installed")
    result = await provider.generate_structured(
        model=models[0].id,
        prompt='Верни JSON со status = "ok".',
        json_schema={
            "type": "object",
            "properties": {"status": {"type": "string"}},
            "required": ["status"],
        },
    )
    assert result.structured is not None
    assert "status" in result.structured
