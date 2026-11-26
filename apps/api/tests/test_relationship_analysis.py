import json
import os
import uuid
from datetime import date, timedelta

import pytest

from app.core.errors import AppError
from app.services.relationship import inference, publications
from app.services.relationship.runs import run_one

pytestmark = pytest.mark.asyncio

PUBLICATION = (
    "12 ноября Алексей Иванов, ИТ-директор компании Северный банк, выступил на отраслевой конференции. "
    "В докладе Алексей Иванов рассказал о миграции инфраструктуры в облако и использовании Kubernetes."
)


async def _identity(client):
    email = f"relationship-{uuid.uuid4().hex}@example.com"
    response = await client.post("/api/v1/auth/login", json={"email": email})
    assert response.status_code == 200, response.text
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    workspaces = await client.get("/api/v1/workspaces", headers=headers)
    return headers, workspaces.json()["items"][0]["id"]


@pytest.fixture
async def analysis_dataset(client):
    auth, workspace_id = await _identity(client)
    table = await client.post(f"/api/v1/workspaces/{workspace_id}/tables", headers=auth,
                              json={"name": "Северный банк", "object_type": "person"})
    assert table.status_code == 201, table.text
    table_path = f"/api/v1/tables/{table.json()['id']}"
    try:
        ids = {}
        for label in ("ФИО", "Должность", "Компания", "Роль", "ID контакта",
                      "Связанный контакт", "Тип связи", "Протокол", "Дата встречи", "Ссылка на источник"):
            response = await client.post(f"{table_path}/columns", headers=auth, json={"name": label, "type": "text"})
            assert response.status_code == 201, response.text
            ids[label] = response.json()["id"]

        entries = [
            {"ФИО": "Алексей Иванов", "Должность": "ИТ-директор", "Компания": "Северный банк", "Роль": "ЛПР",
             "ID контакта": "a", "Связанный контакт": "b", "Тип связи": "влияние",
             "Протокол": "Алексей Иванов подписал бюджет пилота. Обсудили облачную миграцию.",
             "Дата встречи": (date.today() - timedelta(days=4)).isoformat()},
            {"ФИО": "Дарья Петрова", "Должность": "Руководитель ИБ", "Компания": "Северный банк", "Роль": "ЛВР",
             "ID контакта": "b", "Протокол": "Дарья Петрова обсудила требования ИБ.",
             "Дата встречи": (date.today() - timedelta(days=110)).isoformat()},
        ]
        rows = []
        for entry in entries:
            response = await client.post(f"{table_path}/rows", headers=auth,
                                         json={"data": {ids[key]: value for key, value in entry.items()}})
            assert response.status_code == 201, response.text
            rows.append(response.json()["id"])
        yield auth, table_path, rows, ids
    finally:
        await client.delete(table_path, headers=auth)


async def _start(client, auth, path):
    response = await client.post(
        path, headers=auth,
        data={"config": json.dumps({"documents": [
            {"title": "Отраслевая конференция", "url": "https://example.org/conference",
             "date": (date.today() - timedelta(days=2)).isoformat()},
            {"title": "Тёзка"},
        ]})},
        files=[
            ("files", ("event.html", f"<article>{PUBLICATION}</article><script>не индексировать</script>", "text/html")),
            ("files", ("other.txt", "Алексей Иванов выступил на конференции и рассказал о Kubernetes.", "text/plain")),
        ],
    )
    assert response.status_code == 202, response.text
    return response.json()


