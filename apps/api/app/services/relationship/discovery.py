import asyncio
from dataclasses import dataclass
from datetime import date, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin

import httpx
from defusedxml.ElementTree import fromstring

from app.schemas.relationship import Corpus, FeedStatus, LinkedPublication
from app.services.relationship import publications
from app.services.relationship.text import normalized, tokens, topics

FEED_TYPES = {"application/rss+xml", "application/atom+xml", "application/xml", "text/xml", "text/plain"}
MAX_DISCOVERED_PER_FEED = 10
MAX_FEED_ENTRIES = 200
MAX_FEED_BYTES = 1024 * 1024


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
