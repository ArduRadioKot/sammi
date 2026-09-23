from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import date
from pathlib import Path

from charset_normalizer import from_bytes

from app.core.errors import AppError
from app.services.csv.types import ParsedCsv, ParsedHeader, normalize_delimiter
from app.services.table import EMAIL_RE, PHONE_RE, URL_RE

ID_HEADER_RE = re.compile(r"(inn|инн|ogrn|огрн|phone|телефон|id|uuid|индекс)", re.IGNORECASE)
NUMBER_RE = re.compile(r"^-?\d+(?:\.\d+)?$")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}(?:[T ].*)?$")
RU_DATE_RE = re.compile(r"^(\d{2})\.(\d{2})\.(\d{4})$")
BOOL_TRUE = {"true", "yes", "да", "1"}
BOOL_FALSE = {"false", "no", "нет", "0"}


def sanitize_filename(name: str | None) -> str:
    raw = Path(name or "upload.csv").name
    cleaned = re.sub(r"[^\w.\- ]+", "", raw, flags=re.UNICODE).strip()
    return cleaned[:120] or "upload.csv"


def suggested_table_name(filename: str) -> str:
    stem = Path(filename).stem.replace("_", " ").replace("-", " ").strip()
    collapsed = re.sub(r"\s+", " ", stem)
    return collapsed[:200] or "imported"