async def test_relationship_job_retains_sources_and_checks_access(client, analysis_dataset, monkeypatch):
    auth, table, rows, ids = analysis_dataset
    path = f"{table}/relationship-analysis"
    outside, _ = await _identity(client)
    assert (await client.get(f"{path}/setup", headers=outside)).status_code == 404

    setup = (await client.get(f"{path}/setup", headers=auth)).json()
    assert setup["columns"]["name"] == ids["ФИО"]
    assert setup["model"] == "gemma4:e2b-mlx"
    started = await _start(client, auth, path)
    assert started["status"] == "queued"
    assert started["report"]["coverage_score"] == 0.5
    assert len(started["report"]["review"]) == 1
    assert started["report"]["contacts"][0]["role_evidence"][0]["row_id"] == rows[0]
    assert (await client.post(path, headers=auth, json={})).status_code == 409
    assert (await client.get(f"{table}/rows/{rows[0]}", headers=outside)).status_code == 404

    async def unreachable(*_):
        raise AppError("AI_PROVIDER_UNAVAILABLE", "Offline", 503)

    monkeypatch.setattr(inference, "extract", unreachable)
    assert await run_one()
    partial = (await client.get(path, headers=auth)).json()
    assert partial["status"] == "partial"
    assert partial["report"]["coverage_score"] == 0.5

    async def classify(schema, _task, fragments):
        if schema is inference.Extractions:
            index = next((index for index, source in enumerate(fragments, 1) if source.kind == "publication"), 0)
            return schema.model_validate({"items": [
                {"source_index": index, "kind": "technology", "text": "Kubernetes",
                 "quote": "использовании Kubernetes"},
                {"source_index": index, "kind": "topic", "text": "Несуществующий факт", "quote": "выдуманная цитата"},
            ]})
        return schema.model_validate({"items": [
            {"source_index": 90, "text": "Недостаточно подтверждений", "quote": "выдуманная цитата"},
        ]})

    monkeypatch.undo()
    monkeypatch.setattr(inference, "_generate", classify)
    assert (await client.post(f"{path}/retry", headers=auth)).status_code == 202
    assert await run_one()
    completed = (await client.get(path, headers=auth)).json()
    assert completed["status"] == "completed"
    contact = completed["report"]["contacts"][0]
    assert contact["technologies"][0]["citations"][0]["url"] == "https://example.org/conference"
    assert all(item["text"] != "Несуществующий факт" for item in contact["professional_topics"])

    path_answer = (await client.post(f"{path}/ask", headers=auth, json={
        "question": "Найди путь", "intent": "path", "contact_id": rows[0], "target_id": rows[1],
    })).json()
    assert path_answer["items"][0]["text"] == "Алексей Иванов → Дарья Петрова"
    assert path_answer["items"][0]["citations"][0]["row_id"] == rows[0]
    question = {"question": "Кто подписал бюджет?", "contact_id": rows[0]}
    answer = (await client.post(f"{path}/ask", headers=auth, json=question)).json()
    assert answer["items"][0]["status"] == "hypothesis"
    assert not answer["items"][0]["citations"]

    assert (await client.patch(f"{table}/rows/{rows[0]}", headers=auth,
                               json={"data": {ids["Роль"]: "ЛВР"}})).status_code == 200
    assert (await client.get(path, headers=auth)).json()["stale"]
    assert (await client.post(f"{path}/ask", headers=auth, json=question)).status_code == 409


@pytest.mark.ollama
@pytest.mark.skipif(os.environ.get("OLLAMA_INTEGRATION_TEST") != "true", reason="requires installed Gemma 4")
async def test_relationship_real_gemma(client, analysis_dataset):
    auth, table, rows, _ = analysis_dataset
    path = f"{table}/relationship-analysis"
    await _start(client, auth, path)
    assert await run_one()
    run = (await client.get(path, headers=auth)).json()
    assert run["status"] == "completed", run["error"]
    assert run["model"] == "gemma4:e2b-mlx"
    answer = await client.post(f"{path}/ask", headers=auth, json={
        "question": "Какую технологию для миграции упомянул Алексей Иванов в докладе? Приведи цитату.",
        "contact_id": rows[0],
    })
    assert answer.status_code == 200, answer.text
    assert answer.json()["model"] == "gemma4:e2b-mlx"
    assert any("Kubernetes" in source["quote"] and source["url"] == "https://example.org/conference"
               for item in answer.json()["items"] for source in item["citations"]), answer.text


