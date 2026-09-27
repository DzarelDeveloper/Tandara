from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from threading import RLock

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import FaceEnrollment, Student
from .face_engine import FaceEngineStatus, face_engine

logger = logging.getLogger(__name__)
FACE_ROOT = Path(__file__).resolve().parents[2] / 'data' / 'faces'
SFACE_EMBEDDING_DIMENSIONS = 128


@dataclass(frozen=True)
class RecognitionResult:
    status: str
    student_id: int | None = None
    similarity: float | None = None
    reason: str | None = None
    face_box: dict[str, float] | None = None
    timings_ms: dict[str, float] = field(default_factory=dict)


class FaceRecognitionService:
    def __init__(self) -> None:
        self._cache: dict[int, tuple[tuple[str, str], np.ndarray]] = {}
        self._cache_lock = RLock()

    def invalidate(self, student_id: int | None = None) -> None:
        with self._cache_lock:
            if student_id is None:
                self._cache.clear()
            else:
                self._cache.pop(student_id, None)

    def load_enrolled_embeddings(self, db: Session) -> tuple[list[int], np.ndarray]:
        rows = db.execute(
            select(Student.id, FaceEnrollment.embedding_path, FaceEnrollment.updated_at, FaceEnrollment.model_name)
            .join(FaceEnrollment, FaceEnrollment.student_id == Student.id)
            .where(Student.is_active.is_(True), Student.face_enrollment_status == 'REGISTERED')
        ).all()
        current_ids = {int(row.id) for row in rows}
        with self._cache_lock:
            for student_id in self._cache.keys() - current_ids:
                self._cache.pop(student_id, None)

            student_ids: list[int] = []
            vectors: list[np.ndarray] = []
            for row in rows:
                student_id = int(row.id)
                if row.model_name != 'YuNet+SFace' or not row.embedding_path:
                    continue
                version = (row.embedding_path, row.updated_at.isoformat() if row.updated_at else '')
                cached = self._cache.get(student_id)
                if cached is not None and cached[0] == version:
                    embedding = cached[1]
                else:
                    path = (FACE_ROOT / row.embedding_path).resolve()
                    if not path.is_relative_to(FACE_ROOT.resolve()):
                        logger.warning('Skipping invalid face enrollment for student_id=%s', student_id)
                        self._cache.pop(student_id, None)
                        continue
                    try:
                        embedding = face_engine.normalize_embedding(np.load(path, allow_pickle=False))
                        if embedding.size != SFACE_EMBEDDING_DIMENSIONS or not np.isfinite(embedding).all():
                            raise ValueError('NON_FINITE_EMBEDDING')
                    except (OSError, ValueError, TypeError) as exc:
                        logger.warning('Skipping unreadable face enrollment for student_id=%s: %s', student_id, type(exc).__name__)
                        self._cache.pop(student_id, None)
                        continue
                    self._cache[student_id] = (version, embedding)
                student_ids.append(student_id)
                vectors.append(embedding)

        if not vectors:
            return [], np.empty((0, 0), dtype=np.float32)
        dimensions = vectors[0].size
        compatible = [(student_id, vector) for student_id, vector in zip(student_ids, vectors) if vector.size == dimensions]
        return [item[0] for item in compatible], np.stack([item[1] for item in compatible]).astype(np.float32, copy=False)

    @staticmethod
    def find_best_match(query_embedding: np.ndarray, student_ids: list[int], embeddings: np.ndarray) -> tuple[int | None, float | None, float | None]:
        if not student_ids or embeddings.size == 0:
            return None, None, None
        query = face_engine.normalize_embedding(query_embedding)
        if query.size != embeddings.shape[1]:
            return None, None, None
        similarities = embeddings @ query
        best_index = int(np.argmax(similarities))
        best_similarity = float(similarities[best_index])
        second_similarity = float(np.partition(similarities, -2)[-2]) if similarities.size > 1 else None
        return student_ids[best_index], best_similarity, second_similarity

    @staticmethod
    def normalize_face_box(face: np.ndarray, frame: np.ndarray) -> dict[str, float]:
        frame_height, frame_width = frame.shape[:2]
        x, y, width, height = [float(value) for value in face[:4]]
        return {
            'x': max(0.0, min(1.0, x / frame_width)),
            'y': max(0.0, min(1.0, y / frame_height)),
            'width': max(0.0, min(1.0, width / frame_width)),
            'height': max(0.0, min(1.0, height / frame_height)),
        }

    def recognize_frame(self, frame: np.ndarray, db: Session) -> RecognitionResult:
        started = time.perf_counter()
        if not isinstance(frame, np.ndarray) or frame.size == 0 or frame.ndim != 3:
            return RecognitionResult('INVALID_IMAGE', reason='INVALID_IMAGE')
        if face_engine.initialize() != FaceEngineStatus.READY:
            return RecognitionResult('ENGINE_NOT_READY', reason='ENGINE_NOT_READY')

        index_started = time.perf_counter()
        student_ids, embeddings = self.load_enrolled_embeddings(db)
        index_ms = (time.perf_counter() - index_started) * 1000
        if not student_ids:
            return RecognitionResult(
                'NO_ENROLLED_FACES',
                reason='NO_ENROLLED_FACES',
                timings_ms={'index': index_ms, 'matching': 0.0, 'total': (time.perf_counter() - started) * 1000},
            )

        detection_started = time.perf_counter()
        try:
            faces = face_engine.detect_faces(frame)
        except RuntimeError:
            return RecognitionResult('ENGINE_NOT_READY', reason='ENGINE_NOT_READY')
        detection_ms = (time.perf_counter() - detection_started) * 1000
        if not faces:
            return RecognitionResult('FACE_NOT_DETECTED', reason='FACE_NOT_DETECTED', timings_ms={'detection': detection_ms})
        if len(faces) != 1:
            return RecognitionResult('MULTIPLE_FACES', reason='MULTIPLE_FACES', timings_ms={'detection': detection_ms})

        face_box = self.normalize_face_box(faces[0], frame)
        quality_error = face_engine.validate_face_quality(frame, faces[0])
        if quality_error:
            return RecognitionResult(quality_error, reason=quality_error, face_box=face_box, timings_ms={'detection': detection_ms})

        embedding_started = time.perf_counter()
        try:
            query_embedding = face_engine.extract_embedding(frame, faces[0])
        except (RuntimeError, ValueError):
            return RecognitionResult('ENGINE_NOT_READY', reason='ENGINE_NOT_READY', timings_ms={'detection': detection_ms})
        embedding_ms = (time.perf_counter() - embedding_started) * 1000

        matching_started = time.perf_counter()
        student_id, similarity, second_similarity = self.find_best_match(query_embedding, student_ids, embeddings)
        matching_ms = (time.perf_counter() - matching_started) * 1000
        total_ms = (time.perf_counter() - started) * 1000
        timings = {'index': index_ms, 'detection': detection_ms, 'embedding': embedding_ms, 'matching': matching_ms, 'total': total_ms}
        if student_id is None or similarity is None or similarity < settings.face_recognition_threshold:
            return RecognitionResult('UNKNOWN_FACE', similarity=similarity, reason='BELOW_THRESHOLD', face_box=face_box, timings_ms=timings)
        margin = settings.face_recognition_ambiguity_margin
        if second_similarity is not None and margin > 0 and similarity - second_similarity < margin:
            return RecognitionResult('AMBIGUOUS_FACE', similarity=similarity, reason='MATCHES_TOO_CLOSE', face_box=face_box, timings_ms=timings)
        return RecognitionResult('RECOGNIZED', student_id=student_id, similarity=similarity, face_box=face_box, timings_ms=timings)

    def recognize_image(self, content: bytes, db: Session) -> RecognitionResult:
        if not content or len(content) > settings.max_upload_mb * 1024 * 1024:
            return RecognitionResult('INVALID_IMAGE', reason='INVALID_IMAGE')
        if face_engine.initialize() != FaceEngineStatus.READY:
            return RecognitionResult('ENGINE_NOT_READY', reason='ENGINE_NOT_READY')
        try:
            image = face_engine._cv2.imdecode(np.frombuffer(content, dtype=np.uint8), face_engine._cv2.IMREAD_COLOR)
        except Exception:
            image = None
        if image is None:
            return RecognitionResult('INVALID_IMAGE', reason='INVALID_IMAGE')
        return self.recognize_frame(image, db)


face_recognition_service = FaceRecognitionService()
