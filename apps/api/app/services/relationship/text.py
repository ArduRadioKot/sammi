import math
import posixpath
import re
from collections import Counter
from collections.abc import Iterable
from functools import lru_cache
from html.parser import HTMLParser
from io import BytesIO
from pathlib import PurePath
from urllib.parse import urlsplit
from zipfile import ZipFile

from charset_normalizer import from_bytes
from defusedxml.ElementTree import fromstring
from pymorphy3 import MorphAnalyzer
from pypdf import PdfReader

from app.core.errors import AppError
from app.schemas.relationship import Citation, Source

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_DOCUMENT_CHARS = 30_000
WORD = re.compile(r"[a-zа-яё0-9]+", re.IGNORECASE)
STOP = set("для при от на про по это что кто как или где наш ваш его она они этот тот какой какие быть был the with and for from".split())
TECHNOLOGIES = {
    "Облако": ("облако", "cloud", "iaas", "paas"),
    "Kubernetes": ("kubernetes", "k8s", "кубернетес"),
    "Информационная безопасность": ("информационная безопасность", "кибербезопасность", "siem", "soc", "zero trust"),
    "Миграция инфраструктуры": ("миграция", "migrate", "vmware", "виртуализация", "гипервизор"),
    "Искусственный интеллект": ("искусственный интеллект", "llm", "машинное обучение", "gemma", "нейросеть"),
    "Аналитика данных": ("хранилище данных", "lakehouse", "dwh", "postgresql", "etl", "clickhouse"),
    "Резервное копирование": ("резервная копия", "резервное копирование", "backup", "аварийное восстановление"),
    "Импортозамещение": ("импортозамещение", "astra linux", "альт", "redos"),
}


def clean(value: str) -> str:
    return " ".join(value.split())


def normalized(value: str) -> str:
    return " ".join(WORD.findall(value.casefold().replace("ё", "е")))


@lru_cache(maxsize=1)
def _morph() -> MorphAnalyzer:
    return MorphAnalyzer()


@lru_cache(maxsize=30_000)
def _lemma(word: str) -> str:
    return _morph().parse(word)[0].normal_form if word.isalpha() and "а" <= word[0] <= "я" else word


def tokens(value: str) -> list[str]:
    return [_lemma(word) for word in normalized(value).split() if len(word) > 1 and word not in STOP]


@lru_cache(maxsize=1)
def _technology_terms() -> dict[str, tuple[str, ...]]:
    return {topic: tuple(" ".join(tokens(alias)) for alias in aliases) for topic, aliases in TECHNOLOGIES.items()}


def topics(value: str) -> set[str]:
    text = " " + " ".join(tokens(value)) + " "
    return {topic for topic, terms in _technology_terms().items() if any(f" {term} " in text for term in terms)}