async def test_remote_publications_are_persisted_and_retry_only_transient_sources(client, analysis_dataset, monkeypatch):
    auth, table, rows, ids = analysis_dataset
    path = f"{table}/relationship-analysis"
    csv_url = "https://example.org/professional"
    transient_url = "https://example.org/unavailable"
    wrong_contact_url = "https://example.org/wrong-identity"
    blocked_url = "https://example.org/redirect"
    for row, url in zip(rows, (csv_url, wrong_contact_url)):
        response = await client.patch(f"{table}/rows/{row}", headers=auth, json={"data": {ids["Ссылка на источник"]: url}})
        assert response.status_code == 200

    attempts = []

    async def download(url):
        attempts.append(url)
        if url == transient_url and attempts.count(url) == 1:
            raise publications.PublicationError("Сайт вернул HTTP 503.", retryable=True)
        if url == blocked_url:
            raise publications.PublicationError("Сайт разрешается в непубличный адрес.", blocked=True)
        title = "Беседа об инфраструктуре" if url == transient_url else "Отраслевая конференция"
        return publications.DownloadedPublication(url, PUBLICATION, title, date.today())

    async def generate(schema, _task, fragments):
        if schema is inference.Replies:
            index = next(index for index, source in enumerate(fragments, 1) if source.url == csv_url)
            return schema.model_validate({"items": [{"source_index": index, "text": "Kubernetes", "quote": "использовании Kubernetes"}]})
        return schema.model_validate({"items": []})

    monkeypatch.setattr(publications, "download_publication", download)
    monkeypatch.setattr(inference, "_generate", generate)

    default = await client.post(path, headers=auth, json={})
    assert default.status_code == 202
    assert default.json()["report"]["publications"] == []
    assert await run_one()
    assert not attempts

    invalid = await client.post(path, headers=auth, json={"urls": ["http://example.org/news"]})
    assert invalid.status_code == 422

    started = await client.post(path, headers=auth, json={
        "urls": [transient_url, transient_url + "#section", blocked_url], "fetch_csv_urls": True,
    })
    assert started.status_code == 202, started.text
    assert len(started.json()["report"]["publications"]) == 4
    assert all(item["state"] == "pending" for item in started.json()["report"]["publications"])
    assert not attempts
    assert await run_one()
    report = (await client.get(path, headers=auth)).json()
    assert report["status"] == "partial"
    statuses = {item["url"]: item["state"] for item in report["report"]["publications"]}
    assert statuses == {transient_url: "unavailable", csv_url: "included", wrong_contact_url: "review", blocked_url: "blocked"}
    professional = report["report"]["contacts"][0]["professional_topics"]
    assert any(citation["url"] == csv_url and citation["row_id"] == rows[0]
               for finding in professional for citation in finding["citations"])

    assert (await client.post(f"{path}/retry", headers=auth)).status_code == 202
    assert await run_one()
    report = (await client.get(path, headers=auth)).json()
    assert report["status"] == "completed"
    assert attempts.count(transient_url) == 2
    assert attempts.count(csv_url) == attempts.count(wrong_contact_url) == attempts.count(blocked_url) == 1
    answer = await client.post(f"{path}/ask", headers=auth, json={
        "question": "Какую технологию упомянул в докладе Алексей Иванов?", "contact_id": rows[0],
    })
    assert answer.status_code == 200
    assert answer.json()["items"][0]["citations"][0]["url"] == csv_url


async def test_manual_review_keeps_unconfirmed_text_out_of_inference_and_persists_decision(client, analysis_dataset, monkeypatch):
    auth, table, rows, _ = analysis_dataset
    reviewer = (await client.get("/api/v1/auth/me", headers=auth)).json()["name"]
    path = f"{table}/relationship-analysis"
    content = "Алексей Иванов рассказал о ClickHouse и аналитике данных."
    source_batches = []

    async def extract(sources):
        source_batches.extend(sources)
        return []

    monkeypatch.setattr(inference, "extract", extract)
    started = await client.post(path, headers=auth,
                                data={"config": json.dumps({"documents": [
                                    {"title": "Доклад без компании"}, {"title": "Не относится к клиенту"},
                                    {"title": "Материал для устаревшего отчёта"},
                                ]})},
                                files=[
                                    ("files", ("one.txt", content, "text/plain")),
                                    ("files", ("two.txt", "Доклад постороннего специалиста.", "text/plain")),
                                    ("files", ("three.txt", "Ещё одна публикация без совпадений.", "text/plain")),
                                ])
    assert started.status_code == 202
    run_id = started.json()["id"]
    reviews = started.json()["report"]["review"]
    assert len(reviews) == 3
    first, second, third = [f"{path}/{run_id}/reviews/{item['source_id']}" for item in reviews]
    preview = await client.get(first, headers=auth)
    assert preview.status_code == 200
    assert preview.json()["text"] == content
    assert (await client.post(first, headers=auth, json={"action": "confirmed", "contact_id": rows[0]})).status_code == 409
    outsider, _ = await _identity(client)
    assert (await client.get(first, headers=outsider)).status_code == 404
    assert (await client.post(first, headers=outsider, json={"action": "confirmed", "contact_id": rows[0]})).status_code == 404

    assert await run_one()
    assert all("ClickHouse" not in source.text for source in source_batches)
    assert (await client.post(first, headers=auth, json={"action": "confirmed", "contact_id": str(uuid.uuid4())})).status_code == 422
    rejected = await client.post(second, headers=auth, json={"action": "rejected", "note": "Другая компания"})
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "completed"
    assert rejected.json()["report"]["review"][1]["decision"]["note"] == "Другая компания"
    assert (await client.get(second, headers=auth)).status_code == 404

    decision = {"action": "confirmed", "contact_id": rows[0], "note": "Подтверждено по записи мероприятия"}
    confirmed = await client.post(first, headers=auth, json=decision)
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "queued"
    assert confirmed.json()["id"] == run_id
    audit = confirmed.json()["report"]["review"][0]["decision"]
    assert audit["reviewer"] == reviewer
    assert audit["contact_name"] == "Алексей Иванов"
    identical = await client.post(first, headers=auth, json=decision)
    assert identical.status_code == 200
    assert identical.json()["report"]["review"][0]["decision"] == audit
    assert (await client.post(first, headers=auth, json={"action": "rejected"})).status_code == 409

    assert await run_one()
    assert any("ClickHouse" in source.text and source.verification is not None for source in source_batches)
    persisted = (await client.get(path, headers=auth)).json()
    assert persisted["status"] == "completed"
    publications = persisted["report"]["contacts"][0]["professional_topics"]
    source = next(cite for item in publications for cite in item["citations"] if cite["source_id"] == reviews[0]["source_id"])
    assert source["verification"]["reviewed_at"] == audit["reviewed_at"]
    assert source["quote"] == content
    assert all("постороннего" not in source.text for source in source_batches)

    changed = await client.patch(f"{table}/rows/{rows[0]}", headers=auth, json={"data": {}})
    assert changed.status_code == 200
    assert (await client.post(third, headers=auth, json={"action": "rejected"})).status_code == 409


