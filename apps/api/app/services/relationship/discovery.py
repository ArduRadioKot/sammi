import asyncio
from dataclasses import dataclass
from datetime import date, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import unquote, urljoin
from xml.etree.ElementTree import Element

import httpx
from defusedxml.ElementTree import fromstring

from app.schemas.relationship import Corpus, FeedStatus, LinkedPublication
from app.services.relationship import publications
from app.services.relationship.text import normalized, tokens, topics

FEED_TYPES = {"application/rss+xml", "application/atom+xml", "application/xml", "text/xml", "text/plain"}
MAX_DISCOVERED_PER_FEED = 10
MAX_FEED_ENTRIES = 200
MAX_FEED_BYTES = 1024 * 1024
SITEMAP_TYPES = {"application/xml", "text/xml", "text/plain"}


@dataclass(frozen=True)
class Entry:
    url: str
    label: str
    text: str
    occurred_at: date | None


def _date(value: str) -> date | None:
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        try:
            return parsedate_to_datetime(value).date()
        except (ValueError, TypeError, OverflowError):
            return None


def _entries(url: str, body: bytes) -> list[Entry]:
    if len(body) > MAX_FEED_BYTES:
        raise publications.PublicationError("Размер RSS или Atom превышает 1 МБ.")
    try:
        root = fromstring(body)
    except (ValueError, SyntaxError) as exc:
        raise publications.PublicationError("Не удалось прочитать RSS или Atom.") from exc
    tag = root.tag.rsplit("}", 1)[-1].lower()
    if tag not in {"rss", "feed", "rdf"}:
        raise publications.PublicationError("Сайт не вернул RSS или Atom.")
    entries = []
    for item in (root.findall(".//{*}item") + root.findall("{*}entry"))[:MAX_FEED_ENTRIES]:
        links = [node for node in item.findall("{*}link") if node.get("rel", "alternate") == "alternate"]
        if not links:
            continue
        target = links[0].get("href") or links[0].text or ""
        if not target.strip():
            continue
        try:
            link = publications.publication_url(urljoin(url, target.strip()))
        except publications.PublicationError:
            continue
        title = " ".join((item.findtext("{*}title") or "").split())[:300]
        description = item.findtext("{*}summary") or item.findtext("{*}description") or ""
        timestamp = next((item.findtext(f"{{*}}{field}") for field in ("published", "pubDate", "date", "updated")
                          if item.findtext(f"{{*}}{field}")), "")
        entries.append(Entry(link, title or link, (title + " " + description)[:4500], _date(timestamp)))
    return entries


async def load_feed(url: str) -> list[Entry]:
    try:
        async with asyncio.timeout(publications.DOWNLOAD_TIMEOUT):
            final_url, _, _, contents = await publications.download_resource(url, FEED_TYPES)
            return await asyncio.to_thread(_entries, final_url, contents)
    except (TimeoutError, httpx.TransportError) as exc:
        raise publications.PublicationError("Публичная лента временно недоступна.", retryable=True) from exc
    except (ValueError, httpx.InvalidURL) as exc:
        raise publications.PublicationError("Лента вернула некорректный адрес.", blocked=True) from exc


async def _load_sitemap(url: str, domain: str) -> Element:
    final_url, _, _, body = await publications.download_resource(url, SITEMAP_TYPES)
    if httpx.URL(final_url).host.removeprefix("www.") != domain:
        raise publications.PublicationError("Карта сайта перенаправила запрос на другой домен.")
    return await asyncio.to_thread(fromstring, body)


