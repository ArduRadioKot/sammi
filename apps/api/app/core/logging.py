import logging
import re

_PASSWORD_IN_URL = re.compile(r"://([^:/@]+):([^@]+)@")
_configured = False


def redact(value: str) -> str:
    return _PASSWORD_IN_URL.sub(r"://\1:***@", value)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def configure_logging(level: str) -> None:
    global _configured
    if _configured:
        return
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    _configured = True