async def test_recording_is_sent_to_local_transcription_and_retained_as_one_interaction(client, analysis_dataset, monkeypatch):
    import base64
    from app.services.relationship import audio

    auth, table, rows, _ = analysis_dataset
    path = f"{table}/relationship-analysis"
    audio_bytes = b"demo-data-for-transport"

    async def transcribe(encoded, suffix):
        assert suffix == ".wav"
        assert base64.b64decode(encoded) == audio_bytes
        return [
            audio.Segment("Согласовали миграцию инфраструктуры в облако.", 0, 24),
            audio.Segment("Клиент недоволен сроками и озвучил претензию.", 24, 31),
        ]

    async def generate(schema, _task, sources):
        if schema is inference.Replies:
            assert any(source.start_seconds is not None for source in sources)
            return schema.model_validate({"items": [{"source_index": 0, "text": "Предлагаю обсудить сроки.", "quote": ""}]})
        return schema.model_validate({"items": []})

    monkeypatch.setattr(audio, "transcribe", transcribe)
    monkeypatch.setattr(inference, "_generate", generate)
    started = await client.post(path, headers=auth, data={"config": json.dumps({
        "documents": [{"title": "Запись встречи", "contact": "Алексей Иванов", "date": date.today().isoformat()}],
    })}, files={"files": ("session.wav", audio_bytes, "audio/wav")})
    assert started.status_code == 202, started.text
    assert started.json()["report"]["recordings"][0]["state"] == "pending"
    assert await run_one()

    run = (await client.get(path, headers=auth)).json()
    assert run["status"] == "completed"
    assert run["report"]["recordings"][0]["state"] == "transcribed"
    contact = run["report"]["contacts"][0]
    assert contact["touches_90d"] == 2
    timeline = next(item for item in contact["interactions"] if item["channel"] == "Аудиозапись")
    assert timeline["sentiment"] == "negative"
    assert timeline["summary"]["citations"][0]["start_seconds"] == 0
    assert timeline["summary"]["citations"][0]["end_seconds"] == 24
    answer = await client.post(f"{path}/ask", headers=auth, json={
        "question": "Подготовь письмо о миграции и сроках.", "intent": "email", "contact_id": rows[0],
    })
    assert answer.status_code == 200
    assert answer.json()["items"][0]["status"] == "draft"