def _sitemap_links(roots: list[Element], domain: str, names: list[str], keywords: list[str],
                   known: set[str], limit: int) -> list[Entry]:
    people = [name.split() for name in map(normalized, names)]
    terms = [term for keyword in keywords if (term := normalized(keyword))]
    ranked = {}
    for root in roots:
        if root.tag.rsplit("}", 1)[-1] != "urlset":
            continue
        for item in root.findall("{*}url"):
            url = (item.findtext("{*}loc") or "").strip()
            if not url or url in known:
                continue
            try:
                parsed = httpx.URL(url)
            except httpx.InvalidURL:
                continue
            if parsed.host.removeprefix("www.") != domain or parsed.query:
                continue
            slug = unquote(parsed.path.rstrip("/").rsplit("/", 1)[-1])
            if not slug or "." in slug:
                continue
            title = normalized(slug.replace("-", " ").replace("_", " "))
            haystack = f" {title} "
            full_names = sum(len(parts) >= 2 and f" {' '.join(parts)} " in haystack for parts in people)
            surnames = sum(len(parts) >= 2 and len(parts[-1]) >= 5 and f" {parts[-1]} " in haystack for parts in people)
            matches = sum(f" {term} " in haystack for term in terms)
            if not (full_names or matches):
                continue
            try:
                url = publications.publication_url(url)
            except publications.PublicationError:
                continue
            rank = 9 * full_names + 3 * surnames + 2 * matches
            ranked[url] = (rank, Entry(url, title, "", None))
    return [entry for _, entry in sorted(ranked.values(), key=lambda value: (-value[0], value[1].url))[:limit]]


async def search_sitemap(origin: httpx.URL, names: list[str], keywords: list[str], known: set[str],
                         limit: int) -> list[Entry]:
    domain = origin.host.removeprefix("www.")
    async with asyncio.timeout(18):
        root = await _load_sitemap(str(origin.copy_with(path="/sitemap.xml", query=None, fragment=None)), domain)
        roots = [root]
        if root.tag.rsplit("}", 1)[-1] == "sitemapindex":
            children = []
            for item in root.findall("{*}sitemap"):
                try:
                    url = publications.publication_url((item.findtext("{*}loc") or "").strip())
                except publications.PublicationError:
                    continue
                if httpx.URL(url).host.removeprefix("www.") == domain and url not in children:
                    children.append(url)
            children.sort(key=lambda url: not any(word in httpx.URL(url).path for word in ("post", "news", "blog", "press")))
            results = await asyncio.gather(*(_load_sitemap(url, domain) for url in children[:2]), return_exceptions=True)
            roots = [item for item in results if isinstance(item, Element)]
            if results and not roots:
                raise publications.PublicationError("Не удалось прочитать разделы карты сайта.")
        return await asyncio.to_thread(_sitemap_links, roots, domain, names, keywords, known, limit)


def apply_feed(corpus: Corpus, feed: FeedStatus, entries: list[Entry], today: date) -> None:
    remaining = publications.MAX_REMOTE_PUBLICATIONS - sum(
        item.state == "pending" or item.retryable for item in corpus.publications
    )
    known = {item.url for item in corpus.publications} | {item.url for item in corpus.sources} | {item.url for item in corpus.review}
    contacts = [tuple(normalized(item.name).split()) for item in corpus.contacts]
    contact_lemmas = [set(tokens(item.name)) for item in corpus.contacts]
    company = normalized(corpus.company)
    company_lemmas = " ".join(tokens(corpus.company))
    candidates = sorted(entries, key=lambda item: item.occurred_at or date.min, reverse=True)
    for item in candidates:
        if remaining <= 0 or feed.discovered >= MAX_DISCOVERED_PER_FEED:
            break
        if item.url in known or item.occurred_at and not today - timedelta(days=365) <= item.occurred_at <= today:
            continue
        text = f" {normalized(item.text)} "
        lemmas = tokens(item.text)
        lemma_set = set(lemmas)
        person = any(len(parts) >= 2 and all(f" {part} " in text for part in parts) for parts in contacts)
        person = person or any(len(parts) >= 2 and parts <= lemma_set for parts in contact_lemmas)
        company_match = len(company) >= 3 and (
            f" {company} " in text or bool(company_lemmas) and f" {company_lemmas} " in f" {' '.join(lemmas)} "
        )
        relevant_company = company_match and bool(topics(item.text))
        if not (person or relevant_company):
            continue
        corpus.publications.append(LinkedPublication(
            id=f"feed-publication-{len(corpus.publications) + 1}", url=item.url, label=item.label,
            occurred_at=item.occurred_at, from_feed=True,
        ))
        known.add(item.url)
        remaining -= 1
        feed.discovered += 1
