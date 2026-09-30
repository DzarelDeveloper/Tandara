import time
from types import SimpleNamespace
from dataclasses import replace
import numpy as np
import pytest
from app.database import SessionLocal
from app.models import Attendance, Student
from app.services.face_engine import face_engine, FaceEngineStatus
from app.services.face_recognition import FaceRecognitionService
import app.services.face_recognition as module
import app.routers.attendance as router
from test_attendance_face_scan import open_session, submit_scan, recognized
from face_sequences import natural_face


@pytest.mark.parametrize('state', ['LIVENESS_PENDING', 'SPOOF_SUSPECTED'])
def test_verified_identity_without_live_never_attends(client, headers, student, monkeypatch, state):
    service = FaceRecognitionService()
    monkeypatch.setattr(router, 'face_recognition_service', service)
    session_id = open_session(client, headers['admin'])
    result = recognized(student)
    service._trackers[session_id].get_track(1).liveness_state = state
    # Even a stale/incorrect LIVE result cannot override the server track state.
    monkeypatch.setattr(service, 'recognize_image_many', lambda *args, **kwargs: [result])
    data = submit_scan(client, headers['admin'], session_id).json()['data']
    assert data['attendances'] == []
    with SessionLocal() as db:
        assert db.query(Attendance).count() == 0


def test_disabled_liveness_is_explicit_manual_only_not_bypass(client, headers, student, monkeypatch, attendance_clock):
    service = FaceRecognitionService()
    monkeypatch.setattr(router, 'face_recognition_service', service)
    session_id = open_session(client, headers['admin'])
    result = recognized(student)
    monkeypatch.setattr(service, 'recognize_image_many', lambda *args, **kwargs: [result])
    monkeypatch.setattr(router.settings, 'face_liveness_enabled', False)
    data = submit_scan(client, headers['admin'], session_id).json()['data']
    assert data['attendances'] == [] and data['livenessMode'] == 'MANUAL_ONLY'
    manual = client.post('/api/attendance/manual', headers=headers['admin'], json={'student_id': student, 'mode': 'CHECK_IN', 'reason': 'Petugas memeriksa langsung'})
    assert manual.status_code == 200
    with SessionLocal() as db:
        assert db.query(Attendance).one().check_in_method == 'MANUAL'


def test_two_live_registered_unknown_and_static_spoof_are_independent(client, headers, student, classroom, monkeypatch, attendance_clock):
    with SessionLocal() as db:
        second = Student(nis='PHASE4-2', full_name='Second', class_id=classroom)
        db.add(second); db.commit(); second_id = second.id
    service = FaceRecognitionService()
    monkeypatch.setattr(router, 'face_recognition_service', service)
    router._scan_cooldowns.clear()
    clock = [10.0]
    monkeypatch.setattr(module, 'time', SimpleNamespace(monotonic=lambda: clock[0], perf_counter=time.perf_counter))
    monkeypatch.setattr(service, 'load_enrolled_embeddings', lambda db: ([student, second_id], np.eye(3, dtype=np.float32)[:2]))
    monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
    monkeypatch.setattr(face_engine, 'validate_face_quality', lambda *args: None)
    monkeypatch.setattr(face_engine, 'detect_faces', lambda frame: [natural_face((clock[0] - 10) / .4 if i < 3 else 0, offset=140 * i) for i in range(4)])
    embeddings = []
    def embed(frame, face):
        index = int(round((face[0] - 10) / 140))
        embeddings.append(index)
        return np.eye(3, dtype=np.float32)[index if index < 3 else 0]
    monkeypatch.setattr(face_engine, 'extract_embedding', embed)
    monkeypatch.setattr(service, 'recognize_image_many', lambda content, db, **kw: service.recognize_frame_many(np.zeros((200, 600, 3), dtype=np.uint8), db, **kw))
    session_id = open_session(client, headers['admin'])
    for now in [10, 10.4]:
        clock[0] = now
        assert submit_scan(client, headers['admin'], session_id).json()['data']['attendances'] == []
    clock[0] = 10.8
    data = submit_scan(client, headers['admin'], session_id).json()['data']
    assert {row['studentId'] for row in data['attendances']} == {str(student), str(second_id)}
    assert [face['liveness'] for face in data['faces'][:2]] == ['LIVE', 'LIVE']
    assert data['faces'][2]['state'] == 'UNKNOWN'
    assert data['faces'][3]['state'] == 'VERIFIED'
    assert data['faces'][3]['liveness'] == 'LIVENESS_PENDING'
    before = embeddings.count(0)
    for now in [11.2, 11.6, 12.0]:
        clock[0] = now
        data = submit_scan(client, headers['admin'], session_id).json()['data']
        assert data['attendances'] == []
    assert data['faces'][3]['liveness'] == 'SPOOF_SUSPECTED'
    assert embeddings.count(0) == before  # No extra SFace calls on verified track.
    assert embeddings.count(1) == before
    with SessionLocal() as db:
        assert db.query(Attendance).count() == 2
