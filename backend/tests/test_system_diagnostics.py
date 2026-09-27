import numpy as np
from fastapi.testclient import TestClient

import app.routers.face_enrollment as face_router
import app.main as main_module
from app.database import SessionLocal
from app.models import Attendance
from app.services.face_engine import FaceEngineStatus, face_engine


def test_health_checks_database_without_exposing_configuration(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    data = response.json()['data']
    assert data['status'] == 'ok'
    assert data['database'] == {'status': 'connected', 'type': 'sqlite'}
    assert data['face_recognition'] == face_engine.status.value
    serialized = response.text.lower()
    assert 'database_url' not in serialized
    assert 'tandara_test.db' not in serialized


def test_health_reports_database_failure_without_leaking_error(client, monkeypatch):
    class FailedConnection:
        def __enter__(self):
            raise RuntimeError('/secret/database/path: password=never-expose')
        def __exit__(self, *_):
            return False

    monkeypatch.setattr(main_module.engine, 'connect', lambda: FailedConnection())
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json()['data']['database']['status'] == 'error'
    assert 'secret' not in response.text.lower()
    assert 'password' not in response.text.lower()


def test_face_engine_startup_failure_does_not_stop_backend(monkeypatch):
    previous_status, previous_error = face_engine.status, face_engine.error_message
    monkeypatch.setattr(face_engine, 'initialize', lambda: (_ for _ in ()).throw(RuntimeError('/private/model/path')))
    try:
        with TestClient(main_module.app) as startup_client:
            response = startup_client.get('/api/health')
        assert response.status_code == 200
        assert response.json()['data']['face_recognition'] == 'ERROR'
        assert 'private' not in response.text.lower()
    finally:
        face_engine.status, face_engine.error_message = previous_status, previous_error


def test_detection_diagnostic_authorization_and_malformed_image(client, headers, monkeypatch):
    monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
    assert client.post('/api/face-engine/detect', headers=headers['guru'], files={'image': ('x.jpg', b'x', 'image/jpeg')}).status_code == 403
    response = client.post('/api/face-engine/detect', headers=headers['admin'], files={'image': ('x.jpg', b'bad', 'image/jpeg')})
    assert response.status_code == 422
    assert response.json()['code'] == 'INVALID_IMAGE'


def test_detection_diagnostic_zero_and_multiple_faces_do_not_create_attendance(client, headers, monkeypatch):
    frame = np.zeros((100, 200, 3), dtype=np.uint8)
    monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
    monkeypatch.setattr(face_router, '_decode_image', lambda content: frame)
    monkeypatch.setattr(face_engine, 'detect_faces', lambda image: [])
    before = _attendance_count()
    zero = client.post('/api/face-engine/detect', headers=headers['admin'], files={'image': ('x.jpg', b'x', 'image/jpeg')})
    assert zero.status_code == 200
    assert zero.json()['data'] == {'faceCount': 0, 'quality': 'NO_FACE', 'faceBoxes': []}

    monkeypatch.setattr(face_engine, 'detect_faces', lambda image: [np.array([20, 10, 40, 40, 0.9]), np.array([100, 20, 30, 30, 0.8])])
    multiple = client.post('/api/face-engine/detect', headers=headers['admin'], files={'image': ('x.jpg', b'x', 'image/jpeg')})
    assert multiple.status_code == 200
    assert multiple.json()['data']['faceCount'] == 2
    assert multiple.json()['data']['quality'] == 'MULTIPLE_FACES'
    assert multiple.json()['data']['faceBoxes'][0] == {'x': 0.1, 'y': 0.1, 'width': 0.2, 'height': 0.4}
    assert _attendance_count() == before


def _attendance_count():
    with SessionLocal() as db:
        return db.query(Attendance).count()
