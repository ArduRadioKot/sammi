from datetime import date, datetime, timezone
from io import BytesIO
from zipfile import ZipFile

from app.schemas.relationship import Contact, Corpus, FeedStatus, Source
from app.services.relationship.discovery import _entries, apply_feed
from app.services.relationship.retrieval import hybrid_rank
from app.services.relationship.text import read_document

NOW = datetime(2026, 11, 26, tzinfo=timezone.utc)


def test_local_latent_retrieval_matches_business_paraphrase():
    sources = [
        Source(id="cloud", kind="interaction", label="Протокол", text="Согласовали миграцию инфраструктуры в облако.", collected_at=NOW),
        Source(id="security", kind="interaction", label="Заметка", text="Модель доступа проверяет аудит безопасности.", collected_at=NOW),
        Source(id="budget", kind="crm", label="Расходы", text="Черновик сметы лежит в CRM.", collected_at=NOW),
    ]
    assert [item.id for item in hybrid_rank("перенос сервисов", sources, 1)] == ["cloud"]
    assert hybrid_rank("тепловой удар", sources, 3) == []


def test_read_powerpoint_in_presentation_order():
    buf = BytesIO()
    base = "http://schemas.openxmlformats.org"
    with ZipFile(buf, "w") as archive:
        archive.writestr("ppt/presentation.xml",
                         f'<p:presentation xmlns:p="{base}/presentationml/2006/main" '
                         f'xmlns:r="{base}/officeDocument/2006/relationships">'
                         '<p:sldIdLst><p:sldId r:id="second"/><p:sldId r:id="first"/></p:sldIdLst></p:presentation>')
        archive.writestr("ppt/_rels/presentation.xml.rels",
                         '<Relationships><Relationship Id="first" Target="slides/slide1.xml"/>'
                         '<Relationship Id="second" Target="slides/slide2.xml"/></Relationships>')
        for index, text in [(1, "Локальный отчёт"), (2, "Карта решений")]:
            archive.writestr(f"ppt/slides/slide{index}.xml", f'<a:p xmlns:a="{base}/drawingml/2006/main"><a:t>{text}</a:t></a:p>')
    assert read_document("program.pptx", buf.getvalue()) == "Слайд 1. Карта решений Слайд 2. Локальный отчёт"


def test_feed_selects_only_public_relevant_and_not_seen_entries():
    rss = b"""<rss><channel>
      <item><title>Alexander Petrov cloud talk</title><link>/talk</link><pubDate>Mon, 23 Nov 2026 12:00:00 GMT</pubDate></item>
      <item><title>Alexander Petrov old talk</title><link>/old</link><pubDate>Wed, 01 Jan 2020 12:00:00 GMT</pubDate></item>
      <item><title>Alexander Petrov invalid</title><link>http://127.0.0.1/</link></item>
      <item><title>Unrelated release</title><link>/release</link></item>
    </channel></rss>"""
    atom = b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Update Alexander Petrov</title><link href="/api"/><updated>2026-11-24T15:00:00Z</updated></entry></feed>'
    feed = FeedStatus(url="https://example.org/rss")
    corpus = Corpus(company="Public Co", collected_at=NOW, contacts=[
        Contact(id="one", key="one", name="Alexander Petrov", title="CTO", department="IT"),
    ], sources=[], relationships=[], review=[])
    entries = _entries(feed.url, rss) + _entries(feed.url, atom)
    apply_feed(corpus, feed, entries, NOW.date())
    apply_feed(corpus, feed, entries, NOW.date())
    assert feed.discovered == 2
    assert [item.url for item in corpus.publications] == ["https://example.org/api", "https://example.org/talk"]
    assert corpus.publications[0].occurred_at == date(2026, 11, 24)


def test_coverage_counts_distinct_confirmed_roles():
    from app.services.relationship.metrics import build_report

    corpus = Corpus(company="Компания", collected_at=NOW, contacts=[
        Contact(id="active", key="active", name="Первый Участник", title="", department="", role="decision_maker"),
        Contact(id="same", key="same", name="Второй Участник", title="", department="", role="decision_maker"),
        Contact(id="different", key="different", name="Третий Участник", title="", department="", role="influencer"),
    ], sources=[
        Source(id="interaction", kind="interaction", label="Встреча", text="Согласован бюджет.", contact_id="active",
               occurred_at=NOW.date(), collected_at=NOW),
    ], relationships=[], review=[])
    report = build_report(corpus)
    assert report.coverage_score == 0.5
    assert report.covered_key_roles == 1 and report.key_roles == 2
    assert report.covered_key_contacts == 1 and report.key_contacts == 3
