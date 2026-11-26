import asyncio
import base64
import wave
from dataclasses import dataclass
from io import BytesIO
from math import ceil
from pathlib import Path, PurePath
from tempfile import TemporaryDirectory

import httpx

from app.core.config import get_settings
from app.core.errors import AppError
from app.services.relationship.inference import local_ollama_url, model_name
from app.services.relationship.text import clean

AUDIO_FORMATS = {".wav": "wav", ".mp3": "mp3", ".m4a": "mov", ".ogg": "ogg", ".flac": "flac", ".aac": "aac"}
MAX_RECORDINGS = 3
MAX_SECONDS = 120
CHUNK_SECONDS = 24
SAMPLE_RATE = 16000
FRAME_BYTES = 2


def is_recording(filename: str) -> bool:
    return PurePath(filename).suffix.casefold() in AUDIO_FORMATS


@dataclass(frozen=True)
class Segment:
    text: str
    start: int
    end: int


async def _decode(encoded: str, suffix: str) -> bytes:
    audio_format = AUDIO_FORMATS.get(suffix)
    if audio_format is None:
        raise AppError("RELATIONSHIP_AUDIO_INVALID", "Формат аудио не поддерживается.", 422)
    with TemporaryDirectory(prefix="sammi-audio-") as directory:
        media = Path(directory) / "recording"
        await asyncio.to_thread(media.write_bytes, base64.b64decode(encoded, validate=True))
        try:
            process = await asyncio.create_subprocess_exec(
                "ffmpeg", "-nostdin", "-loglevel", "error", "-protocol_whitelist", "file,pipe",
                "-f", audio_format, "-i", str(media), "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE),
                "-t", str(MAX_SECONDS + 1), "-f", "s16le", "pipe:1",
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )
        except FileNotFoundError as exc:
            raise AppError("RELATIONSHIP_AUDIO_DECODER", "Для аудио требуется FFmpeg на сервере.", 503) from exc
        try:
            async with asyncio.timeout(12):
                pcm, _ = await process.communicate()
        except TimeoutError as exc:
            raise AppError("RELATIONSHIP_AUDIO_TIMEOUT", "Не удалось подготовить запись вовремя.", 504) from exc
        finally:
            if process.returncode is None:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
                await process.wait()
    if process.returncode or len(pcm) < SAMPLE_RATE * FRAME_BYTES:
        raise AppError("RELATIONSHIP_AUDIO_INVALID", "Не удалось прочитать дорожку длиной от одной секунды.", 422)
    if len(pcm) > MAX_SECONDS * SAMPLE_RATE * FRAME_BYTES:
        raise AppError("RELATIONSHIP_AUDIO_LIMIT", "Одна запись может длиться до двух минут.", 422)
    return pcm


def _wav(pcm: bytes) -> bytes:
    stream = BytesIO()
    with wave.open(stream, "wb") as wav:
        wav.setparams((1, FRAME_BYTES, SAMPLE_RATE, 0, "NONE", "not compressed"))
        wav.writeframes(pcm)
    return stream.getvalue()


async def transcribe(encoded: str, suffix: str) -> list[Segment]:
    pcm = await _decode(encoded, suffix)
    settings = get_settings()
    url = local_ollama_url(settings.ollama_base_url).rstrip("/") + "/v1/audio/transcriptions"
    timeout = min(settings.ollama_timeout_seconds, 35)
    step = CHUNK_SECONDS * SAMPLE_RATE * FRAME_BYTES
    result = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=min(5, timeout)), trust_env=False) as client:
        for offset in range(0, len(pcm), step):
            part = pcm[offset:offset + step]
            if not any(part):
                continue
            try:
                response = await client.post(
                    url, files={"file": ("clip.wav", _wav(part), "audio/wav")},
                    data={"model": model_name(), "response_format": "json"},
                )
            except httpx.HTTPError as exc:
                raise AppError("RELATIONSHIP_AUDIO_PROVIDER", "Ollama не завершил распознавание записи.", 503) from exc
            if response.status_code == 404:
                raise AppError("RELATIONSHIP_AUDIO_UNSUPPORTED", "Ollama или установленный тег не поддерживает распознавание аудио.", 503)
            if response.is_error:
                raise AppError("RELATIONSHIP_AUDIO_PROVIDER", "Ollama не завершил распознавание записи.", 503)
            try:
                transcript = response.json()["text"]
                if not isinstance(transcript, str):
                    raise TypeError
            except (ValueError, KeyError, TypeError) as exc:
                raise AppError("RELATIONSHIP_AUDIO_PROVIDER", "Ollama вернул некорректную расшифровку.", 502) from exc
            text = clean(transcript)
            if text:
                result.append(Segment(text, offset // (SAMPLE_RATE * FRAME_BYTES),
                                      ceil((offset + len(part)) / (SAMPLE_RATE * FRAME_BYTES))))
    if not result:
        raise AppError("RELATIONSHIP_AUDIO_EMPTY", "В записи не найдено разборчивой речи.", 422)
    return result
