import pytest

from app.core.errors import AppError
from app.services.csv.parser import infer_type, parse_csv
from tests.csv_support import csv_bytes


def _parse(data: bytes, filename: str = "file.csv", delimiter: str | None = None):
    return parse_csv(data, filename=filename, delimiter=delimiter, max_rows=10000, preview_rows=20)


def test_utf8_comma() -> None:
    parsed = _parse(csv_bytes("companies.csv"), "companies.csv")
    assert parsed.encoding == "utf-8"
    assert parsed.delimiter == ","
    assert parsed.row_count == 3
    assert [header.name for header in parsed.headers] == ["Company", "Employees", "Active"]
    assert parsed.headers[1].suggested_type == "number"
    assert parsed.headers[2].suggested_type == "boolean"


def test_utf8_bom() -> None:
    data = b"\xef\xbb\xbf" + csv_bytes("companies.csv")
    parsed = _parse(data, "companies.csv")
    assert parsed.encoding == "utf-8"
    assert parsed.row_count == 3
    assert parsed.headers[0].name == "Company"


def test_semicolon() -> None:
    parsed = _parse(csv_bytes("russian_semicolon.csv"), "russian_semicolon.csv")
    assert parsed.delimiter == ";"
    assert parsed.headers[0].name == "Компания"
    assert parsed.rows[0][0] == "Селектел"


def test_tab_delimiter() -> None:
    parsed = _parse(csv_bytes("tab.tsv"), "tab.tsv", delimiter="tab")
    assert parsed.delimiter == "\t"
    assert parsed.row_count == 2


def test_quoted_commas() -> None:
    parsed = _parse(csv_bytes("quoted_commas.csv"))
    assert parsed.rows[0][1] == "Hello, world"
    assert parsed.rows[1][1] == 'He said "go"'


def test_quoted_semicolons() -> None:
    data = 'Name;Note\nAcme;"a;b"\n'.encode("utf-8")
    parsed = _parse(data, delimiter="semicolon")
    assert parsed.rows[0][1] == "a;b"


def test_quoted_multiline() -> None:
    data = b'Name,Note\nAcme,"line1\nline2"\n'
    parsed = _parse(data)
    assert parsed.rows[0][1] == "line1\nline2"


def test_crlf_and_lf() -> None:
    crlf = _parse(b"A,B\r\n1,2\r\n")
    lf = _parse(b"A,B\n1,2\n")
    assert crlf.rows == [["1", "2"]]
    assert lf.rows == [["1", "2"]]


def test_empty_and_duplicate_headers() -> None:
    parsed = _parse(b"Name,,Name\nA,1,B\n")
    assert parsed.headers[1].name == "Column 2"
    assert parsed.headers[0].name == "Name"
    assert parsed.headers[2].name == "Name"
    assert any("Empty header" in warning for warning in parsed.warnings)
    assert any("Duplicate header" in warning for warning in parsed.warnings)


def test_empty_values() -> None:
    parsed = _parse(b"A,B\n1,\n,2\n")
    assert parsed.rows[0][1] == ""
    assert parsed.rows[1][0] == ""


def test_cp1251() -> None:
    data = "Компания;Город\nСелектел;Санкт-Петербург\n".encode("cp1251")
    parsed = _parse(data, "win.csv")
    assert parsed.encoding == "cp1251"
    assert parsed.rows[0][0] == "Селектел"


def test_inn_stays_text() -> None:
    assert infer_type("ИНН", ["7707083893", "7736207543"]) == "text"
    assert infer_type("Employees", ["250", "40"]) == "number"
    assert infer_type("id", ["1001", "1002"]) == "text"


def test_boolean_and_date_inference() -> None:
    assert infer_type("Active", ["true", "false"]) == "boolean"
    assert infer_type("Ok", ["да", "нет"]) == "boolean"
    assert infer_type("Created", ["2024-01-02", "2024-03-04"]) == "date"
    assert infer_type("Created", ["02.01.2024", "03.04.2024"]) == "date"
    assert infer_type("Created", ["01/02/03", "02/03/04"]) == "text"


def test_email_url() -> None:
    assert infer_type("Email", ["a@b.com", "c@d.com"]) == "email"
    assert infer_type("Site", ["https://a.com", "https://b.com"]) == "url"


def test_empty_csv() -> None:
    with pytest.raises(AppError) as exc:
        _parse(b"   ")
    assert exc.value.code == "CSV_EMPTY"


def test_header_only() -> None:
    parsed = _parse(b"Company,Employees\n")
    assert parsed.row_count == 0
    assert len(parsed.headers) == 2


def test_too_many_rows() -> None:
    body = "A,B\n" + "1,2\n" * 5
    with pytest.raises(AppError) as exc:
        parse_csv(body.encode(), filename="x.csv", delimiter="comma", max_rows=3, preview_rows=20)
    assert exc.value.code == "CSV_TOO_MANY_ROWS"


def test_unsupported_encoding() -> None:
    with pytest.raises(AppError) as exc:
        _parse(bytes(range(32)))
    assert exc.value.code == "CSV_ENCODING_UNSUPPORTED"
