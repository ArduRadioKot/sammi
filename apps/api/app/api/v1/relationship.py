import asyncio
from pathlib import PurePath
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

from app.api.deps import get_current_user
from app.core.errors import AppError
from app.db.session import get_db
from app.models.user import User
from app.schemas.relationship import (
    AnalysisAnswer, AnalysisRead, AnalysisRequest, AnalysisSetup, AskRequest, ContactCard, PublishedAnalysis,
    PublicationReviewRequest, RefreshRequest, RelationshipApproval, ReviewPreview,
)
from app.services.relationship.audio import is_recording
from app.services.relationship.prepare import Document
from app.services.relationship.runs import AnalysisService
from app.services.relationship.text import MAX_FILE_BYTES, read_document

router = APIRouter(prefix="/tables/{table_id}/relationship-analysis", tags=["relationship analysis"])
MAX_FILES = 8


@router.get("/setup", response_model=AnalysisSetup)
async def setup(table_id: UUID, user: User = Depends(get_current_user),
                session: AsyncSession = Depends(get_db)) -> AnalysisSetup:
    return await AnalysisService(session).setup(table_id, user)


@router.get("", response_model=AnalysisRead | None)
async def status(table_id: UUID, user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_db)) -> AnalysisRead | None:
    return await AnalysisService(session).get(table_id, user)


@router.post("", response_model=AnalysisRead, status_code=202)
async def start(table_id: UUID, request: Request, user: User = Depends(get_current_user),
                session: AsyncSession = Depends(get_db)) -> AnalysisRead:
    service = AnalysisService(session)
    await service.authorize_start(table_id, user)
    try:
        if request.headers.get("content-type", "").startswith("application/json"):
            body = AnalysisRequest.model_validate(await request.json())
            documents = []
        else:
            body, documents = await _read_uploads(request)
    except (ValueError, ValidationError) as exc:
        raise AppError("RELATIONSHIP_INPUT_INVALID", "Проверьте сопоставление столбцов и описание файлов.", 422) from exc
    if len(body.documents) != len(documents):
        raise AppError("RELATIONSHIP_DOCUMENT_METADATA", "Для каждого файла нужно описание источника.", 422)
    return await service.start(table_id, user, body, documents)


async def _read_uploads(request: Request) -> tuple[AnalysisRequest, list[Document]]:
    async with request.form(max_files=MAX_FILES, max_fields=1, max_part_size=64 * 1024) as form:
        config = form.get("config")
        if not isinstance(config, str):
            raise ValueError("Missing config")
        body = AnalysisRequest.model_validate_json(config)
        files = form.getlist("files")
        if len(files) != len(body.documents):
            raise AppError("RELATIONSHIP_DOCUMENT_METADATA", "Для каждого файла нужно описание источника.", 422)
        documents = []
        for file, metadata in zip(files, body.documents, strict=True):
            if not isinstance(file, UploadFile) or not file.filename:
                raise ValueError("Missing file")
            data = await file.read(MAX_FILE_BYTES + 1)
            if len(data) > MAX_FILE_BYTES:
                raise AppError("RELATIONSHIP_DOCUMENT_LIMIT", "Максимальный размер файла — 5 МБ.", 422)
            filename = PurePath(file.filename).name
            if is_recording(filename):
                suffix = PurePath(filename).suffix
                documents.append(Document(filename[:300 - len(suffix)] + suffix if len(filename) > 300 else filename,
                                          "", metadata, audio=data))
            else:
                text = await asyncio.to_thread(read_document, filename, data)
                documents.append(Document(filename[:300], text, metadata))
        return body, documents


@router.delete("", status_code=204)
async def delete(table_id: UUID, user: User = Depends(get_current_user),
                 session: AsyncSession = Depends(get_db)) -> Response:
    await AnalysisService(session).delete(table_id, user)
    return Response(status_code=204)


@router.post("/ask", response_model=AnalysisAnswer)
async def ask(table_id: UUID, body: AskRequest, user: User = Depends(get_current_user),
              session: AsyncSession = Depends(get_db)) -> AnalysisAnswer:
    return await AnalysisService(session).ask(table_id, user, body)


@router.post("/retry", response_model=AnalysisRead, status_code=202)
async def retry(table_id: UUID, user: User = Depends(get_current_user),
                session: AsyncSession = Depends(get_db)) -> AnalysisRead:
    return await AnalysisService(session).retry(table_id, user)


@router.patch("/refresh", response_model=AnalysisRead)
async def refresh(table_id: UUID, body: RefreshRequest, user: User = Depends(get_current_user),
                  session: AsyncSession = Depends(get_db)) -> AnalysisRead:
    return await AnalysisService(session).update_refresh(table_id, user, body)


@router.get("/contacts/by-row/{row_id}", response_model=ContactCard | None)
async def contact_card(table_id: UUID, row_id: UUID, user: User = Depends(get_current_user),
                       session: AsyncSession = Depends(get_db)) -> ContactCard | None:
    return await AnalysisService(session).contact_card(table_id, row_id, user)


@router.post("/{run_id}/publish", response_model=PublishedAnalysis)
async def publish(table_id: UUID, run_id: UUID, user: User = Depends(get_current_user),
                  session: AsyncSession = Depends(get_db)) -> PublishedAnalysis:
    return await AnalysisService(session).publish(table_id, run_id, user)


@router.get("/{run_id}/reviews/{source_id}", response_model=ReviewPreview)
async def review_preview(table_id: UUID, run_id: UUID, source_id: str, user: User = Depends(get_current_user),
                         session: AsyncSession = Depends(get_db)) -> ReviewPreview:
    return await AnalysisService(session).review_preview(table_id, run_id, source_id, user)


@router.post("/{run_id}/reviews/{source_id}", response_model=AnalysisRead)
async def review(table_id: UUID, run_id: UUID, source_id: str, body: PublicationReviewRequest,
                 user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)) -> AnalysisRead:
    return await AnalysisService(session).review_publication(table_id, run_id, source_id, user, body)


@router.post("/{run_id}/relationships/approve", response_model=AnalysisRead)
async def approve_relationship(table_id: UUID, run_id: UUID, body: RelationshipApproval,
                               user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)) -> AnalysisRead:
    return await AnalysisService(session).approve_relationship(table_id, run_id, user, body)
