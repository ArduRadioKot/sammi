from typing import Any

from pydantic import BaseModel, Field


class AIProviderCapabilities(BaseModel):
    generation: bool = False
    structured_output: bool = False
    tools: bool = False
    streaming: bool = False


class AIProviderStatus(BaseModel):
    id: str
    configured: bool
    available: bool
    capabilities: AIProviderCapabilities = Field(default_factory=AIProviderCapabilities)
    default_model: str | None = None
    endpoint: str | None = None


class AIProviderListResponse(BaseModel):
    providers: list[AIProviderStatus]


class AIProviderCheckResponse(BaseModel):
    id: str
    configured: bool
    available: bool
    error_code: str | None = Field(default=None)


class AIModelRead(BaseModel):
    id: str
    name: str
    provider: str | None = None
    parameter_size: str | None = None
    quantization: str | None = None


class AIModelListResponse(BaseModel):
    items: list[AIModelRead]


class AIProviderTestRequest(BaseModel):
    model: str | None = Field(default=None, max_length=200)


class AIProviderTestResponse(BaseModel):
    provider: str
    model: str
    status: str
    duration_ms: int | None = None


class AIChatMessage(BaseModel):
    role: str
    content: str = Field(min_length=1, max_length=6000)


class AIChatRequest(BaseModel):
    messages: list[AIChatMessage] = Field(min_length=1, max_length=20)
    model: str | None = Field(default=None, max_length=200)


class AIChatResponse(BaseModel):
    content: str
    model: str
    duration_ms: int | None = None
