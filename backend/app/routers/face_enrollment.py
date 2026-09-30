from __future__ import annotations

import os
from typing import Any
from uuid import uuid4
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, UploadFile
from sqlalchemy import select, update
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


def _lock_student_files(student_id: int, db: Session) -> None:
    # Serialize enrollment file mutations with permanent deletion across workers.
    db.execute(update(Student).where(Student.id == student_id).values(is_active=Student.is_active))


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


def _enrollment_user_pose(face: np.ndarray) -> tuple[str, float]:
    """Convert raw, unmirrored YuNet landmarks to user-centric head-turn direction.

    YuNet's image-right eye is the subject's anatomical right eye. A turn to the
    subject's left makes the nose closer to the image-right eye; lower ratios
    therefore canonically mean user-left, regardless of the mirrored preview.
    """
    if len(face) < 10:
        return 'FRONT', 0.5
    right_eye_x = float(face[4])
    left_eye_x = float(face[6])
    nose_x = float(face[8])
    right_distance = abs(nose_x - right_eye_x)
    left_distance = abs(left_eye_x - nose_x)
    total = right_distance + left_distance
    if total <= 1e-6:
        return 'FRONT', 0.5
    signed_user_left = (right_distance - left_distance) / total
    yaw_ratio = min(1.0, max(0.0, 0.5 - signed_user_left * 0.5))
    if yaw_ratio < 0.44:
        return 'SLIGHT_LEFT', yaw_ratio
    if yaw_ratio > 0.56:
        return 'SLIGHT_RIGHT', yaw_ratio
    return 'FRONT', yaw_ratio


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
    response: dict[str, Any] = {'faceCount': len(faces), 'quality': quality, 'faceBoxes': boxes}
    if len(faces) == 1:
        assessment = face_engine.evaluate_quality(frame, faces[0], for_enrollment=False)
        response['assessment'] = {
            'status': assessment.status,
            'isAcceptable': assessment.is_acceptable,
            'errorCode': assessment.error_code,
            'sharpness': round(assessment.sharpness, 2),
            'brightness': round(assessment.brightness, 2),
            'yawRatio': round(assessment.yaw_ratio, 3),
            'rollDegrees': round(assessment.roll_degrees, 2),
            'eyeDistanceRatio': round(assessment.eye_distance_ratio, 3),
            'detectionConfidence': round(assessment.detection_confidence, 4),
            'bboxSizePx': {'width': round(assessment.bbox[2], 1), 'height': round(assessment.bbox[3], 1)},
            'frameSizePx': {'width': assessment.frame_size[0], 'height': assessment.frame_size[1]},
            'details': assessment.details,
        }
    return {'success': True, 'data': response}


@router.post('/api/face-engine/enrollment-preview')
async def face_engine_enrollment_preview(image: UploadFile, u=Depends(require('ADMIN_IT'))):
    """Enrollment camera preview: detection + enrollment-grade quality + pose information only.

    Position / size validation is done on the FRONTEND because the frontend is the
    single source of truth for guide geometry: it knows actual video viewport dimensions,
    object-fit cropping, mirroring, and responsive layout. This endpoint returns the
    raw detected face coordinates, enrollment-quality assessment, and pose classification.
    Never persists biometric data.
    """
    _engine_or_error()
    if image.content_type and not image.content_type.startswith('image/'):
        error(422, 'File harus berupa gambar.', 'INVALID_IMAGE')
    frame = _decode_image(await image.read())
    faces = face_engine.detect_faces(frame)
    height, width = frame.shape[:2]
    data: dict[str, Any] = {
        'faceCount': len(faces),
        'frameSizePx': {'width': width, 'height': height},
        'minEnrollmentFaceSizePx': settings.face_enrollment_min_size_px,
        'minScanFaceSizePx': settings.face_min_size_px,
    }
    if len(faces) == 0:
        data['quality'] = 'NO_FACE'
        return {'success': True, 'data': data}
    if len(faces) > 1:
        data['quality'] = 'MULTIPLE_FACES'
        data['faceBoxes'] = [
            {
                'x': max(0.0, float(f[0]) / width),
                'y': max(0.0, float(f[1]) / height),
                'width': min(1.0, float(f[2]) / width),
                'height': min(1.0, float(f[3]) / height),
            }
            for f in faces
        ]
        return {'success': True, 'data': data}
    face = faces[0]
    assessment = face_engine.evaluate_quality(frame, face, for_enrollment=True)
    bbox_rel = {
        'x': max(0.0, float(face[0]) / width),
        'y': max(0.0, float(face[1]) / height),
        'width': min(1.0, float(face[2]) / width),
        'height': min(1.0, float(face[3]) / height),
    }
    data['faceBox'] = bbox_rel
    data['bboxSizePx'] = {'width': round(float(face[2]), 1), 'height': round(float(face[3]), 1)}
    data['assessment'] = {
        'status': assessment.status,
        'isAcceptable': assessment.is_acceptable,
        'errorCode': assessment.error_code,
        'sharpness': round(assessment.sharpness, 2),
        'brightness': round(assessment.brightness, 2),
        'yawRatio': round(assessment.yaw_ratio, 3),
        'rollDegrees': round(assessment.roll_degrees, 2),
        'eyeDistanceRatio': round(assessment.eye_distance_ratio, 3),
        'detectionConfidence': round(assessment.detection_confidence, 4),
    }
    pose_label, pose_yaw_ratio = _enrollment_user_pose(face)
    data['pose'] = {
        'label': pose_label,
        'yawRatio': round(pose_yaw_ratio, 3),
        'rollDegrees': round(assessment.roll_degrees, 2),
    }
    return {'success': True, 'data': data}


