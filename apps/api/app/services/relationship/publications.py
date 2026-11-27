import asyncio
import re
import socket
from contextlib import aclosing
from dataclasses import dataclass
from datetime import date
from ipaddress import IPv6Address, ip_address, ip_network
from urllib.parse import urlsplit

import httpx

from app.core.errors import AppError
from app.services.relationship.text import MAX_FILE_BYTES, read_document, read_public_html, safe_url

MAX_REMOTE_PUBLICATIONS = 40
DOWNLOAD_CONCURRENCY = 4
DOWNLOAD_TIMEOUT = 12
MAX_SEARCH_PUBLICATIONS = 60
MAX_REDIRECTS = 3
DOMAIN = re.compile(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?")
PUBLIC_IPV6 = ip_network("2000::/3")
TRANSITION_NETWORKS = (ip_network("2002::/16"), ip_network("2001::/32"))
REDIRECTS = {301, 302, 303, 307, 308}
HTML_TYPES = {"text/html", "application/xhtml+xml"}
ALLOWED_TYPES = HTML_TYPES | {"text/plain", "application/pdf"}


class PublicationError(Exception):
    def __init__(self, message: str, *, retryable: bool = False, blocked: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.blocked = blocked


@dataclass(frozen=True)
class DownloadedPublication:
    url: str
    text: str
    title: str
    occurred_at: date | None


def publication_url(value: str) -> str:
    candidate = safe_url(value)
    if candidate:
        try:
            parsed = urlsplit(candidate)
            url = httpx.URL(candidate)
            host = url.raw_host.decode("ascii").rstrip(".")
            if (
                parsed.scheme == "https" and parsed.port in {None, 443}
                and parsed.username is None and parsed.password is None and len(host) <= 253
                and DOMAIN.fullmatch(host) and not host.endswith((".local", ".localhost", ".internal"))
            ):
                return str(url.copy_with(host=host, fragment=None))
        except (ValueError, httpx.InvalidURL):
            pass
    raise PublicationError("Для загрузки нужна HTTPS-ссылка на публичный сайт.", blocked=True)


async def _resolve(host: str) -> list[str]:
    try:
        records = await asyncio.get_running_loop().getaddrinfo(
            host + ".", 443, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP,
        )
    except socket.gaierror as exc:
        raise PublicationError("Домен не удалось найти.", retryable=exc.errno == socket.EAI_AGAIN) from exc
    addresses = list(dict.fromkeys(ip_address(record[4][0]) for record in records))
    if not addresses or any(not _is_public(address) for address in addresses):
        raise PublicationError("Сайт разрешается в непубличный адрес.", blocked=True)
    return [str(address) for address in addresses]


def _is_public(address) -> bool:
    if not address.is_global or address.is_multicast or address.is_reserved:
        return False
    if isinstance(address, IPv6Address):
        return address in PUBLIC_IPV6 and not any(address in network for network in TRANSITION_NETWORKS)
    return True


async def _read_response(response: httpx.Response, allowed: set[str]) -> tuple[str, str | None, bytes]:
    if not 200 <= response.status_code < 300:
        raise PublicationError(
            f"Сайт вернул HTTP {response.status_code}.",
            retryable=response.status_code in {408, 425, 429} or response.status_code >= 500,
        )
    content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().casefold()
    if content_type not in allowed:
        raise PublicationError("Сайт вернул неподдерживаемый формат.")
    if response.headers.get("content-encoding", "identity").casefold() != "identity":
        raise PublicationError("Сайт передал материал в неподдерживаемой упаковке.")
    length = response.headers.get("content-length", "")
    if length.isascii() and length.isdecimal() and int(length) > MAX_FILE_BYTES:
        raise PublicationError("Размер материала превышает 5 МБ.")
    body = bytearray()
    async with aclosing(response.aiter_raw()) as chunks:
        async for chunk in chunks:
            if len(body) + len(chunk) > MAX_FILE_BYTES:
                raise PublicationError("Размер материала превышает 5 МБ.")
            body.extend(chunk)
    return content_type, response.charset_encoding, bytes(body)


async def download_resource(value: str, allowed: set[str]) -> tuple[str, str, str | None, bytes]:
    current = publication_url(value)
    for attempt in range(MAX_REDIRECTS + 1):
        origin = httpx.URL(current)
        addresses = await _resolve(origin.host)
        host = origin.raw_host.decode("ascii")
        connection_error: Exception | None = None
        for address in addresses[:3]:
            # Retry alternative public addresses for the same DNS answer while retaining TLS hostname validation.
            request = httpx.Request(
                "GET", origin.copy_with(host=address),
                headers={
                    "Host": host,
                    "Accept": ", ".join(sorted(allowed)),
                    "Accept-Encoding": "identity",
                    "User-Agent": "Sammi-Publication-Reader/1.0",
                },
                extensions={"sni_hostname": host, "timeout": {"connect": 2.5, "read": 5.0, "write": 5.0, "pool": 3.0}},
            )
            async with httpx.AsyncHTTPTransport(trust_env=False) as transport:
                try:
                    response = await transport.handle_async_request(request)
                except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                    connection_error = exc
                    continue
                try:
                    if response.status_code not in REDIRECTS:
                        content_type, encoding, contents = await _read_response(response, allowed)
                        return current, content_type, encoding, contents
                    location = response.headers.get("location")
                    if not location or attempt == MAX_REDIRECTS:
                        raise PublicationError("Сайт вернул неполное перенаправление или слишком много переходов.")
                    current = publication_url(str(origin.join(location)))
                    break
                finally:
                    await response.aclose()
        else:
            raise PublicationError("Не удалось соединиться с публичными адресами сайта.", retryable=True) from connection_error
    raise AssertionError("redirect loop bounds")


def _parse(url: str, content_type: str, encoding: str | None, contents: bytes) -> DownloadedPublication:
    title = ""
    occurred_at = None
    try:
        if content_type in HTML_TYPES:
            text, title, published = read_public_html(contents, encoding)
            if published:
                try:
                    occurred_at = date.fromisoformat(published[:10])
                except ValueError:
                    pass
        else:
            text = read_document("publication.pdf" if content_type == "application/pdf" else "publication.txt", contents)
    except AppError as exc:
        raise PublicationError(exc.message) from exc
    return DownloadedPublication(url, text, title, occurred_at)


async def download_publication(url: str) -> DownloadedPublication:
    try:
        async with asyncio.timeout(DOWNLOAD_TIMEOUT):
            download = await download_resource(url, ALLOWED_TYPES)
            return await asyncio.to_thread(_parse, *download)
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise PublicationError("Сайт не ответил вовремя.", retryable=True) from exc
    except httpx.TransportError as exc:
        raise PublicationError("Сайт временно недоступен или соединение не удалось.", retryable=True) from exc
    except (ValueError, httpx.InvalidURL) as exc:
        raise PublicationError("Сайт вернул некорректный адрес.", blocked=True) from exc
