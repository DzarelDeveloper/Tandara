from pathlib import Path

import numpy as np
import pytest

from app.config import settings
from app.services.face_engine import FaceEngineStatus, face_engine
import app.routers.face_enrollment as face_router
import app.services.face_recognition as recognition_module
from app.routers.face_enrollment import _enrollment_user_pose
from app.database import SessionLocal
from app.models import AuditLog


@pytest.fixture
def fake_engine(monkeypatch):
    monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
    monkeypatch.setattr(face_engine, 'detect_faces', lambda frame: [np.array([10, 10, 100, 100, 0.99], dtype=np.float32)])
    monkeypatch.setattr(face_engine, 'validate_face_quality', lambda frame, face, for_enrollment=False: None)
    monkeypatch.setattr(face_engine, 'extract_embedding', lambda frame, face: np.array([1, 0, 0, 0], dtype=np.float32))
    monkeypatch.setattr(face_router, '_decode_image', lambda content: np.zeros((160, 160, 3), dtype=np.uint8))
    return face_engine


@pytest.fixture(autouse=True)
def clean_face_storage(tmp_path, monkeypatch):
    face_root = tmp_path / 'faces'
    monkeypatch.setattr(face_router, 'FACE_ROOT', face_root)
    monkeypatch.setattr(face_router, 'PENDING_ROOT', face_root / '.pending')
    monkeypatch.setattr(recognition_module, 'FACE_ROOT', face_root)
    recognition_module.face_recognition_service.invalidate()
    yield
    recognition_module.face_recognition_service.invalidate()


def upload_sample(client, headers, student_id):
    return client.post(
        f'/api/students/{student_id}/face-enrollment/samples',
        headers=headers,
        files={'image': ('capture.jpg', b'not-a-real-image-in-test', 'image/jpeg')},
    )


def test_enrollment_pose_direction_is_user_centric_and_unmirrored():
    user_left = np.zeros(15, dtype=np.float32)
    user_left[4], user_left[6], user_left[8] = 20, 80, 55
    user_right = np.zeros(15, dtype=np.float32)
    user_right[4], user_right[6], user_right[8] = 20, 80, 45
    front = np.zeros(15, dtype=np.float32)
    front[4], front[6], front[8] = 20, 80, 50

    assert _enrollment_user_pose(user_left)[0] == 'SLIGHT_LEFT'
    assert _enrollment_user_pose(user_right)[0] == 'SLIGHT_RIGHT'
    assert _enrollment_user_pose(front) == ('FRONT', 0.5)


def test_face_engine_status_is_admin_only(client, headers):
    assert client.get('/api/face-engine/status', headers=headers['admin']).status_code == 200
    assert client.get('/api/face-engine/status', headers=headers['guru']).status_code == 403


def test_face_enrollment_requires_admin_and_three_samples(client, headers, student, fake_engine):
    assert upload_sample(client, headers['guru'], student).status_code == 403
    assert upload_sample(client, headers['admin'], student).status_code == 200
    assert client.post(f'/api/students/{student}/face-enrollment/complete', headers=headers['admin']).json()['code'] == 'INSUFFICIENT_SAMPLES'
    assert upload_sample(client, headers['admin'], student).status_code == 200
    assert upload_sample(client, headers['admin'], student).status_code == 200
    complete = client.post(f'/api/students/{student}/face-enrollment/complete', headers=headers['admin'])
    assert complete.status_code == 200
    assert complete.json()['data']['status'] == 'REGISTERED'
    db = SessionLocal()
    assert db.query(AuditLog).filter(AuditLog.action == 'FACE_ENROLLMENT_CREATED').count() == 1
    db.close()
    status = client.get(f'/api/students/{student}/face-enrollment', headers=headers['admin'])
    assert status.json()['data']['sampleCount'] == 3
    assert list((face_router.FACE_ROOT / str(student)).glob('embedding-*.npy'))


def test_face_enrollment_invalid_face_code(client, headers, student, fake_engine, monkeypatch):
    monkeypatch.setattr(face_engine, 'detect_faces', lambda frame: [])
    response = upload_sample(client, headers['admin'], student)
    assert response.status_code == 422
    assert response.json()['code'] == 'FACE_NOT_DETECTED'
    monkeypatch.setattr(face_engine, 'detect_faces', lambda frame: [np.zeros(5), np.zeros(5)])
    response = upload_sample(client, headers['admin'], student)
    assert response.status_code == 422
    assert response.json()['code'] == 'MULTIPLE_FACES'


def test_enrollment_uses_enrollment_quality_profile(client, headers, student, fake_engine, monkeypatch):
    enrollment_modes = []
    monkeypatch.setattr(face_engine, 'validate_face_quality', lambda frame, face, for_enrollment=False: enrollment_modes.append(for_enrollment))

    response = upload_sample(client, headers['admin'], student)

    assert response.status_code == 200
    assert enrollment_modes == [True]


def test_reenrollment_and_delete_are_safe(client, headers, student, fake_engine):
    for _ in range(3):
        assert upload_sample(client, headers['admin'], student).status_code == 200
    assert client.post(f'/api/students/{student}/face-enrollment/complete', headers=headers['admin']).status_code == 200
    old_embedding_path = next((face_router.FACE_ROOT / str(student)).glob('embedding-*.npy'))
    old_embedding = old_embedding_path.read_bytes()
    for _ in range(2):
        assert upload_sample(client, headers['admin'], student).status_code == 200
    assert client.post(f'/api/students/{student}/face-enrollment/complete', headers=headers['admin']).status_code == 422
    assert old_embedding_path.read_bytes() == old_embedding
    assert client.post(f'/api/students/{student}/face-enrollment/samples', headers=headers['admin'], files={'image': ('capture.jpg', b'x', 'text/plain')}).status_code == 422
    assert client.delete(f'/api/students/{student}/face-enrollment', headers=headers['admin']).status_code == 200
    assert client.get(f'/api/students/{student}/face-enrollment', headers=headers['admin']).json()['data']['status'] == 'NOT_REGISTERED'


def test_successful_reenrollment_preserves_previous_embedding_file(client, headers, student, fake_engine):
    for _ in range(settings.face_min_samples):
        assert upload_sample(client, headers['admin'], student).status_code == 200
    assert client.post(f'/api/students/{student}/face-enrollment/complete', headers=headers['admin']).status_code == 200
    old_path = next((face_router.FACE_ROOT / str(student)).glob('embedding-*.npy'))
    old_embedding = old_path.read_bytes()

    for _ in range(settings.face_min_samples):
        assert upload_sample(client, headers['admin'], student).status_code == 200
    assert client.post(f'/api/students/{student}/face-enrollment/complete', headers=headers['admin']).status_code == 200

    assert old_path.exists()
    assert old_path.read_bytes() == old_embedding
    assert len(list((face_router.FACE_ROOT / str(student)).glob('embedding-*.npy'))) == 2


def test_nonexistent_student_is_rejected(client, headers, fake_engine):
    response = client.get('/api/students/99999/face-enrollment', headers=headers['admin'])
    assert response.status_code == 404
    assert response.json()['code'] == 'NOT_FOUND'


def test_cancel_discards_pending_samples(client, headers, student, fake_engine):
    assert upload_sample(client, headers['admin'], student).status_code == 200
    response = client.delete(f'/api/students/{student}/face-enrollment/samples', headers=headers['admin'])
    assert response.status_code == 200
    pending_dir = face_router.PENDING_ROOT / str(student)
    assert not pending_dir.exists() or not list(pending_dir.glob('sample-*.npy'))
