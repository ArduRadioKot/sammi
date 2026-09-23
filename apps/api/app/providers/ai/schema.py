from typing import Any

from app.core.errors import AppError


def validate_against_schema(data: Any, schema: dict[str, Any]) -> None:
    schema_type = schema.get("type")
    if schema_type == "object":
        if not isinstance(data, dict):
            raise AppError("AI_STRUCTURED_OUTPUT_INVALID", "Structured output is not an object", status_code=422)
        required = schema.get("required") or []
        for key in required:
            if key not in data:
                raise AppError(
                    "AI_STRUCTURED_OUTPUT_INVALID",
                    f"Structured output is missing required field '{key}'",
                    status_code=422,
                )
        properties = schema.get("properties") or {}
        if isinstance(properties, dict):
            for key, subschema in properties.items():
                if key in data and isinstance(subschema, dict):
                    validate_against_schema(data[key], subschema)
        return
    if schema_type == "array":
        if not isinstance(data, list):
            raise AppError("AI_STRUCTURED_OUTPUT_INVALID", "Structured output is not an array", status_code=422)
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for item in data:
                validate_against_schema(item, item_schema)
        return
    if schema_type == "string" and not isinstance(data, str):
        raise AppError("AI_STRUCTURED_OUTPUT_INVALID", "Structured output field is not a string", status_code=422)
    if schema_type == "integer" and (not isinstance(data, int) or isinstance(data, bool)):
        raise AppError("AI_STRUCTURED_OUTPUT_INVALID", "Structured output field is not an integer", status_code=422)
    if schema_type == "number" and (not isinstance(data, (int, float)) or isinstance(data, bool)):
        raise AppError("AI_STRUCTURED_OUTPUT_INVALID", "Structured output field is not a number", status_code=422)
    if schema_type == "boolean" and not isinstance(data, bool):
        raise AppError("AI_STRUCTURED_OUTPUT_INVALID", "Structured output field is not a boolean", status_code=422)
    if schema_type == "null" and data is not None:
        raise AppError("AI_STRUCTURED_OUTPUT_INVALID", "Structured output field is not null", status_code=422)
