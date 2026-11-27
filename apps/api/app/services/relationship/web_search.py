import asyncio
import re
from collections import Counter, defaultdict
from collections.abc import AsyncIterator
from dataclasses import dataclass
from html import unescape
from itertools import combinations
from typing import Literal
from urllib.parse import parse_qsl, quote, urlencode

import httpx

from app.core.config import get_settings
from app.schemas.relationship import Contact, Corpus, LinkedPublication
from app.services.relationship import discovery
from app.services.relationship.publications import MAX_SEARCH_PUBLICATIONS, PublicationError, publication_url
from app.services.relationship.text import clean, normalized

CONCURRENCY = 3
RESULTS_PER_QUERY = 8
RESULTS_PER_PERSON = 7
TIMEOUT_SECONDS = 7
STAGE_SECONDS = 95
TRACKING_KEYS = {"fbclid", "gclid", "ref", "hs_amp", "mc_cid", "mc_eid", "_hsenc", "_hsmi"}
WIKIPEDIA_USER_AGENT = "Sammi-Publication-Reader/1.0 (public reference search)"


@dataclass(frozen=True)
class SearchResult:
    url: str
    title: str
    snippet: str = ""
    score: float = 0
    provider: Literal["searxng", "wikipedia", "sitemap"] = "searxng"


@dataclass(frozen=True)
class Outcome:
    contact_ids: list[str]
    results: list[SearchResult]
    error: str | None = None
    queries: int = 1
    failed_queries: int = 0
    pair: bool = False
    wikipedia_queries: int = 0
    sitemap_queries: int = 0


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


def _quoted(value: str) -> str:
    return '"' + clean(value.replace('"', " "))[:180] + '"'


def _variants(person: Contact, company: str, keywords: list[str]) -> list[str]:
    name = _quoted(person.name)
    org = _quoted(company)
    english = not re.search(r"[а-яё]", person.name, re.I)
    queries = [f"{name} {org}", f'{name} {"keynote" if english else "выступление"}']
    if keywords:
        queries.extend(f"{name} {org} {_quoted(word)}" for word in keywords[:4])
        if len(keywords) > 4:
            queries.append(f"{name} {org} (" + " OR ".join(map(_quoted, keywords[4:])) + ")")
    elif person.title:
        queries.append(f"{name} {org} {_quoted(person.title)}")
    else:
        queries.append(f'{name} {org} {"speaker" if english else "конференция"}')
    return list(dict.fromkeys(queries))