async def test_scheduled_feed_refresh_reloads_new_items_and_stops_when_table_changes(client, analysis_dataset, monkeypatch):
    from datetime import datetime, timezone

    from sqlalchemy import update

    from app.db.session import SessionLocal
    from app.models.relationship import RelationshipAnalysisRun
    from app.services.relationship import discovery

    auth, table, rows, _ = analysis_dataset
    path = f"{table}/relationship-analysis"
    checked = 0
    downloads = []

    async def load_feed(_url):
        nonlocal checked
        checked += 1
        return [
            discovery.Entry(f"https://example.org/event-{number}", f"Конференция {number}", PUBLICATION, date.today())
            for number in range(1, checked + 1)
        ]

    async def download(url):
        downloads.append(url)
        return publications.DownloadedPublication(url, PUBLICATION, "Конференция", date.today())

    async def extract(_sources):
        return []

    monkeypatch.setattr(discovery, "load_feed", load_feed)
    monkeypatch.setattr(publications, "download_publication", download)
    monkeypatch.setattr(inference, "extract", extract)
    started = await client.post(path, headers=auth, json={
        "feed_urls": ["https://example.org/rss"], "refresh_hours": 24,
    })
    assert started.status_code == 202, started.text
    run_id = uuid.UUID(started.json()["id"])
    assert started.json()["next_refresh_at"] is not None
    assert await run_one()
    initial = (await client.get(path, headers=auth)).json()
    assert len(initial["report"]["publications"]) == 1

    async def set_due():
        async with SessionLocal.begin() as session:
            await session.execute(update(RelationshipAnalysisRun).where(RelationshipAnalysisRun.id == run_id)
                                  .values(next_refresh_at=datetime.now(timezone.utc) - timedelta(seconds=1)))

    await set_due()
    assert await run_one()
    refreshed = (await client.get(path, headers=auth)).json()
    assert refreshed["id"] == str(run_id)
    assert refreshed["status"] == "completed"
    assert len(refreshed["report"]["publications"]) == 2
    assert downloads == ["https://example.org/event-1", "https://example.org/event-2"]
    assert refreshed["report"]["feeds"][0]["discovered"] == 1

    assert (await client.patch(f"{table}/rows/{rows[0]}", headers=auth, json={"data": {}})).status_code == 200
    await set_due()
    assert not await run_one()
    assert (await client.get(path, headers=auth)).json()["next_refresh_at"] is None
    stopped = await client.patch(f"{path}/refresh", headers=auth, json={"hours": None})
    assert stopped.status_code == 200
    assert stopped.json()["refresh_hours"] is None


async def test_extracted_link_requires_editor_approval_before_entering_graph(client, analysis_dataset, monkeypatch):
    from app.schemas.relationship import Finding
    from app.services.relationship.text import cite

    auth, table, rows, ids = analysis_dataset
    path = f"{table}/relationship-analysis"
    quote = "Дарья Петрова — подчинённая, Алексей Иванов — руководитель."
    changed = await client.patch(f"{table}/rows/{rows[1]}", headers=auth, json={"data": {ids["Протокол"]: quote}})
    assert changed.status_code == 200

    async def extract(sources):
        return [
            (rows[1], "relationship", Finding(text="reports_to | Алексей Иванов", citations=[cite(source, quote)]))
            for source in sources if source.text == quote
        ]

    monkeypatch.setattr(inference, "extract", extract)
    assert (await client.post(path, headers=auth, json={})).status_code == 202
    assert await run_one()
    run = (await client.get(path, headers=auth)).json()
    assert len(run["report"]["connections"]) == 1
    proposal, = run["report"]["proposed_relationships"]
    assert proposal["finding"]["citations"][0]["quote"] == quote
    assert proposal["from_id"] == rows[1]
    approve = f"{path}/{run['id']}/relationships/approve"
    approved = await client.post(approve, headers=auth, json={"proposal_id": proposal["id"]})
    assert approved.status_code == 200, approved.text
    assert len(approved.json()["report"]["connections"]) == 2
    replay = await client.post(approve, headers=auth, json={"proposal_id": proposal["id"]})
    assert replay.status_code == 200
    assert len(replay.json()["report"]["connections"]) == 2
    assert await run_one()
    fetched = (await client.get(path, headers=auth)).json()
    assert fetched["report"]["proposed_relationships"] == []
    assert any(citation["verification"] for link in fetched["report"]["relationships"] for citation in link["citations"])


