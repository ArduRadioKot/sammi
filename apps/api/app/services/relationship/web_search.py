import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx

from app.core.config import get_settings
from app.schemas.relationship import Corpus, LinkedPublication
from app.services.relationship.publications import MAX_REMOTE_PUBLICATIONS, PublicationError, publication_url
from app.services.relationship.text import clean, normalized

CONCURRENCY = 4
RESULTS_PER_PERSON = 2
TIMEOUT_SECONDS = 8


@dataclass(frozen=True)
class SearchResult:
    url: str
    title: str


@dataclass(frozen=True)
class Outcome:
    contact_ids: list[str]
    results: list[SearchResult]
    error: str | None = None


def search_endpoint() -> httpx.URL:
    try:
        url = httpx.URL(get_settings().relationship_search_base_url.strip())
        if url.scheme in {"http", "https"} and url.host and not (
            url.username or url.password or url.query or url.fragment
        ):
            return url.copy_with(path=url.path.rstrip("/") + "/search")
    except httpx.InvalidURL:
        pass
    raise PublicationError("Настройте адрес SearXNG для веб-поиска.")


def _query(person: str, company: str) -> str:
    person = clean(person.replace('"', " "))[:180]
    company = clean(company.replace('"', " "))[:180]
    return f'"{person}" "{company}" (выступление OR конференция OR интервью OR новости OR speaker OR conference OR news)'


async def _search(client: httpx.AsyncClient, endpoint: httpx.URL, query: str, ids: list[str]) -> Outcome:
    try:
        async with asyncio.timeout(TIMEOUT_SECONDS):
            response = await client.post(endpoint, data={
                "q": query, "format": "json", "categories": "general", "language": "all", "safesearch": "1",
            })
        if response.status_code == 403:
            return Outcome(ids, [], "SearXNG отклонил JSON-запрос. Проверьте форматы поиска в настройках.")
        if response.is_error:
            return Outcome(ids, [], f"SearXNG вернул HTTP {response.status_code}.")
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
            return Outcome(ids, [], "SearXNG вернул некорректный ответ.")
    except (httpx.HTTPError, TimeoutError, ValueError):
        return Outcome(ids, [], "SearXNG временно недоступен.")
    results = {}
    for item in payload["results"][:20]:
        if not isinstance(item, dict):
            continue
        try:
            url = publication_url(str(item.get("url") or ""))
        except PublicationError:
            continue
        title = clean(str(item.get("title") or ""))[:300] or url
        results.setdefault(url, SearchResult(url, title))
        if len(results) == RESULTS_PER_PERSON:
            break
    if not payload["results"] and payload.get("unresponsive_engines"):
        return Outcome(ids, [], "Поисковые движки SearXNG временно недоступны.")
    return Outcome(ids, list(results.values()))


async def batches(corpus: Corpus) -> AsyncIterator[list[Outcome]]:
    endpoint = search_endpoint()
    queries: dict[str, list[str]] = defaultdict(list)
    for contact in corpus.contacts:
        if len(normalized(contact.name).split()) >= 2:
            queries[_query(contact.name, corpus.company)].append(contact.id)
    chunks = list(queries.items())
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, trust_env=False) as client:
        for offset in range(0, len(chunks), CONCURRENCY):
            yield await asyncio.gather(*(
                _search(client, endpoint, query, ids) for query, ids in chunks[offset:offset + CONCURRENCY]
            ))


def apply_results(corpus: Corpus, outcomes: list[Outcome]) -> int:
    capacity = MAX_REMOTE_PUBLICATIONS - sum(item.state == "pending" or item.retryable for item in corpus.publications)
    known = {item.url: item for item in corpus.publications}
    supplied = {item.url for item in corpus.sources} | {item.url for item in corpus.review}
    added = 0
    for rank in range(RESULTS_PER_PERSON):
        for outcome in outcomes:
            if len(outcome.results) <= rank:
                continue
            result = outcome.results[rank]
            existing = known.get(result.url)
            if existing is not None:
                if existing.expected_contacts and existing.state == "pending":
                    existing.expected_contacts = list(dict.fromkeys([*existing.expected_contacts, *outcome.contact_ids]))
                continue
            if result.url in supplied or capacity <= 0:
                continue
            item = LinkedPublication(
                id=f"search-publication-{len(corpus.publications) + 1}", label=result.title, url=result.url,
                expected_contacts=outcome.contact_ids,
            )
            corpus.publications.append(item)
            known[item.url] = item
            capacity -= 1
            added += 1
    return added