def file_signature(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _looks_like_text(text: str) -> bool:
    sample = text[:2000]
    if not sample:
        return False
    control = sum(1 for char in sample if ord(char) < 32 and char not in "\r\n\t")
    return (control / len(sample)) < 0.05


def decode_csv_bytes(data: bytes) -> tuple[str, str]:
    if data.startswith(b"\xef\xbb\xbf"):
        return "utf-8-sig", data.decode("utf-8-sig")
    try:
        return "utf-8", data.decode("utf-8")
    except UnicodeDecodeError:
        pass
    match = from_bytes(data).best()
    if match is not None:
        encoding = (match.encoding or "").lower().replace("_", "-")
        if encoding in {"utf-8", "ascii"}:
            return "utf-8", str(match)
        if encoding in {"cp1251", "windows-1251"}:
            text = data.decode("cp1251")
            if _looks_like_text(text):
                return "cp1251", text
    try:
        text = data.decode("cp1251")
        if _looks_like_text(text):
            return "cp1251", text
    except UnicodeDecodeError:
        pass
    raise AppError("CSV_ENCODING_UNSUPPORTED", "Could not decode CSV as UTF-8 or CP1251", status_code=400)


def detect_delimiter(text: str, explicit: str | None) -> tuple[str, list[str]]:
    warnings: list[str] = []
    if explicit:
        try:
            return normalize_delimiter(explicit), warnings
        except ValueError as exc:
            raise AppError("CSV_DELIMITER_UNDETECTED", "Unsupported delimiter", status_code=400) from exc
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        if dialect.delimiter in {",", ";", "\t"}:
            return dialect.delimiter, warnings
    except csv.Error:
        pass
    counts = {",": sample.count(","), ";": sample.count(";"), "\t": sample.count("\t")}
    guessed = max(counts, key=counts.get)
    if counts[guessed] == 0:
        warnings.append("Could not detect delimiter; using comma")
        return ",", warnings
    runner_up = sorted(counts.values(), reverse=True)[1]
    if runner_up > 0:
        warnings.append("Delimiter detection was ambiguous; using the most frequent candidate")
    return guessed, warnings


def _normalize_headers(raw: list[str]) -> tuple[list[ParsedHeader], list[str]]:
    warnings: list[str] = []
    headers: list[ParsedHeader] = []
    for index, value in enumerate(raw):
        original = value
        name = value.strip()
        if not name:
            name = f"Column {index + 1}"
            warnings.append(f"Empty header at column {index + 1}; using {name}")
        headers.append(ParsedHeader(index=index, name=name, original=original))
    return headers, warnings


def _nonempty(values: list[str]) -> list[str]:
    return [item.strip() for item in values if item is not None and str(item).strip() != ""]


def infer_type(header_name: str, sample: list[str]) -> str:
    values = _nonempty(sample)
    if not values:
        return "text"
    lowered = header_name.lower()
    looks_like_id = bool(ID_HEADER_RE.search(header_name))
    if all(_is_bool(item) for item in values):
        return "boolean"
    if all(_is_iso_date(item) or _is_ru_date(item) for item in values):
        return "date"
    if all(EMAIL_RE.match(item) for item in values):
        return "email"
    if all(URL_RE.match(item) for item in values):
        return "url"
    if looks_like_id:
        if any(token in lowered for token in ("phone", "телефон")) and all(PHONE_RE.match(item) for item in values):
            return "phone"
        return "text"
    if all(PHONE_RE.match(item) for item in values) and any(any(ch in item for ch in "+() -") for item in values):
        return "phone"
    if all(NUMBER_RE.match(item) for item in values):
        return "number"
    return "text"


def _is_bool(value: str) -> bool:
    lowered = value.strip().lower()
    return lowered in BOOL_TRUE or lowered in BOOL_FALSE


def _is_iso_date(value: str) -> bool:
    if not ISO_DATE_RE.match(value.strip()):
        return False
    try:
        date.fromisoformat(value.strip()[:10])
        return True
    except ValueError:
        return False


def _is_ru_date(value: str) -> bool:
    match = RU_DATE_RE.match(value.strip())
    if not match:
        return False
    day, month, year = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
    try:
        date(year, month, day)
        return True
    except ValueError:
        return False


def parse_csv(
    data: bytes,
    *,
    filename: str | None,
    delimiter: str | None,
    max_rows: int,
    preview_rows: int,
) -> ParsedCsv:
    if not data.strip():
        raise AppError("CSV_EMPTY", "CSV file is empty", status_code=400)
    encoding, text = decode_csv_bytes(data)
    if not _looks_like_text(text):
        raise AppError("CSV_ENCODING_UNSUPPORTED", "Could not decode CSV as UTF-8 or CP1251", status_code=400)
    if data.startswith(b"\xef\xbb\xbf"):
        warnings_pre = ["UTF-8 BOM detected"]
    else:
        warnings_pre = []
    delim, warnings = detect_delimiter(text, delimiter)
    warnings = warnings_pre + warnings
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    try:
        header_row = next(reader)
    except StopIteration as exc:
        raise AppError("CSV_EMPTY", "CSV file is empty", status_code=400) from exc
    except csv.Error as exc:
        raise AppError("CSV_HEADER_INVALID", "CSV could not be parsed", status_code=400) from exc
    if not header_row or all(not cell.strip() for cell in header_row):
        raise AppError("CSV_HEADER_INVALID", "CSV header row is empty", status_code=400)

    headers, header_warnings = _normalize_headers(header_row)
    warnings.extend(header_warnings)

    rows: list[list[str]] = []
    try:
        for row in reader:
            if len(rows) >= max_rows:
                raise AppError("CSV_TOO_MANY_ROWS", f"CSV exceeds {max_rows} data rows", status_code=400)
            padded = list(row) + [""] * max(0, len(headers) - len(row))
            rows.append(padded[: len(headers)])
    except csv.Error as exc:
        raise AppError("CSV_HEADER_INVALID", "CSV could not be parsed", status_code=400) from exc

    seen: dict[str, int] = {}
    for header in headers:
        key = header.name.casefold()
        if key in seen:
            warnings.append(
                f"Duplicate header '{header.name}' at columns {seen[key] + 1} and {header.index + 1}"
            )
        else:
            seen[key] = header.index
        sample = [row[header.index] for row in rows[: max(preview_rows, 50)]]
        header.suggested_type = infer_type(header.name, sample)

    return ParsedCsv(
        filename=sanitize_filename(filename),
        encoding="utf-8" if encoding in {"utf-8", "utf-8-sig"} else encoding,
        delimiter=delim,
        signature=file_signature(data),
        headers=headers,
        rows=rows,
        warnings=warnings,
    )
