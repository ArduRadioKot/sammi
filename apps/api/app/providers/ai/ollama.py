import json
import time
from typing import Any

import httpx

from app.core.errors import AppError
from app.core.logging import get_logger
from app.providers.ai.base import ProviderMixin, map_http_error
from app.providers.ai.schema import validate_against_schema
from app.providers.ai.types import AIGenerationResult, AIModel, ProviderCapabilities, ProviderHealth

logger = get_logger("app.ai.ollama")
HEALTH_TIMEOUT = httpx.Timeout(2.0, connect=2.0)
TEST_PROMPT = "Ответь одним словом: OK"


class OllamaProvider(ProviderMixin):
    provider_id = "ollama"

    def __init__(
        self,
        base_url: str,
        model: str | None,
        client: httpx.AsyncClient | None = None,
        timeout_seconds: float = 60,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = (model or "").strip() or None
        self._client = client
        self.timeout_seconds = timeout_seconds

    def is_configured(self) -> bool:
        return bool(self.base_url)

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(generation=True, structured_output=True)

    def _generate_timeout(self) -> httpx.Timeout:
        connect = min(10.0, float(self.timeout_seconds))
        return httpx.Timeout(self.timeout_seconds, connect=connect)

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    async def health_check(self) -> ProviderHealth:
        if not self.is_configured():
            return ProviderHealth(False, "AI_PROVIDER_NOT_CONFIGURED", "Ollama is not configured")
        client = self._client or httpx.AsyncClient(timeout=HEALTH_TIMEOUT)
        close = self._client is None
        try:
            response = await client.get(self._url("/api/tags"))
        except httpx.TimeoutException:
            logger.info("provider=ollama operation=health status=timeout")
            return map_http_error(0, timeout=True)
        except httpx.HTTPError as exc:
            logger.info("provider=ollama operation=health status=unavailable type=%s", type(exc).__name__)
            return ProviderHealth(False, "AI_PROVIDER_UNAVAILABLE", "Ollama is unavailable")
        finally:
            if close:
                await client.aclose()
        if response.status_code >= 400:
            logger.info("provider=ollama operation=health status=%s", response.status_code)
            return map_http_error(response.status_code)
        logger.info("provider=ollama operation=health status=ok")
        return ProviderHealth(True)

    async def list_models(self) -> list[AIModel]:
        payload = await self._get_json("/api/tags", operation="list_models")
        models: list[AIModel] = []
        for item in payload.get("models") or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("model") or "").strip()
            if not name:
                continue
            details = item.get("details") if isinstance(item.get("details"), dict) else {}
            models.append(
                AIModel(
                    id=name,
                    name=name,
                    provider="ollama",
                    parameter_size=_optional_str(details.get("parameter_size")),
                    quantization=_optional_str(details.get("quantization_level")),
                )
            )
        return models

    async def generate(
        self,
        *,
        model: str | None = None,
        messages: list[dict[str, str]] | None = None,
        prompt: str | None = None,
        temperature: float | None = None,
        system: str | None = None,
        think: bool | None = None,
        num_predict: int | None = None,
    ) -> AIGenerationResult:
        return await self._chat(
            model=model,
            messages=messages,
            prompt=prompt,
            temperature=temperature,
            system=system,
            think=think,
            num_predict=num_predict,
        )

    async def generate_structured(
        self,
        *,
        json_schema: dict[str, Any],
        model: str | None = None,
        messages: list[dict[str, str]] | None = None,
        prompt: str | None = None,
        temperature: float | None = None,
        system: str | None = None,
        think: bool | None = None,
        num_predict: int | None = None,
    ) -> AIGenerationResult:
        result = await self._chat(
            model=model,
            messages=messages,
            prompt=prompt,
            temperature=temperature,
            system=system,
            response_format=json_schema,
            think=think,
            num_predict=num_predict,
        )
        try:
            parsed = json.loads(result.content)
        except json.JSONDecodeError as exc:
            raise AppError("AI_STRUCTURED_OUTPUT_INVALID", "Model returned invalid JSON", status_code=422) from exc
        if not isinstance(parsed, dict):
            raise AppError("AI_STRUCTURED_OUTPUT_INVALID", "Structured output is not an object", status_code=422)
        validate_against_schema(parsed, json_schema)
        return AIGenerationResult(
            provider=result.provider,
            model=result.model,
            content=result.content,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            duration_ms=result.duration_ms,
            raw_usage=result.raw_usage,
            structured=parsed,
        )

    async def _chat(
        self,
        *,
        model: str | None,
        messages: list[dict[str, str]] | None,
        prompt: str | None,
        temperature: float | None,
        system: str | None,
        response_format: dict[str, Any] | None = None,
        think: bool | None = None,
        num_predict: int | None = None,
    ) -> AIGenerationResult:
        chosen = self._resolve_model(model)
        body: dict[str, Any] = {
            "model": chosen,
            "messages": _build_messages(prompt=prompt, messages=messages, system=system),
            "stream": False,
        }
        options: dict[str, Any] = {}
        if temperature is not None:
            options["temperature"] = temperature
        if num_predict is not None:
            options["num_predict"] = num_predict
        if options:
            body["options"] = options
        if think is not None:
            body["think"] = think
        if response_format is not None:
            body["format"] = response_format
        started = time.perf_counter()
        try:
            payload = await self._post_json("/api/chat", body=body, operation="generate")
        except AppError:
            duration_ms = int((time.perf_counter() - started) * 1000)
            logger.info(
                "provider=ollama operation=generate model=%s status=error duration_ms=%s",
                chosen,
                duration_ms,
            )
            raise
        duration_ms = int((time.perf_counter() - started) * 1000)
        message = payload.get("message") if isinstance(payload.get("message"), dict) else {}
        content = message.get("content")
        if not isinstance(content, str):
            content = ""
        prompt_tokens = _optional_int(payload.get("prompt_eval_count"))
        completion_tokens = _optional_int(payload.get("eval_count"))
        logger.info(
            "provider=ollama operation=generate model=%s status=ok duration_ms=%s",
            chosen,
            duration_ms,
        )
        return AIGenerationResult(
            provider="ollama",
            model=str(payload.get("model") or chosen),
            content=content,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            duration_ms=duration_ms,
            raw_usage={
                "prompt_eval_count": prompt_tokens,
                "eval_count": completion_tokens,
            },
        )

    def _resolve_model(self, model: str | None) -> str:
        chosen = (model or "").strip() or self.model
        if not chosen:
            raise AppError("AI_MODEL_NOT_FOUND", "No Ollama model selected", status_code=400)
        return chosen

    async def _get_json(self, path: str, *, operation: str) -> dict[str, Any]:
        return await self._request("GET", path, operation=operation)

    async def _post_json(self, path: str, *, body: dict[str, Any], operation: str) -> dict[str, Any]:
        return await self._request("POST", path, operation=operation, json_body=body)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        operation: str,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self.is_configured():
            raise AppError("AI_PROVIDER_NOT_CONFIGURED", "Ollama is not configured", status_code=400)
        timeout = HEALTH_TIMEOUT if operation in {"list_models", "health"} else self._generate_timeout()
        client = self._client or httpx.AsyncClient(timeout=timeout)
        close = self._client is None
        try:
            response = await client.request(method, self._url(path), json=json_body)
        except httpx.TimeoutException as exc:
            logger.info("provider=ollama operation=%s status=timeout", operation)
            raise AppError("AI_PROVIDER_TIMEOUT", "Ollama request timed out", status_code=504) from exc
        except httpx.HTTPError as exc:
            logger.info("provider=ollama operation=%s status=unavailable type=%s", operation, type(exc).__name__)
            raise AppError("AI_PROVIDER_UNAVAILABLE", "Ollama is unavailable", status_code=503) from exc
        finally:
            if close:
                await client.aclose()
        if response.status_code >= 400:
            raise _error_from_response(response, operation)
        try:
            payload = response.json()
        except json.JSONDecodeError as exc:
            raise AppError("AI_GENERATION_FAILED", "Ollama returned a non-JSON response", status_code=502) from exc
        if not isinstance(payload, dict):
            raise AppError("AI_GENERATION_FAILED", "Ollama returned an unexpected payload", status_code=502)
        return payload