async def test_publish_analysis_columns_and_resolve_contact_card_by_row(client, analysis_dataset, monkeypatch):
    from app.services.relationship.output import OUTPUT_COLUMNS

    auth, table, rows, ids = analysis_dataset
    path = f"{table}/relationship-analysis"

    async def extract(_sources):
        return []

    monkeypatch.setattr(inference, "extract", extract)
    collision = await client.post(f"{table}/columns", headers=auth, json={"name": "decision_role", "type": "text"})
    assert collision.status_code == 201
    original_role = collision.json()["id"]
    assert (await client.patch(f"{table}/rows/{rows[0]}", headers=auth,
                               json={"data": {original_role: "CRM untouched"}})).status_code == 200
    history = await client.post(f"{table}/rows", headers=auth, json={"data": {
        ids["ФИО"]: "Алексей Иванов", ids["Компания"]: "Северный банк", ids["ID контакта"]: "a",
    }})
    assert history.status_code == 201
    second_row = history.json()["id"]
    assert (await client.post(f"{table}/columns", headers=auth, json={
        "name": "Spoof", "type": "text", "config": {"relationship_output": "next_action"},
    })).status_code == 400

    started = await client.post(path, headers=auth, json={"columns": {"role": ids["Роль"]}})
    assert started.status_code == 202, started.text
    run_id = started.json()["id"]
    publish = f"{path}/{run_id}/publish"
    assert (await client.post(publish, headers=auth)).status_code == 409
    assert await run_one()
    first = await client.post(publish, headers=auth)
    assert first.status_code == 200, first.text
    assert first.json()["updated_rows"] == 3
    assert len(first.json()["columns"]) == len(OUTPUT_COLUMNS)
    assert "decision_role · анализ" in first.json()["columns"]
    repeated = await client.post(publish, headers=auth)
    assert repeated.json()["updated_rows"] == 0

    listed = (await client.get(f"{table}/columns", headers=auth)).json()["items"]
    outputs = {col["config"]["relationship_output"]: col["id"] for col in listed if "relationship_output" in col["config"]}
    assert outputs.keys() == OUTPUT_COLUMNS.keys()
    current = {row["id"]: row["data"] for row in (await client.get(f"{table}/rows", headers=auth)).json()["items"]}
    assert current[rows[0]][original_role] == "CRM untouched"
    assert current[rows[0]][outputs["decision_role"]] == "ЛПР"
    assert "Дарья Петрова" in current[rows[0]][outputs["influence_scope"]]
    assert current[rows[0]][outputs["next_action"]] == current[second_row][outputs["next_action"]]
    assert current[rows[1]][outputs["next_action"]] != current[second_row][outputs["next_action"]]
    assert current[rows[0]][outputs["coverage_score"]] == 0.5
    assert current[rows[0]][outputs["next_action_author"]] == "Правила Sammi"
    assert "Строка CRM" in current[rows[0]][outputs["next_action_sources"]]
    assert (await client.get(path, headers=auth)).json()["stale"] is False

    card_url = f"{path}/contacts/by-row/{second_row}"
    card = (await client.get(card_url, headers=auth)).json()
    assert card["contact"]["id"] == rows[0]
    assert card["contact"]["name"] == "Алексей Иванов"
    assert card["contact"]["next_action"]["text"] == current[rows[0]][outputs["next_action"]]
    outsider, _ = await _identity(client)
    assert (await client.get(card_url, headers=outsider)).status_code == 404
    assert (await client.post(publish, headers=outsider)).status_code == 404

    exported = await client.get(f"{table}/export.csv", headers=auth)
    assert exported.status_code == 200
    assert "next_action_sources" in exported.text and "CRM untouched" in exported.text
    assert (await client.patch(f"{table}/rows/{second_row}", headers=auth,
                               json={"data": {ids["ФИО"]: "Другой Человек"}})).status_code == 200
    assert (await client.get(card_url, headers=auth)).json() is None
    assert (await client.post(publish, headers=auth)).status_code == 409


