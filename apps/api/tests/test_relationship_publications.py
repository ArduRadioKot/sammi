import asyncio
import socket
from datetime import date
from urllib.parse import parse_qs

import httpx
import pytest

from app.services.relationship import publications, web_search

pytestmark = pytest.mark.asyncio


async def test_searxng_search_requests_json_and_filters_publication_urls():
    query = web_search._query("Алексей Иванов", "Северный банк")
    endpoint = httpx.URL("http://searxng:8080/search")

    def respond(request):
        assert request.url == endpoint and request.method == "POST"
        assert parse_qs(request.content.decode()) == {
            "q": [query], "format": ["json"], "categories": ["general"],
            "language": ["all"], "safesearch": ["1"],
        }
        return httpx.Response(200, json={"results": [
            {"url": "https://127.0.0.1/private", "title": "Private"},
            {"url": "http://example.com/news", "title": "Uses HTTP"},
            {"url": "https://example.com/news#speaker", "title": " News "},
            {"url": "https://example.com/news", "title": "Duplicate"},
            {"url": "https://publisher.example.org/forum", "title": "Forum"},
            {"url": "https://example.org/other", "title": "Beyond the limit"},
        ]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        result = await web_search._search(client, endpoint, query, ["contact"])
    assert result == web_search.Outcome(["contact"], [
        web_search.SearchResult("https://example.com/news", "News"),
        web_search.SearchResult("https://publisher.example.org/forum", "Forum"),
    ])


class Body(httpx.AsyncByteStream):
    def __init__(self, data: bytes) -> None:
        self.data: bytes | None = data

    def __aiter__(self):
        return self

    async def __anext__(self) -> bytes:
        if self.data is None:
            raise StopAsyncIteration
        chunk, self.data = self.data, None
        return chunk


def _dns_record(address: str):
    return socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 443)


async def test_publication_uses_resolved_ip_and_preserves_tls_hostname(monkeypatch):
    resolved = []
    requests = []

    async def resolve(host, port, **kwargs):
        assert port == 443
        resolved.append(host)
        return [_dns_record("93.184.215.14")]

    def respond(request):
        requests.append(request)
        if request.url.path == "/old":
            return httpx.Response(302, headers={"Location": "https://publisher.example.net/news"})
        content = (
            '<head><title>Заголовок</title><meta property="article:published_time" content="2026-11-10T09:30:00Z"></head>'
            '<article>Алексей Иванов выступил с докладом.</article><script>Не включать.</script>'
        )
        return httpx.Response(200, headers={"Content-Type": "text/html; charset=utf-8"}, stream=Body(content.encode()))

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    monkeypatch.setattr(httpx, "AsyncHTTPTransport", lambda **_: httpx.MockTransport(respond))
    result = await publications.download_publication("https://example.org/old#speaker")

    assert resolved == ["example.org.", "publisher.example.net."]
    assert [request.url.host for request in requests] == ["93.184.215.14"] * 2
    assert [request.headers["Host"] for request in requests] == ["example.org", "publisher.example.net"]
    assert [request.extensions["sni_hostname"] for request in requests] == ["example.org", "publisher.example.net"]
    assert result.url == "https://publisher.example.net/news"
    assert result.title == "Заголовок"
    assert result.occurred_at == date(2026, 11, 10)
    assert result.text == "Алексей Иванов выступил с докладом."


async def test_publication_blocks_redirect_to_nonpublic_dns_answer(monkeypatch):
    async def resolve(host, port, **kwargs):
        if host == "publisher.example.net.":
            return [_dns_record("93.184.215.14"), _dns_record("127.0.0.1")]
        return [_dns_record("93.184.215.14")]

    requested = []

    def respond(request):
        requested.append(request.headers["Host"])
        return httpx.Response(302, headers={"Location": "https://publisher.example.net/news"})

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    monkeypatch.setattr(httpx, "AsyncHTTPTransport", lambda **_: httpx.MockTransport(respond))
    with pytest.raises(publications.PublicationError) as caught:
        await publications.download_publication("https://example.org/news")
    assert caught.value.blocked
    assert not caught.value.retryable
    assert requested == ["example.org"]


async def test_publication_body_limit_applies_without_content_length(monkeypatch):
    async def resolve(host, port, **kwargs):
        return [_dns_record("93.184.215.14")]

    def respond(request):
        return httpx.Response(200, headers={"Content-Type": "text/plain"}, stream=Body(b"x" * 26))

    monkeypatch.setattr(asyncio.get_running_loop(), "getaddrinfo", resolve)
    monkeypatch.setattr(httpx, "AsyncHTTPTransport", lambda **_: httpx.MockTransport(respond))
    monkeypatch.setattr(publications, "MAX_FILE_BYTES", 25)
    with pytest.raises(publications.PublicationError, match="5 МБ"):
        await publications.download_publication("https://example.org/large")