def _build_messages(
    *,
    prompt: str | None,
    messages: list[dict[str, str]] | None,
    system: str | None,
) -> list[dict[str, str]]:
    built = [item for item in (messages or []) if item.get("role") and item.get("content") is not None]
    if prompt:
        built.append({"role": "user", "content": prompt})
    if system:
        built = [{"role": "system", "content": system}, *built]
    if not built:
        raise AppError("INVALID_REQUEST", "Generation requires messages or a prompt", status_code=400)
    return built


def _error_from_response(response: httpx.Response, operation: str) -> AppError:
    message = ""
    try:
        payload = response.json()
        if isinstance(payload, dict):
            message = str(payload.get("error") or payload.get("message") or "")
    except json.JSONDecodeError:
        message = response.text[:200]
    lowered = message.lower()
    if operation == "list_models":
        return AppError("AI_PROVIDER_UNAVAILABLE", "Ollama is unavailable", status_code=503)
    if response.status_code == 404 or "not found" in lowered or "does not exist" in lowered:
        return AppError("AI_MODEL_NOT_FOUND", "Ollama model is not installed", status_code=404)
    if response.status_code in {401, 403}:
        return AppError("AI_PROVIDER_AUTH_FAILED", "Ollama authentication failed", status_code=502)
    if operation == "list_models":
        return AppError("AI_PROVIDER_UNAVAILABLE", "Ollama is unavailable", status_code=503)
    return AppError("AI_GENERATION_FAILED", "Ollama generation failed", status_code=502)


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _optional_int(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return int(value)