async def test_web_search_queues_publications_and_attributes_results_to_the_correct_contact(client, analysis_dataset, monkeypatch):
    from app.core.config import get_settings
    from app.services.relationship import web_search

    auth, table, rows, _ = analysis_dataset
    path = f"{table}/relationship-analysis"
    monkeypatch.setattr(get_settings(), "relationship_search_base_url", "")
    denied = await client.post(path, headers=auth, json={"web_search": True})
    assert denied.status_code == 422
    monkeypatch.setattr(get_settings(), "relationship_search_base_url", "http://127.0.0.1:8888")
    good = "https://example.org/alexey"
    wrong = "https://example.org/another"
    used = []

    async def batches(_corpus):
        yield [
            web_search.Outcome([rows[0]], [web_search.SearchResult(good, "Доклад руководителя ИТ")]),
            web_search.Outcome([rows[1]], [web_search.SearchResult(wrong, "Ещё одна публикация")]),
        ]

    async def download(url):
        used.append(url)
        return publications.DownloadedPublication(url, PUBLICATION, "Конференция", date.today())

    async def extract(_sources):
        return []

    monkeypatch.setattr(web_search, "batches", batches)
    monkeypatch.setattr(publications, "download_publication", download)
    monkeypatch.setattr(inference, "extract", extract)
    started = await client.post(path, headers=auth, json={"web_search": True, "refresh_hours": 24})
    assert started.status_code == 202
    assert started.json()["report"]["web_search"]["state"] == "pending"
    assert started.json()["next_refresh_at"] is not None
    assert await run_one()
    report = (await client.get(path, headers=auth)).json()["report"]
    assert used == [good, wrong]
    assert report["web_search"]["searched_contacts"] == 2
    assert report["web_search"]["discovered"] == 2
    assert {item["url"]: item["state"] for item in report["publications"]} == {good: "included", wrong: "review"}
    assert report["contacts"][0]["public_events"][0]["citations"][0]["url"] == good
    assert not report["contacts"][1]["public_events"]