def split_text(value: str, limit: int = 700) -> list[str]:
    words = clean(value).split()
    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = start + 1
        length = len(words[start])
        while end < len(words) and length + 1 + len(words[end]) <= limit:
            length += 1 + len(words[end])
            end += 1
        chunks.append(" ".join(words[start:end])[:limit])
        if end == len(words):
            break
        start = max(start + 1, end - min(10, (end - start) // 2))
    return chunks


def rank(query: str, sources: list[Source], limit: int) -> list[Source]:
    """BM25 over a bounded set of source fragments."""
    terms = set(tokens(query))
    if not sources or not terms:
        return []
    documents = [Counter(tokens(source.text)) for source in sources]
    sizes = [doc.total() for doc in documents]
    average = sum(sizes) / len(sizes) or 1
    idf = {}
    for term in terms:
        frequency = sum(term in doc for doc in documents)
        idf[term] = math.log1p((len(documents) - frequency + 0.5) / (frequency + 0.5))

    scores = []
    for source, doc, size in zip(sources, documents, sizes):
        norm = 1.2 * (0.25 + 0.75 * size / average)
        score = sum(idf[term] * doc[term] * 2.2 / (doc[term] + norm) for term in terms if doc[term])
        if score:
            scores.append((score, source))
    scores.sort(key=lambda item: item[0], reverse=True)
    return [source for _, source in scores[:limit]]


def cite(source: Source, quote: str | None = None) -> Citation:
    return Citation(
        source_id=source.id,
        label=source.label,
        kind=source.kind,
        quote=quote or source.text[:280],
        occurred_at=source.occurred_at,
        collected_at=source.collected_at,
        url=source.url,
        row_id=source.row_id,
        match_confidence=source.match_confidence,
        verification=source.verification,
        start_seconds=source.start_seconds,
        end_seconds=source.end_seconds,
    )


def safe_url(value: str) -> str | None:
    candidate = value.strip()
    if not candidate or len(candidate) > 2000 or any(char.isspace() or char == "\\" for char in candidate):
        return None
    try:
        parsed = urlsplit(candidate)
        if parsed.scheme in {"http", "https"} and parsed.hostname and not parsed.username and not parsed.password:
            return candidate
    except ValueError:
        pass
    return None


class _TextHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.hidden: list[str] = []
        self.title_parts: list[str] = []
        self.in_title = False
        self.metadata: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self.in_title = True
        if tag == "meta" and self.hidden == ["head"]:
            attributes = dict(attrs)
            key = (attributes.get("property") or attributes.get("name") or "").lower()
            if key in {"og:title", "article:published_time"}:
                self.metadata[key] = attributes.get("content") or ""
        if tag in {"script", "style", "noscript", "template", "head", "nav", "footer"}:
            self.hidden.append(tag)
        elif tag in {"p", "article", "section", "br", "div", "li", "h1", "h2", "h3"} and not self.hidden:
            self.parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False
        if self.hidden and self.hidden[-1] == tag:
            self.hidden.pop()
        elif tag in {"p", "article", "section", "div", "li", "h1", "h2", "h3"} and not self.hidden:
            self.parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)
        elif not self.hidden:
            self.parts.append(data)


def _decode(contents: bytes, encoding: str | None = None) -> str:
    if encoding:
        try:
            return contents.decode(encoding)
        except (LookupError, UnicodeError):
            pass
    decoded = from_bytes(contents).best()
    return str(decoded) if decoded is not None else ""


def read_public_html(contents: bytes, encoding: str | None) -> tuple[str, str, str]:
    parser = _TextHTMLParser()
    parser.feed(_decode(contents, encoding))
    parser.close()
    title = clean(parser.metadata.get("og:title") or "".join(parser.title_parts))[:300]
    return _checked_text("".join(parser.parts)), title, parser.metadata.get("article:published_time", "")


def read_document(filename: str, contents: bytes) -> str:
    suffix = PurePath(filename).suffix.casefold()
    if suffix not in {".pdf", ".pptx", ".html", ".htm", ".txt", ".md", ".vtt", ".srt"}:
        raise AppError("RELATIONSHIP_DOCUMENT_TYPE", "Загрузите PDF, PPTX, HTML, аудио или текстовую стенограмму.", 422)
    try:
        if suffix == ".pdf":
            reader = PdfReader(BytesIO(contents))
            if reader.is_encrypted or len(reader.pages) > 60:
                raise ValueError("Unsupported PDF")
            text = _read_pages(page.extract_text() for page in reader.pages)
        elif suffix == ".pptx":
            text = _read_pptx(contents)
        elif suffix in {".html", ".htm"}:
            return read_public_html(contents, None)[0]
        else:
            text = _decode(contents)
    except AppError:
        raise
    except Exception as exc:
        raise AppError("RELATIONSHIP_DOCUMENT_INVALID", "Не удалось прочитать документ.", 422) from exc
    return _checked_text(text)


def _checked_text(text: str) -> str:
    text = clean(text)
    if not text:
        raise AppError("RELATIONSHIP_DOCUMENT_EMPTY", "В документе нет доступного текстового слоя.", 422)
    if len(text) > MAX_DOCUMENT_CHARS:
        raise AppError("RELATIONSHIP_DOCUMENT_LIMIT", "Сократите документ до 30 000 символов.", 422)
    return text


def _read_pages(pages: Iterable[str]) -> str:
    parts = []
    size = 0
    for page in pages:
        stripped = clean(page)
        parts.append(stripped)
        size += len(stripped) + 1
        if size > MAX_DOCUMENT_CHARS:
            break
    return " ".join(parts)


def _read_pptx(contents: bytes) -> str:
    presentation_ns = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
    office_rel = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
    drawing_ns = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    with ZipFile(BytesIO(contents)) as archive:
        def xml(part: str):
            if archive.getinfo(part).file_size > 1024 * 1024:
                raise ValueError("PowerPoint XML is too large")
            return fromstring(archive.read(part))

        presentation = xml("ppt/presentation.xml")
        slides = presentation.findall(f"{presentation_ns}sldIdLst/{presentation_ns}sldId")
        if not slides or len(slides) > 60:
            raise ValueError("Unsupported slide count")
        paths = {
            node.get("Id"): node.get("Target", "")
            for node in xml("ppt/_rels/presentation.xml.rels")
            if node.get("TargetMode") != "External"
        }
        parts = []
        for number, slide in enumerate(slides, 1):
            target = paths[slide.get(office_rel)]
            path = posixpath.normpath(target.lstrip("/") if target.startswith("/") else f"ppt/{target}")
            if not re.fullmatch(r"ppt/slides/[^/]+\.xml", path):
                raise ValueError("Invalid slide part")
            root = xml(path)
            text = clean(" ".join(item.text or "" for item in root.iter(f"{drawing_ns}t")))
            if text:
                parts.append(f"Слайд {number}. {text}")
            if sum(map(len, parts)) > MAX_DOCUMENT_CHARS:
                break
        return " ".join(parts)
