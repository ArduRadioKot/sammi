from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

logger = get_logger("app.errors")


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


def error_body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details}}


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def _with_request_id(response: JSONResponse, request: Request) -> JSONResponse:
    request_id = _request_id(request)
    if request_id:
        response.headers["X-Request-ID"] = request_id
    return response


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        response = JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.code, exc.message, exc.details),
        )
        return _with_request_id(response, request)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        response = JSONResponse(
            status_code=422,
            content=error_body("INVALID_REQUEST", "Request validation failed", exc.errors()),
        )
        return _with_request_id(response, request)

    @app.exception_handler(StarletteHTTPException)
    async def http_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "NOT_FOUND" if exc.status_code == 404 else "INVALID_REQUEST"
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        response = JSONResponse(status_code=exc.status_code, content=error_body(code, message))
        return _with_request_id(response, request)

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error type=%s", type(exc).__name__)
        response = JSONResponse(
            status_code=500,
            content=error_body("INTERNAL_ERROR", "Internal server error"),
        )
        return _with_request_id(response, request)