def _canonical(value: str) -> str:
    url = httpx.URL(value)
    query = urlencode(sorted(
        (key, val) for key, val in parse_qsl(url.query.decode("ascii"), keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in TRACKING_KEYS
    ))
    return str(url.copy_with(query=query.encode() if query else None, fragment=None))


async def _search(client: httpx.AsyncClient, endpoint: httpx.URL, query: str, ids: list[str]) -> Outcome:
    unavailable = "SearXNG временно недоступен."
    try:
        async with asyncio.timeout(TIMEOUT_SECONDS):
            params = {
                "q": query, "format": "json",
                "language": "all" if re.search(r"[а-яё]", query, re.I) else "en",
                "safesearch": "1",
            }
            if engines := get_settings().relationship_search_engines.strip():
                params["engines"] = engines
            else:
                params["categories"] = "general"
            response = await client.post(endpoint, data=params)
        if response.status_code == 403:
            return Outcome(ids, [], "SearXNG отклонил JSON-запрос. Проверьте форматы поиска.", failed_queries=1)
        if response.is_error:
            return Outcome(ids, [], f"SearXNG вернул HTTP {response.status_code}.", failed_queries=1)
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
            return Outcome(ids, [], "SearXNG вернул некорректный ответ.", failed_queries=1)
    except (httpx.HTTPError, TimeoutError, ValueError):
        return Outcome(ids, [], unavailable, failed_queries=1)
    if not payload["results"] and payload.get("unresponsive_engines"):
        return Outcome(ids, [], "Поисковые движки SearXNG не вернули результаты.", failed_queries=1)
    results = {}
    for item in payload["results"][:30]:
        if not isinstance(item, dict):
            continue
        try:
            url = publication_url(_canonical(str(item.get("url") or "")))
        except (PublicationError, ValueError, httpx.InvalidURL):
            continue
        title = clean(str(item.get("title") or ""))[:300] or url
        snippet = clean(str(item.get("content") or ""))[:600]
        votes = item.get("engines")
        results.setdefault(url, SearchResult(url, title, snippet, min(len(votes), 4) if isinstance(votes, list) else 0))
        if len(results) == RESULTS_PER_QUERY:
            break
    return Outcome(ids, list(results.values()))

async def check(client: httpx.AsyncClient, endpoint: httpx.URL) -> Outcome:
    first = await _search(client, endpoint, "OpenStreetMap project", [])
    return first if first.results else await _search_wikipedia(client, "OpenStreetMap", [], "en")


async def _search_wikipedia(client: httpx.AsyncClient, query: str, ids: list[str], language: Literal["en", "ru"]) -> Outcome:
    host = f"{language}.wikipedia.org"
    failed = Outcome(ids, [], "Резервный поиск Wikipedia не ответил.", failed_queries=1, wikipedia_queries=1)
    try:
        async with asyncio.timeout(TIMEOUT_SECONDS):
            response = await client.get(
                f"https://{host}/w/api.php",
                params={"action": "query", "list": "search", "srsearch": query, "srnamespace": "0",
                        "srlimit": RESULTS_PER_QUERY, "srprop": "snippet", "format": "json"},
                headers={"User-Agent": WIKIPEDIA_USER_AGENT},
            )
        response.raise_for_status()
        payload = response.json()
        query_result = payload.get("query") if isinstance(payload, dict) else None
        items = query_result.get("search") if isinstance(query_result, dict) else None
        if not isinstance(items, list):
            return failed
    except (httpx.HTTPError, TimeoutError, ValueError):
        return failed
    results = []
    for item in items[:RESULTS_PER_QUERY]:
        if not isinstance(item, dict) or not isinstance(item.get("title"), str):
            continue
        title = clean(item["title"])[:300]
        if not title:
            continue
        path = quote(title.replace(" ", "_"), safe="")
        snippet = clean(unescape(re.sub(r"<[^>]*>", "", str(item.get("snippet") or ""))))[:600]
        results.append(SearchResult(f"https://{host}/wiki/{path}", title, snippet, provider="wikipedia"))
    return Outcome(ids, results, wikipedia_queries=1)


async def _search_source_site(corpus: Corpus, contacts: list[Contact], keywords: list[str]) -> Outcome | None:
    supplied = [httpx.URL(item.url) for item in corpus.publications if item.id.startswith("manual-search-")]
    if not supplied or not contacts:
        return None
    origin = Counter(supplied_url.host for supplied_url in supplied).most_common(1)[0][0]
    known = {_canonical(item.url) for item in corpus.publications}
    names = [contact.name for contact in contacts]
    ids = [contact.id for contact in contacts]
    try:
        entries = await discovery.search_sitemap(httpx.URL(scheme="https", host=origin), names, keywords, known,
                                                RESULTS_PER_PERSON)
    except (PublicationError, httpx.HTTPError, ValueError, SyntaxError, TimeoutError):
        return Outcome(ids, [], failed_queries=1, pair=True, sitemap_queries=1)
    results = [SearchResult(item.url, item.label, provider="sitemap") for item in entries]
    return Outcome(ids, results, pair=True, sitemap_queries=1)


def _rank(outcomes: list[Outcome], names: list[str], company: str, keywords: list[str]) -> list[SearchResult]:
    ranks: dict[str, tuple[float, SearchResult]] = {}
    for outcome in outcomes:
        for index, result in enumerate(outcome.results):
            title = f" {normalized(result.title)} "
            text = f"{title} {normalized(result.snippet)} "
            name_hits = sum(f" {normalized(name)} " in text for name in names)
            score = (4 * name_hits + 2 * sum(f" {normalized(name)} " in title for name in names)
                     + 2 * (f" {normalized(company)} " in text) + result.score / 2 + 1 / (index + 1))
            score += min(3, sum(bool(normalized(word)) and f" {normalized(word)} " in text for word in keywords))
            previous = ranks.get(result.url)
            if previous is None or score > previous[0]:
                ranks[result.url] = (score, result)
    ordered = [result for _, result in sorted(ranks.values(), key=lambda entry: entry[0], reverse=True)]
    domains: Counter[str] = Counter()
    diverse, repeat = [], []
    for result in ordered:
        domain = httpx.URL(result.url).host.removeprefix("www.")
        (diverse if domains[domain] < 3 else repeat).append(result)
        domains[domain] += 1
    return (diverse + repeat)[:RESULTS_PER_PERSON]


async def batches(corpus: Corpus) -> AsyncIterator[list[Outcome]]:
    keywords = corpus.web_search.keywords if corpus.web_search else []
    named = [contact for contact in corpus.contacts if len(normalized(contact.name).split()) >= 2]
    if site := await _search_source_site(corpus, named, keywords):
        yield [site]
    endpoint = search_endpoint()
    pairs = list(combinations(named, 2))[:8] if 2 <= len(named) <= 6 else []
    pending = sum(item.state == "pending" or item.retryable for item in corpus.publications)
    per_person = max(1, min(RESULTS_PER_PERSON, (MAX_SEARCH_PUBLICATIONS - pending - 3 * len(pairs)) // max(1, len(named))))
    semaphore = asyncio.Semaphore(CONCURRENCY)
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, trust_env=False) as client:
        async def search(query: str, ids: list[str]) -> Outcome:
            async with semaphore:
                return await _search(client, endpoint, query, ids)

        async def group(contacts: list[Contact], queries: list[str], *, pair: bool = False) -> Outcome:
            ids = [contact.id for contact in contacts]
            outcomes = await asyncio.gather(*(search(query, ids) for query in queries))
            ranked = _rank(outcomes, [contact.name for contact in contacts], corpus.company, keywords)
            if not ranked:
                language = "ru" if re.search(r"[а-яё]", queries[0], re.I) else "en"
                async with semaphore:
                    fallback = await _search_wikipedia(client, queries[0], ids, language)
                    outcomes.append(fallback)
                    if not fallback.results:
                        relaxed = " ".join(_quoted(contact.name) for contact in contacts)
                        if relaxed != queries[0]:
                            outcomes.append(await _search_wikipedia(client, relaxed, ids, language))
                ranked = _rank(outcomes, [contact.name for contact in contacts], corpus.company, keywords)
            failed = sum(bool(outcome.error) for outcome in outcomes)
            return Outcome(
                ids, ranked[:3 if pair else per_person],
                outcomes[0].error if failed == len(outcomes) else None, len(outcomes), failed, pair,
                sum(outcome.wikipedia_queries for outcome in outcomes),
            )

        # Co-mention searches reserve space for sources that can explain an edge on the map.
        if pairs:
            yield await asyncio.gather(*(group(
                [left, right], [f"{_quoted(left.name)} {_quoted(right.name)} {_quoted(corpus.company)}"], pair=True,
            ) for left, right in pairs))
        for offset in range(0, len(named), 4):
            yield await asyncio.gather(*(group([person], _variants(person, corpus.company, keywords))
                                         for person in named[offset:offset + 4]))


def apply_results(corpus: Corpus, outcomes: list[Outcome]) -> int:
    capacity = MAX_SEARCH_PUBLICATIONS - sum(item.state == "pending" or item.retryable for item in corpus.publications)
    known = {_canonical(item.url): item for item in corpus.publications}
    supplied = {_canonical(item.url) for item in [*corpus.sources, *corpus.review] if item.url}
    added = 0
    for rank in range(RESULTS_PER_PERSON):
        for outcome in outcomes:
            if len(outcome.results) <= rank:
                continue
            result = outcome.results[rank]
            key = _canonical(result.url)
            existing = known.get(key)
            if existing is not None:
                if existing.expected_contacts and existing.state == "pending":
                    existing.expected_contacts = list(dict.fromkeys([*existing.expected_contacts, *outcome.contact_ids]))
                continue
            if key in supplied or capacity <= 0:
                continue
            item = LinkedPublication(
                id=f"search-publication-{len(corpus.publications) + 1}", label=result.title, url=key,
                expected_contacts=outcome.contact_ids, search_provider=result.provider,
            )
            corpus.publications.append(item)
            known[key] = item
            capacity -= 1
            added += 1
    return added