@router.get('/api/students/{student_id}/face-enrollment')
def enrollment_status(student_id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    student = _student_or_error(student_id, db)
    enrollment = db.scalar(select(FaceEnrollment).where(FaceEnrollment.student_id == student_id))
    return {'success': True, 'data': {'studentId': str(student.id), 'status': student.face_enrollment_status, 'sampleCount': enrollment.sample_count if enrollment else 0, 'modelName': enrollment.model_name if enrollment else None}}


@router.post('/api/students/{student_id}/face-enrollment/samples')
async def add_sample(student_id: int, image: UploadFile, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    _lock_student_files(student_id, db)
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
    quality_error = face_engine.validate_face_quality(frame, faces[0], for_enrollment=True)
    if quality_error:
        messages = {
            'FACE_TOO_SMALL': 'Posisikan wajah sedikit lebih dekat atau jelas di depan kamera.',
            'FACE_OUT_OF_FRAME': 'Posisikan seluruh wajah di dalam frame.',
            'FACE_TOO_BLURRY': 'Gambar terlalu buram. Tahan posisi dan coba lagi.',
            'FACE_BAD_POSE': 'Hadapkan wajah langsung ke kamera.',
            'FACE_LOW_CONFIDENCE': 'Posisikan wajah lebih jelas di depan kamera.',
            'FACE_TOO_DARK': 'Pencahayaan terlalu gelap.',
            'FACE_TOO_BRIGHT': 'Pencahayaan terlalu terang.',
        }
        error(422, messages.get(quality_error, 'Kualitas wajah tidak memenuhi syarat.'), quality_error)
    embedding = face_engine.extract_embedding(frame, faces[0])
    samples = [np.load(path, allow_pickle=False) for path in _sample_files(student_id)]
    if any(face_engine.cosine_similarity(embedding, previous) < settings.face_sample_similarity_threshold for previous in samples):
        error(422, 'Sampel wajah tidak konsisten.', 'SAMPLE_IDENTITY_MISMATCH')
    sample_path = _pending_dir(student_id) / f'sample-{len(samples) + 1:02d}.npy'
    _save_embedding(sample_path, embedding)
    sample_num = len(samples) + 1
    guidances = {
        1: 'Sampel 1 berhasil. Untuk sampel berikutnya, tengok sedikit ke kiri (~15°).',
        2: 'Sampel 2 berhasil. Untuk sampel berikutnya, tengok sedikit ke kanan (~15°).',
        3: '3 sampel terpenuhi. Silakan simpan enrollment wajah.',
    }
    next_guidance = guidances.get(sample_num, 'Sampel berhasil disimpan.')
    return {'success': True, 'data': {'studentId': str(student.id), 'sampleCount': sample_num, 'minimumSamples': settings.face_min_samples, 'valid': True, 'guidance': next_guidance}}


@router.post('/api/students/{student_id}/face-enrollment/complete')
def complete_enrollment(student_id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    _lock_student_files(student_id, db)
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
    for path in sample_paths:
        path.unlink(missing_ok=True)
    pending = PENDING_ROOT / str(student_id)
    try: pending.rmdir()
    except OSError: pass
    return {'success': True, 'data': {'studentId': str(student.id), 'status': student.face_enrollment_status, 'sampleCount': len(embeddings)}}


@router.delete('/api/students/{student_id}/face-enrollment/samples')
def discard_samples(student_id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    _lock_student_files(student_id, db)
    _student_or_error(student_id, db)
    pending = PENDING_ROOT / str(student_id)
    for path in pending.glob('sample-*.npy'):
        path.unlink(missing_ok=True)
    try: pending.rmdir()
    except OSError: pass
    return {'success': True, 'data': {'studentId': str(student_id), 'discarded': True}}


@router.delete('/api/students/{student_id}/face-enrollment')
def delete_enrollment(student_id: int, db: Session = Depends(get_db), u=Depends(require('ADMIN_IT'))):
    _lock_student_files(student_id, db)
    student = _student_or_error(student_id, db)
    enrollment = db.scalar(select(FaceEnrollment).where(FaceEnrollment.student_id == student_id))
    if not enrollment:
        error(404, 'Enrollment wajah tidak ditemukan.', 'FACE_ENROLLMENT_NOT_FOUND')
    from ..services.biometric_cleanup import staged_biometric_cleanup
    with staged_biometric_cleanup(db, student_id, FACE_ROOT, PENDING_ROOT) as cleanup:
        db.delete(enrollment)
        student.face_enrollment_status = 'NOT_REGISTERED'
        audit(db, u, 'FACE_ENROLLMENT_DELETED', 'FaceEnrollment', student_id, 'Menghapus enrollment wajah')
        db.commit()
    face_recognition_service.invalidate(student_id)
    return {'success': True, 'data': {'studentId': str(student.id), 'status': student.face_enrollment_status, **cleanup}}