async def test_contact_csv_queues_search_and_saves_all_five_presentation_tables(client, monkeypatch):
    from sqlalchemy import update

    from app.core.config import get_settings
    from app.db.session import SessionLocal
    from app.models.relationship import RelationshipAnalysisRun
    from app.models.user import utc_now
    from app.services.relationship import web_search

    auth, workspace = await _identity(client)
    today = date.today().isoformat()
    raw = {
        "full_name": "Алексей Иванов", "contact_id": "EMP-A", "company": "Северный банк",
        "title": "ИТ-директор", "department": "ИТ", "decision_authority": "да", "reports_to_id": "EMP-B",
        "internal_owner": "Клиентский менеджер", "relationship_status": "Активные",
        "industry": "Финансы", "deal_value_total": "1200000", "active_projects": "Пилот",
        "employee_id": "MANAGER-1", "occurred_at": f"{today}T11:45:00+03:00", "channel": "Видеозвонок",
        "direction": "Входящее", "interaction_type": "Демонстрация", "project_id": "P-1",
        "summary": "Обсудили Kubernetes", "outcome": "Согласовали пилот", "feedback": "Положительно",
        "next_step": "Запланировать встречу", "source_id": "MEETING-1",
        "influence_scope": "Архитектура", "strength": "0.8", "valid_from": today,
    }
    second = {"full_name": "Дарья Петрова", "contact_id": "EMP-B", "company": "Северный банк", "title": "Руководитель ИБ"}
    columns = list(raw)
    csv = "\n".join([",".join(columns), ",".join(raw.values()), ",".join(second.get(column, "") for column in columns)])
    imports = f"/api/v1/workspaces/{workspace}/imports/csv"
    files = {"file": ("contacts.csv", csv.encode(), "text/csv")}
    preview = await client.post(f"{imports}/preview", headers=auth, files=files)
    assert preview.status_code == 200
    url = "https://example.org/conference"
    later_url = "https://example.org/news"
    scans = 0

    async def batches(corpus):
        nonlocal scans
        scans += 1
        assert corpus.company == "Северный банк"
        assert len(corpus.contacts) == 2
        result = url if scans == 1 else later_url
        yield [web_search.Outcome([corpus.contacts[0].id], [web_search.SearchResult(result, "Конференция")]),
               web_search.Outcome([corpus.contacts[1].id], [])]

    async def download(value):
        assert value in {url, later_url}
        return publications.DownloadedPublication(value, PUBLICATION, "Конференция", date.today())

    async def extract(_sources):
        return []

    monkeypatch.setattr(get_settings(), "relationship_search_base_url", "http://searxng:8080")
    monkeypatch.setattr(web_search, "batches", batches)
    monkeypatch.setattr(publications, "download_publication", download)
    monkeypatch.setattr(inference, "extract", extract)
    imported = await client.post(imports, headers=auth, files=files, data={
        "mapping_json": json.dumps({"columns": [
            {"csv_index": index, "action": "create", "name": name,
             "type": "date" if name == "occurred_at" else "text"} for index, name in enumerate(columns)
        ]}),
        "options_json": json.dumps({"table_name": "Северный банк", "object_type": "person", "analyze_relationships": True,
                                    "file_signature": preview.json()["file_signature"]}),
    })
    assert imported.status_code == 200, imported.text
    assert imported.json()["analysis_started"] and imported.json()["analysis_error"] is None
    table = f"/api/v1/tables/{imported.json()['table_id']}"
    try:
        state = (await client.get(f"{table}/relationship-analysis", headers=auth)).json()
        assert state["status"] == "queued" and state["refresh_hours"] == 24
        assert await run_one()
        finished = (await client.get(f"{table}/relationship-analysis", headers=auth)).json()
        assert finished["status"] == "completed"
        assert finished["report"]["web_search"]["discovered"] == 1
        dataset_ids = {item["entity"]: item["table_id"] for item in finished["datasets"]}
        expected = {
            "companies": "industry active_projects deal_value_total last_deal_at last_interaction_at coverage_score relationship_score account_risks strategic_signals technology_stack",
            "contacts": "decision_role decision_authority influence_level department reports_to_id internal_owner last_touch_at touches_90d relationship_status loyalty_assessment relationship_trend professional_topics technologies_mentioned public_appearances profile_confidence next_action",
            "interactions": "contact_id employee_id occurred_at channel direction interaction_type project_id topics summary outcome feedback next_step source_id",
            "public_events": "person_id event_type event_title event_date organizer person_role source_url topics technologies explicit_positions evidence_excerpt confidence collected_at",
            "relationships": "source_contact_id target_contact_id relationship_type project_id influence_scope strength valid_from valid_to confidence",
        }
        assert set(dataset_ids) == set(expected)
        entries = {}
        row_ids = {}
        for key, columns in expected.items():
            target = f"/api/v1/tables/{dataset_ids[key]}"
            listed = (await client.get(f"{target}/columns", headers=auth)).json()["items"]
            ids = {col["id"]: col["name"] for col in listed}
            assert [name for name in ids.values() if name in columns.split()] == columns.split()
            actual = (await client.get(f"{target}/rows", headers=auth)).json()["items"]
            entries[key] = [{ids[identifier]: value for identifier, value in row["data"].items()} for row in actual]
            row_ids[key] = [row["id"] for row in actual]
            exported = await client.get(f"{target}/export.csv", headers=auth)
            assert exported.status_code == 200 and columns.split()[-1] in exported.text.splitlines()[0]
            assert (await client.post(f"{target}/rows", headers=auth, json={"data": {}})).status_code == 409

        company = entries["companies"][0]
        assert company["industry"] == "Финансы" and company["deal_value_total"] == 1200000
        contact = entries["contacts"][0]
        assert contact["reports_to_id"] == "EMP-B" and contact["decision_authority"] is True and contact["next_action"]
        interaction = entries["interactions"][0]
        assert interaction["occurred_at"] == f"{today}T11:45:00+03:00"
        assert interaction["contact_id"] == "EMP-A" and interaction["interaction_type"] == "Демонстрация"
        assert interaction["source_id"] == "MEETING-1" and interaction["employee_id"] == "MANAGER-1"
        event = entries["public_events"][0]
        assert event["person_id"] == "EMP-A" and event["source_url"] == url and "Kubernetes" in event["evidence_excerpt"]
        edge = entries["relationships"][0]
        assert edge["relationship_type"] == "reports_to" and edge["target_contact_id"] == "EMP-B"
        assert edge["strength"] == 0.8
        published = await client.post(f"{table}/relationship-analysis/{finished['id']}/publish", headers=auth)
        assert published.status_code == 200
        assert {item["entity"]: item["table_id"] for item in published.json()["datasets"]} == dataset_ids
        saved = await client.get(f"/api/v1/tables/{dataset_ids['public_events']}/rows", headers=auth)
        assert [row["id"] for row in saved.json()["items"]] == row_ids["public_events"]
        async with SessionLocal.begin() as session:
            await session.execute(update(RelationshipAnalysisRun)
                                  .where(RelationshipAnalysisRun.id == uuid.UUID(finished["id"]))
                                  .values(next_refresh_at=utc_now() - timedelta(seconds=1)))
        assert await run_one() and scans == 2
        refreshed = (await client.get(f"{table}/relationship-analysis", headers=auth)).json()
        assert {item["entity"]: item["table_id"] for item in refreshed["datasets"]} == dataset_ids
        assert later_url in {item["url"] for item in refreshed["report"]["publications"]}
        saved = await client.get(f"/api/v1/tables/{dataset_ids['public_events']}/rows", headers=auth)
        assert len(saved.json()["items"]) == 2
        assert row_ids["public_events"][0] in {row["id"] for row in saved.json()["items"]}
    finally:
        assert (await client.delete(table, headers=auth)).status_code == 204
