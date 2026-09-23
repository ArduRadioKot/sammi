import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import get_settings
from app.core.errors import AppError

ALGORITHM = "HS256"


def create_access_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def parse_access_token(token: str) -> uuid.UUID:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise AppError("INVALID_TOKEN", "Token has expired", status_code=401) from exc
    except jwt.InvalidTokenError as exc:
        raise AppError("INVALID_TOKEN", "Invalid token", status_code=401) from exc

    subject = payload.get("sub")
    try:
        return uuid.UUID(str(subject))
    except (ValueError, TypeError) as exc:
        raise AppError("INVALID_TOKEN", "Invalid token", status_code=401) from exc
