from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "csv"


def csv_bytes(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()
