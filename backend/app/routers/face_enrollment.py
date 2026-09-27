from __future__ import annotations

import os
from uuid import uuid4
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..main import Student, audit, error, require
from ..models import FaceEnrollment
from ..services.face_engine import FaceEngineStatus, face_engine
from ..services.face_recognition import face_recognition_service

try:
    import cv2
except ImportError:
    cv2 = None

router = APIRouter(tags=['Face Enrollment'])
FACE_ROOT = Path(__file__).resolve().parents[2] / 'data' / 'faces'
PENDING_ROOT = FACE_ROOT / '.pending'


def _student_or_error(student_id: int, db: Session) -> Student:
    student = db.get(Student, student_id)
    if not student:
        error(404, 'Siswa tidak ditemukan.', 'NOT_FOUND')
    if not student.is_active:
        error(422, 'Siswa tidak aktif.', 'STUDENT_INACTIVE')
    return student


def _engine_or_error() -> None:
    status = face_engine.initialize()
    if status != FaceEngineStatus.READY:
        error(503, face_engine.error_message or 'Face engine belum siap.', 'FACE_ENGINE_NOT_CONFIGURED')


def _pending_dir(student_id: int) -> Path:
    path = PENDING_ROOT / str(student_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _sample_files(student_id: int) -> list[Path]:
    return sorted(_pending_dir(student_id).glob('sample-*.npy'))


def _decode_image(content: bytes) -> np.ndarray:
    if not content:
        error(422, 'File gambar kosong.', 'INVALID_IMAGE')
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        error(413, 'Ukuran gambar terlalu besar.', 'IMAGE_TOO_LARGE')
    if cv2 is None:
        error(503, 'OpenCV belum terpasang.', 'FACE_ENGINE_NOT_CONFIGURED')
    image = cv2.imdecode(np.frombuffer(content, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        error(422, 'File bukan gambar yang valid.', 'INVALID_IMAGE')
    return image


def _save_embedding(path: Path, embedding: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('wb') as output:
        np.save(output, embedding.astype(np.float32), allow_pickle=False)


@router.get('/api/face-engine/status')
def face_engine_status(u=Depends(require('ADMIN_IT'))):
    return {'success': True, 'data': face_engine.status_payload()}


@router.post('/api/face-engine/detect')
async def face_engine_detect(image: UploadFile, u=Depends(require('ADMIN_IT'))):
    """Single-frame detection diagnostic; it never identifies or persists biometric data."""
    _engine_or_error()
    if image.content_type and not image.content_type.startswith('image/'):
        error(422, 'File harus berupa gambar.', 'INVALID_IMAGE')
    frame = _decode_image(await image.read())
    faces = face_engine.detect_faces(frame)
    height, width = frame.shape[:2]
    boxes = [
        {
            'x': max(0.0, float(face[0]) / width),
            'y': max(0.0, float(face[1]) / height),
            'width': min(1.0, float(face[2]) / width),
            'height': min(1.0, float(face[3]) / height),
        }
        for face in faces
    ]
    quality = 'NO_FACE' if not faces else ('MULTIPLE_FACES' if len(faces) > 1 else (face_engine.validate_face_quality(frame, faces[0]) or 'OK'))
    return {'success': True, 'data': {'faceCount': len(faces), 'quality': quality, 'faceBoxes': boxes}}


@router.get('/api/students/{student_id}/face-enrollment')
def enrollment_status(student_id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    student = _student_or_error(student_id, db)
    enrollment = db.scalar(select(FaceEnrollment).where(FaceEnrollment.student_id == student_id))
    return {'success': True, 'data': {'studentId': str(student.id), 'status': student.face_enrollment_status, 'sampleCount': enrollment.sample_count if enrollment else 0, 'modelName': enrollment.model_name if enrollment else None}}


@router.post('/api/students/{student_id}/face-enrollment/samples')
async def add_sample(student_id: int, image: UploadFile, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    student = _student_or_error(student_id, db)
    _engine_or_error()
    if image.content_type and not image.content_type.startswith('image/'):
        error(422, 'File harus berupa gambar.', 'INVALID_IMAGE')
    frame = _decode_image(await image.read())
    faces = face_engine.detect_faces(frame)
    if len(faces) == 0:
        error(422, 'Wajah belum terdeteksi.', 'FACE_NOT_DETECTED')
    if len(faces) > 1:
        error(422, 'Pastikan hanya satu wajah di dalam frame.', 'MULTIPLE_FACES')
    quality_error = face_engine.validate_face_quality(frame, faces[0])
    if quality_error:
        messages = {'FACE_TOO_SMALL': 'Dekatkan wajah ke kamera.', 'FACE_OUT_OF_FRAME': 'Posisikan wajah sepenuhnya di dalam frame.', 'FACE_TOO_BLURRY': 'Gambar terlalu buram.', 'FACE_TOO_DARK': 'Pencahayaan terlalu gelap.', 'FACE_TOO_BRIGHT': 'Pencahayaan terlalu terang.'}
        error(422, messages.get(quality_error, 'Kualitas wajah tidak memenuhi syarat.'), quality_error)
    embedding = face_engine.extract_embedding(frame, faces[0])
    samples = [np.load(path, allow_pickle=False) for path in _sample_files(student_id)]
    if any(face_engine.cosine_similarity(embedding, previous) < settings.face_sample_similarity_threshold for previous in samples):
        error(422, 'Sampel wajah tidak konsisten.', 'SAMPLE_IDENTITY_MISMATCH')
    sample_path = _pending_dir(student_id) / f'sample-{len(samples) + 1:02d}.npy'
    _save_embedding(sample_path, embedding)
    return {'success': True, 'data': {'studentId': str(student.id), 'sampleCount': len(samples) + 1, 'minimumSamples': settings.face_min_samples, 'valid': True}}


@router.post('/api/students/{student_id}/face-enrollment/complete')
def complete_enrollment(student_id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    student = _student_or_error(student_id, db)
    sample_paths = _sample_files(student_id)
    if len(sample_paths) < settings.face_min_samples:
        error(422, f'Enrolmen membutuhkan minimal {settings.face_min_samples} sampel valid.', 'INSUFFICIENT_SAMPLES')
    embeddings = [np.load(path, allow_pickle=False) for path in sample_paths]
    representative = face_engine.normalize_embedding(np.mean(np.stack(embeddings), axis=0))
    final_dir = FACE_ROOT / str(student_id)
    old_enrollment = db.scalar(select(FaceEnrollment).where(FaceEnrollment.student_id == student_id))
    old_path = FACE_ROOT / old_enrollment.embedding_path if old_enrollment and old_enrollment.embedding_path else None
    final_path = final_dir / f'embedding-{uuid4().hex}.npy'
    temporary_path = final_dir / f'.{uuid4().hex}.pending.npy'
    _save_embedding(temporary_path, representative)
    os.replace(temporary_path, final_path)
    if old_enrollment:
        old_enrollment.embedding_path = str(final_path.relative_to(FACE_ROOT))
        old_enrollment.sample_count = len(embeddings)
        old_enrollment.model_name = 'YuNet+SFace'
        action = 'FACE_ENROLLMENT_REPLACED'
    else:
        db.add(FaceEnrollment(student_id=student_id, embedding_path=str(final_path.relative_to(FACE_ROOT)), sample_count=len(embeddings), model_name='YuNet+SFace', registered_by=u.id))
        action = 'FACE_ENROLLMENT_CREATED'
    student.face_enrollment_status = 'REGISTERED'
    audit(db, u, action, 'FaceEnrollment', student_id, 'Menyimpan enrollment wajah')
    db.commit()
    face_recognition_service.invalidate(student_id)
    if old_path and old_path != final_path:
        old_path.unlink(missing_ok=True)
    for path in sample_paths:
        path.unlink(missing_ok=True)
    pending = PENDING_ROOT / str(student_id)
    try: pending.rmdir()
    except OSError: pass
    return {'success': True, 'data': {'studentId': str(student.id), 'status': student.face_enrollment_status, 'sampleCount': len(embeddings)}}


@router.delete('/api/students/{student_id}/face-enrollment/samples')
def discard_samples(student_id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    _student_or_error(student_id, db)
    pending = PENDING_ROOT / str(student_id)
    for path in pending.glob('sample-*.npy'):
        path.unlink(missing_ok=True)
    try: pending.rmdir()
    except OSError: pass
    return {'success': True, 'data': {'studentId': str(student_id), 'discarded': True}}


@router.delete('/api/students/{student_id}/face-enrollment')
def delete_enrollment(student_id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    student = _student_or_error(student_id, db)
    enrollment = db.scalar(select(FaceEnrollment).where(FaceEnrollment.student_id == student_id))
    if not enrollment:
        error(404, 'Enrollment wajah tidak ditemukan.', 'FACE_ENROLLMENT_NOT_FOUND')
    final_dir = FACE_ROOT / str(student_id)
    for path in final_dir.glob('*'):
        if path.is_file(): path.unlink()
    try: final_dir.rmdir()
    except OSError: pass
    db.delete(enrollment)
    student.face_enrollment_status = 'NOT_REGISTERED'
    audit(db, u, 'FACE_ENROLLMENT_DELETED', 'FaceEnrollment', student_id, 'Menghapus enrollment wajah')
    db.commit()
    face_recognition_service.invalidate(student_id)
    return {'success': True, 'data': {'studentId': str(student.id), 'status': student.face_enrollment_status}}
