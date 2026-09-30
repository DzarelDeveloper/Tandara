from __future__ import annotations

import logging
import time
from typing import Any
from dataclasses import dataclass, field, replace
from pathlib import Path
from threading import RLock

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import FaceEnrollment, Student
from .face_engine import FaceEngineStatus, face_engine
from .face_tracking import Box, FaceTrack, LightweightFaceTracker
from .face_temporal import verify_observation
from .face_liveness import update_liveness

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
    telemetry: dict[str, Any] = field(default_factory=dict)
    track_id: int | None = None
    track_state: str = 'TRACKING'
    evidence_count: int = 0
    liveness_state: str = 'LIVENESS_PENDING'


class FaceRecognitionService:
    IDENTITY_CACHE_SECONDS = 1.5
    REJECTED_CACHE_SECONDS = 0.45

    def __init__(self) -> None:
        self._cache: dict[int, tuple[tuple[str, str], np.ndarray]] = {}
        self._cache_lock = RLock()
        self._trackers: dict[int, LightweightFaceTracker] = {}
        self._tracker_lock = RLock()

    def invalidate(self, student_id: int | None = None) -> None:
        with self._tracker_lock:
            self._trackers.clear()
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
        if not student_ids or embeddings.ndim != 2 or embeddings.size == 0 or embeddings.shape[0] != len(student_ids):
            return None, None, None
        try:
            query = face_engine.normalize_embedding(query_embedding)
        except ValueError:
            return None, None, None
        if query.size != embeddings.shape[1]:
            return None, None, None
        if not np.isfinite(embeddings).all():
            return None, None, None
        similarities = embeddings @ query
        if not np.isfinite(similarities).all():
            return None, None, None
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

    def _get_tracker(self, session_id: int, now: float) -> LightweightFaceTracker:
        with self._tracker_lock:
            for expired_id, tracker in list(self._trackers.items()):
                if now - tracker.last_used > 45.0:
                    self._trackers.pop(expired_id, None)
            tracker = self._trackers.get(session_id)
            if tracker is None:
                tracker = LightweightFaceTracker(ttl_seconds=settings.face_track_ttl_seconds)
                self._trackers[session_id] = tracker
            return tracker

    def mark_attendance_attempted(self, session_id: int, track_id: int) -> None:
        with self._tracker_lock:
            tracker = self._trackers.get(session_id)
            track = tracker.get_track(track_id) if tracker else None
            if track is not None:
                track.attendance_attempted = True
                if track.verified_student_id is not None:
                    track.attended_student_ids.add(track.verified_student_id)
                    track.state = 'ATTENDED'

    def _recognize_face(
        self,
        frame: np.ndarray,
        face: np.ndarray,
        track: FaceTrack,
        student_ids: list[int],
        embeddings: np.ndarray,
        *,
        session_id: int,
        now: float,
        index_ms: float,
        detection_ms: float,
    ) -> RecognitionResult:
        if track.verified_until > 0 and now >= track.verified_until:
            track.break_continuity(clear_evidence=True)
        frame_height, frame_width = frame.shape[:2]
        x, y, width, height = [float(value) for value in face[:4]]
        bbox_is_finite = bool(np.isfinite([x, y, width, height]).all()) and frame_width > 0 and frame_height > 0
        face_box = self.normalize_face_box(face, frame) if bbox_is_finite else None
        quality_error = face_engine.validate_face_quality(frame, face)
        assessment = getattr(face_engine, '_last_quality_assessment', None)
        sharpness = assessment.sharpness if assessment is not None else 0.0
        quality_status = assessment.status if assessment is not None else ('GOOD' if not quality_error else quality_error)
        confidence = float(face[14]) if len(face) >= 15 else (float(face[4]) if len(face) == 5 else 0.99)
        telemetry: dict[str, Any] = {
            'track_id': track.track_id,
            'bbox': face_box,
            'bbox_size_px': {'width': round(width, 1), 'height': round(height, 1)} if bbox_is_finite else None,
            'frame_size_px': {'width': frame_width, 'height': frame_height},
            'detection_confidence': round(confidence, 4) if np.isfinite(confidence) else None,
            'quality_status': quality_status,
            'sharpness_metric': round(sharpness, 2),
            'candidate_count': len(student_ids),
            'recognition_similarity': None,
            'second_best_similarity': None,
            'ambiguity_margin': None,
        }

        if quality_error:
            track.cache_expires_at = 0.0
            track.verified_until = 0.0
            total_ms = index_ms + detection_ms
            timings = {'index': index_ms, 'detection': detection_ms, 'embedding': 0.0, 'matching': 0.0, 'total': total_ms}
            telemetry.update({'recognition_status': quality_error, 'timings_ms': timings})
            return RecognitionResult(quality_error, reason=quality_error, face_box=face_box, timings_ms=timings, telemetry=telemetry, track_id=track.track_id)

        identity_locked = (track.verified_student_id == track.student_id and track.student_id is not None and now < track.verified_until)
        if (identity_locked or now < track.cache_expires_at) and track.recognition_status and (track.student_id is None or track.student_id in student_ids):
            cached_status = track.recognition_status
            telemetry.update({
                'recognition_status': cached_status,
                'recognition_similarity': track.similarity,
                'candidate_id': track.student_id if cached_status == 'RECOGNIZED' else None,
                'cached': True,
                'timings_ms': {'index': index_ms, 'detection': detection_ms, 'embedding': 0.0, 'matching': 0.0, 'total': index_ms + detection_ms},
            })
            return RecognitionResult(cached_status, student_id=track.student_id if cached_status == 'RECOGNIZED' else None, similarity=track.similarity, face_box=face_box, timings_ms=telemetry['timings_ms'], telemetry=telemetry, track_id=track.track_id)

        if not student_ids:
            track.recognition_status = 'NO_ENROLLED_FACES'
            track.student_id = None
            track.similarity = None
            track.cache_expires_at = now + self.REJECTED_CACHE_SECONDS
            telemetry['recognition_status'] = 'NO_ENROLLED_FACES'
            return RecognitionResult('NO_ENROLLED_FACES', reason='NO_ENROLLED_FACES', face_box=face_box, telemetry=telemetry, track_id=track.track_id)

        embedding_started = time.perf_counter()
        try:
            query_embedding = face_engine.extract_embedding(frame, face)
        except (RuntimeError, ValueError):
            telemetry['recognition_status'] = 'ENGINE_NOT_READY'
            return RecognitionResult('ENGINE_NOT_READY', reason='ENGINE_NOT_READY', face_box=face_box, telemetry=telemetry, track_id=track.track_id)
        embedding_ms = (time.perf_counter() - embedding_started) * 1000
        matching_started = time.perf_counter()
        student_id, similarity, second_similarity = self.find_best_match(query_embedding, student_ids, embeddings)
        matching_ms = (time.perf_counter() - matching_started) * 1000
        timings = {'index': index_ms, 'detection': detection_ms, 'embedding': embedding_ms, 'matching': matching_ms, 'total': index_ms + detection_ms + embedding_ms + matching_ms}
        diff_margin = similarity - second_similarity if similarity is not None and second_similarity is not None else None
        telemetry.update({
            'recognition_similarity': round(similarity, 4) if similarity is not None else None,
            'second_best_similarity': round(second_similarity, 4) if second_similarity is not None else None,
            'ambiguity_margin': round(diff_margin, 4) if diff_margin is not None else None,
            'timings_ms': timings,
        })

        if student_id is None or similarity is None or similarity < settings.face_recognition_threshold:
            status = 'UNKNOWN_FACE'
            reason = 'BELOW_THRESHOLD'
            student_id = None
        elif second_similarity is not None and settings.face_recognition_ambiguity_margin > 0 and diff_margin is not None and diff_margin < settings.face_recognition_ambiguity_margin:
            status = 'AMBIGUOUS_FACE'
            reason = 'MATCHES_TOO_CLOSE'
            student_id = None
        else:
            status = 'RECOGNIZED'
            reason = None

        if track.student_id != student_id:
            track.attendance_attempted = False
            track.verified_until = 0.0
            track.liveness_samples.clear()
        track.recognition_status = status
        track.student_id = student_id
        track.similarity = similarity
        interval = self.IDENTITY_CACHE_SECONDS if session_id < 0 or track.state == 'ATTENDED' else settings.face_observation_interval_seconds
        track.cache_expires_at = now + (interval if status == 'RECOGNIZED' else self.REJECTED_CACHE_SECONDS)
        telemetry['recognition_status'] = status
        if status == 'RECOGNIZED':
            telemetry['candidate_id'] = student_id
        return RecognitionResult(status, student_id=student_id, similarity=similarity, reason=reason, face_box=face_box, timings_ms=timings, telemetry=telemetry, track_id=track.track_id)

    def recognize_frame_many(self, frame: np.ndarray, db: Session, *, session_id: int) -> list[RecognitionResult]:
        started = time.perf_counter()
        if not isinstance(frame, np.ndarray) or frame.size == 0 or frame.ndim != 3:
            return [RecognitionResult('INVALID_IMAGE', reason='INVALID_IMAGE')]
        if face_engine.initialize() != FaceEngineStatus.READY:
            return [RecognitionResult('ENGINE_NOT_READY', reason='ENGINE_NOT_READY')]

        index_started = time.perf_counter()
        student_ids, embeddings = self.load_enrolled_embeddings(db)
        index_ms = (time.perf_counter() - index_started) * 1000
        detection_started = time.perf_counter()
        try:
            faces = face_engine.detect_faces(frame)
        except RuntimeError:
            return [RecognitionResult('ENGINE_NOT_READY', reason='ENGINE_NOT_READY')]
        detection_ms = (time.perf_counter() - detection_started) * 1000
        if not faces:
            self._get_tracker(session_id, time.monotonic()).update([], now=time.monotonic())
            if not student_ids:
                telemetry = {
                    'frame_size_px': {'width': frame.shape[1], 'height': frame.shape[0]},
                    'detection_count': 0,
                    'candidate_count': 0,
                    'quality_status': 'NO_FACE',
                    'recognition_status': 'NO_ENROLLED_FACES',
                    'timings_ms': {'index': index_ms, 'detection': detection_ms, 'embedding': 0.0, 'matching': 0.0, 'total': (time.perf_counter() - started) * 1000},
                }
                return [RecognitionResult('NO_ENROLLED_FACES', reason='NO_ENROLLED_FACES', timings_ms=telemetry['timings_ms'], telemetry=telemetry)]
            total_ms = (time.perf_counter() - started) * 1000
            timings = {'index': index_ms, 'detection': detection_ms, 'embedding': 0.0, 'matching': 0.0, 'total': total_ms}
            telemetry = {
                'frame_size_px': {'width': frame.shape[1], 'height': frame.shape[0]},
                'detection_count': 0,
                'candidate_count': len(student_ids),
                'quality_status': 'NO_FACE',
                'recognition_status': 'FACE_NOT_DETECTED',
                'timings_ms': timings,
            }
            return [RecognitionResult('FACE_NOT_DETECTED', reason='FACE_NOT_DETECTED', timings_ms=timings, telemetry=telemetry)]

        now = time.monotonic()
        frame_height, frame_width = frame.shape[:2]
        normalized_boxes: list[Box] = []
        for face in faces:
            x, y, width, height = [float(value) for value in face[:4]]
            if np.isfinite([x, y, width, height]).all() and frame_width > 0 and frame_height > 0:
                normalized_boxes.append((x / frame_width, y / frame_height, width / frame_width, height / frame_height))
            else:
                normalized_boxes.append((0.0, 0.0, 0.0, 0.0))
        tracker = self._get_tracker(session_id, now)
        tracks = tracker.update(normalized_boxes, now=now)
        results = [
            self._recognize_face(
                frame,
                face,
                track,
                student_ids,
                embeddings,
                session_id=session_id,
                now=now,
                index_ms=index_ms,
                detection_ms=detection_ms,
            )
            for face, track in zip(faces, tracks)
        ]
        if session_id < 0:
            return results  # Single-image Phase 1 diagnostics remain available.
        verified_results = []
        for result, track, face in zip(results, tracks, faces):
            usable = result.status in ('RECOGNIZED', 'UNKNOWN_FACE', 'AMBIGUOUS_FACE')
            verify_observation(
                track, status=result.status, student_id=result.student_id,
                similarity=result.similarity, quality=result.telemetry.get('quality_status', 'GOOD'),
                sharpness=result.telemetry.get('sharpness_metric', 0.0), now=now,
                fresh=usable and not result.telemetry.get('cached', False),
                ambiguity_margin=result.telemetry.get('ambiguity_margin'),
            )
            update_liveness(track, face, now=now, quality_ok=usable)
            verification_ms = ((track.verified_at - track.first_seen) * 1000
                               if track.verified_at is not None and track.first_seen is not None else None)
            result.telemetry.update({
                'liveness_state': track.liveness_state, 'liveness_signals': track.liveness_signals,
                'verification_path': track.verification_path, 'verification_latency_ms': verification_ms,
                'evidence_count': track.evidence_count,
                'frame_total_ms': (time.perf_counter() - started) * 1000,
            })
            verified_results.append(replace(result, track_state=track.state, evidence_count=track.evidence_count, liveness_state=track.liveness_state))
        return verified_results

    def recognize_frame(self, frame: np.ndarray, db: Session) -> RecognitionResult:
        results = self.recognize_frame_many(frame, db, session_id=-1)
        if not results:
            return RecognitionResult('FACE_NOT_DETECTED', reason='FACE_NOT_DETECTED')
        if len(results) > 1:
            return RecognitionResult('MULTIPLE_FACES', reason='MULTIPLE_FACES', telemetry={'detection_count': len(results)})
        return results[0]

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

    def recognize_image_many(self, content: bytes, db: Session, *, session_id: int) -> list[RecognitionResult]:
        if not content or len(content) > settings.max_upload_mb * 1024 * 1024:
            return [RecognitionResult('INVALID_IMAGE', reason='INVALID_IMAGE')]
        if face_engine.initialize() != FaceEngineStatus.READY:
            return [RecognitionResult('ENGINE_NOT_READY', reason='ENGINE_NOT_READY')]
        try:
            image = face_engine._cv2.imdecode(np.frombuffer(content, dtype=np.uint8), face_engine._cv2.IMREAD_COLOR)
        except Exception:
            image = None
        if image is None:
            return [RecognitionResult('INVALID_IMAGE', reason='INVALID_IMAGE')]
        return self.recognize_frame_many(image, db, session_id=session_id)


face_recognition_service = FaceRecognitionService()
