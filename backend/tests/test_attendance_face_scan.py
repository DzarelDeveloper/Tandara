import pytest
from argon2 import PasswordHasher

import app.routers.attendance as attendance_router
from app.database import SessionLocal
from app.main import localnow
from app.models import Attendance, User
from app.services.face_engine import FaceEngineStatus, face_engine
from app.services.face_recognition import RecognitionResult


@pytest.fixture(autouse=True)
def clear_scan_cooldowns():
	attendance_router._scan_cooldowns.clear()
	attendance_router.face_recognition_service._trackers.clear()
	yield
	attendance_router._scan_cooldowns.clear()
	attendance_router.face_recognition_service._trackers.clear()


def open_session(client, headers, mode='CHECK_IN'):
	response = client.post('/api/attendance-sessions/open', headers=headers, json={'mode': mode, 'camera_source': 'test-camera'})
	assert response.status_code == 200
	return int(response.json()['data']['id'])


def submit_scan(client, headers, session_id, content=b'one-frame', benchmark=False):
	return client.post(
		'/api/attendance/scan', headers=headers, data={'session_id': str(session_id), 'benchmark': str(benchmark).lower()},
		files={'image': ('capture.jpg', content, 'image/jpeg')},
	)


def recognized(student_id, similarity=0.82, *, track_id=1, telemetry=None):
    from app.models import AttendanceSession
    from app.services.face_tracking import FaceTrack
    import time
    with SessionLocal() as db:
        session_id = db.query(AttendanceSession).filter_by(status='ACTIVE').first().id
    tracker = attendance_router.face_recognition_service._get_tracker(session_id, time.monotonic())
    tracker.last_used = time.monotonic()
    track = tracker.get_track(track_id)
    if track is None:
        track = FaceTrack(track_id, (0.25, 0.2, 0.5, 0.6), time.monotonic(), state='VERIFIED', verified_student_id=student_id, liveness_state='LIVE')
        tracker._tracks[track_id] = track
    return RecognitionResult(
        'RECOGNIZED', student_id=student_id, similarity=similarity,
        face_box={'x': 0.25, 'y': 0.2, 'width': 0.5, 'height': 0.6},
        track_id=track_id, track_state=track.state, evidence_count=3, telemetry=telemetry or {}, liveness_state='LIVE',
    )


def test_check_in_face_scan_cooldown_and_websocket(client, headers, student, monkeypatch):
	session_id = open_session(client, headers['guru'], 'CHECK_IN')
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda content, db, **kwargs: [recognized(student)])
	events = []

	async def broadcast(event, data):
		events.append((event, data))

	monkeypatch.setattr(attendance_router, 'broadcast', broadcast)
	response = submit_scan(client, headers['guru'], session_id)
	assert response.status_code == 200
	result = response.json()['data']
	assert result['method'] == 'FACE'
	assert result['mode'] == 'CHECK_IN'
	assert result['similarity'] == pytest.approx(0.82)
	assert result['faceBox'] == {'x': 0.25, 'y': 0.2, 'width': 0.5, 'height': 0.6}
	assert result['studentId'] == str(student)
	duplicate = submit_scan(client, headers['guru'], session_id)
	assert duplicate.status_code == 200
	assert duplicate.json()['data']['faces'][0]['status'] == 'DUPLICATE_SCAN'
	db = SessionLocal()
	record = db.query(Attendance).filter_by(student_id=student).one()
	assert record.check_in_method == 'FACE'
	assert record.confidence_score is None
	assert len(events) == 1
	assert events[0][0] == 'ATTENDANCE_SUCCESS'
	assert events[0][1]['similarity'] == pytest.approx(0.82)
	assert events[0][1]['method'] == 'FACE'
	db.close()


def test_existing_attendance_is_duplicate_after_cooldown(client, headers, student, monkeypatch):
	session_id = open_session(client, headers['guru'], 'CHECK_IN')
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda content, db, **kwargs: [recognized(student)])
	monkeypatch.setattr(attendance_router.settings, 'face_scan_cooldown_seconds', 0)
	assert submit_scan(client, headers['guru'], session_id).status_code == 200
	duplicate = submit_scan(client, headers['guru'], session_id)
	assert duplicate.status_code == 200
	assert duplicate.json()['data']['faces'][0]['status'] == 'DUPLICATE_SCAN'


def test_check_out_uses_existing_attendance_state(client, headers, student, monkeypatch, attendance_clock):
	attendance_clock('15:30:00')
	db = SessionLocal()
	db.add(Attendance(student_id=student, attendance_date=localnow().date(), check_in_time=localnow(), check_in_method='MANUAL', status='PRESENT'))
	db.commit()
	db.close()
	session_id = open_session(client, headers['admin'], 'CHECK_OUT')
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda content, db, **kwargs: [recognized(student)])
	response = submit_scan(client, headers['admin'], session_id)
	assert response.status_code == 200
	assert response.json()['data']['mode'] == 'CHECK_OUT'
	db = SessionLocal()
	record = db.query(Attendance).filter_by(student_id=student).one()
	assert record.check_out_method == 'FACE'
	assert record.check_out_time is not None
	db.close()


def test_same_registered_student_checks_in_then_checks_out(client, headers, student, monkeypatch, attendance_clock):
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda content, db, **kwargs: [recognized(student)])
	attendance_clock('06:45:00')
	check_in_session = open_session(client, headers['guru'], 'CHECK_IN')
	check_in = submit_scan(client, headers['guru'], check_in_session).json()['data']['attendances'][0]
	assert check_in['studentId'] == str(student)
	assert client.post(f'/api/attendance-sessions/{check_in_session}/close', headers=headers['guru']).status_code == 200

	attendance_clock('15:30:00')
	check_out_session = open_session(client, headers['guru'], 'CHECK_OUT')
	check_out = submit_scan(client, headers['guru'], check_out_session).json()['data']['attendances'][0]
	assert check_out['studentId'] == str(student)
	assert check_out['id'] == check_in['id']
	assert check_out['checkOutTime'].endswith('15:30:00')
	with SessionLocal() as db:
		assert db.query(Attendance).filter_by(student_id=student).count() == 1


def test_unknown_face_does_not_create_attendance(client, headers, student, monkeypatch):
	session_id = open_session(client, headers['admin'])
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda content, db, **kwargs: [RecognitionResult('UNKNOWN_FACE', reason='BELOW_THRESHOLD')])
	response = submit_scan(client, headers['admin'], session_id)
	assert response.status_code == 422
	assert response.json()['code'] == 'UNKNOWN_FACE'
	assert response.json()['data']['attendances'] == []
	assert response.json()['data']['faces'][0]['recognitionStatus'] == 'UNKNOWN_FACE'
	assert response.json()['data']['faces'][0]['trackState'] == 'TRACKING'
	assert 'student' not in str(response.json()).lower()
	db = SessionLocal()
	assert db.query(Attendance).count() == 0
	db.close()


@pytest.mark.parametrize('status', ['FACE_TOO_SMALL', 'FACE_TOO_BLURRY', 'FACE_BAD_POSE', 'FACE_LOW_CONFIDENCE'])
def test_quality_rejections_never_create_attendance(client, headers, monkeypatch, status):
	session_id = open_session(client, headers['admin'])
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda content, db, **kwargs: [RecognitionResult(status, reason=status)])
	response = submit_scan(client, headers['admin'], session_id)

	assert response.status_code == 422
	assert response.json()['code'] == status
	db = SessionLocal()
	assert db.query(Attendance).count() == 0
	db.close()


@pytest.mark.parametrize(('app_env', 'includes_telemetry'), [('development', True), ('production', False)])
def test_rejected_scan_telemetry_is_development_only(client, headers, student, monkeypatch, app_env, includes_telemetry):
	session_id = open_session(client, headers['admin'])
	telemetry = {
		'frame_size_px': {'width': 1920, 'height': 1080}, 'detection_count': 1,
		'bbox_size_px': {'width': 38.0, 'height': 42.0}, 'detection_confidence': 0.91,
		'quality_status': 'ACCEPTABLE', 'recognition_status': 'UNKNOWN_FACE',
		'recognition_similarity': 0.31, 'second_best_similarity': 0.29, 'ambiguity_margin': 0.02,
		'timings_ms': {'detection': 9.0, 'embedding': 11.0, 'matching': 1.0, 'total': 22.0},
	}
	monkeypatch.setattr(attendance_router.settings, 'app_env', app_env)
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda content, db, **kwargs: [RecognitionResult('UNKNOWN_FACE', reason='BELOW_THRESHOLD', telemetry=telemetry)])
	response = submit_scan(client, headers['admin'], session_id)

	assert response.status_code == 422
	assert response.json().get('telemetry') == (telemetry if includes_telemetry else None)
	assert 'student_id' not in response.json()
	db = SessionLocal()
	assert db.query(Attendance).count() == 0
	db.close()


@pytest.mark.parametrize(('app_env', 'includes_telemetry'), [('development', True), ('production', False)])
def test_duplicate_scan_diagnostic_preserves_single_attendance(client, headers, student, monkeypatch, app_env, includes_telemetry):
	session_id = open_session(client, headers['admin'])
	monkeypatch.setattr(attendance_router.settings, 'app_env', app_env)
	monkeypatch.setattr(attendance_router.settings, 'face_scan_cooldown_seconds', 0)
	telemetry = {'recognition_status': 'RECOGNIZED', 'recognition_similarity': 0.82, 'second_best_similarity': 0.41, 'ambiguity_margin': 0.41}
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda content, db, **kwargs: [recognized(student, telemetry=telemetry)])
	assert submit_scan(client, headers['admin'], session_id).status_code == 200
	duplicate = submit_scan(client, headers['admin'], session_id)

	assert duplicate.status_code == 200
	assert duplicate.json()['data']['faces'][0]['status'] == 'DUPLICATE_SCAN'
	assert duplicate.json()['data']['faces'][0].get('telemetry') == (telemetry if includes_telemetry else None)
	db = SessionLocal()
	assert db.query(Attendance).count() == 1
	db.close()


def test_inactive_session_and_role_are_rejected_before_recognition(client, headers, monkeypatch):
	called = []
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda content, db, **kwargs: [called.append(True)])
	session_id = open_session(client, headers['admin'])
	assert client.post(f'/api/attendance-sessions/{session_id}/close', headers=headers['admin']).status_code == 200
	closed = submit_scan(client, headers['admin'], session_id)
	assert closed.status_code == 422
	assert closed.json()['code'] == 'SESSION_NOT_ACTIVE'
	invalid = submit_scan(client, headers['admin'], 99999)
	assert invalid.status_code == 422
	unauthorized = submit_scan(client, {}, session_id)
	assert unauthorized.status_code == 401
	assert called == []


def test_scan_rejects_authenticated_role_without_permission(client, actors, monkeypatch):
	db = SessionLocal()
	viewer = User(
		full_name='Viewer Test', username='viewer-test',
		password_hash=PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1).hash('password-viewer'),
		role='VIEWER',
	)
	db.add(viewer)
	db.commit()
	db.close()
	login = client.post('/api/auth/login', json={'username': 'viewer-test', 'password': 'password-viewer'})
	viewer_headers = {'Authorization': f"Bearer {login.json()['data']['access_token']}"}
	called = []
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda content, db, **kwargs: [called.append(True)])
	response = submit_scan(client, viewer_headers, 1)
	assert response.status_code == 403
	assert response.json()['code'] == 'FORBIDDEN'
	assert called == []


def test_malformed_image_is_rejected(client, headers, monkeypatch):
	import cv2

	session_id = open_session(client, headers['admin'])
	monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
	monkeypatch.setattr(face_engine, '_cv2', cv2)
	response = submit_scan(client, headers['admin'], session_id, b'not an image')
	assert response.status_code == 422
	assert response.json()['code'] == 'INVALID_IMAGE'


def test_broadcast_failure_does_not_undo_committed_attendance(client, headers, student, monkeypatch):
	session_id = open_session(client, headers['admin'])
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda content, db, **kwargs: [recognized(student)])

	async def fail_broadcast(event, data):
		raise RuntimeError('socket closed')

	monkeypatch.setattr(attendance_router, 'broadcast', fail_broadcast)
	response = submit_scan(client, headers['admin'], session_id)
	assert response.status_code == 200
	db = SessionLocal()
	assert db.query(Attendance).filter_by(student_id=student).one().check_in_method == 'FACE'
	db.close()


def test_development_benchmark_runs_verified_path_without_persisting_or_publishing(client, headers, student, monkeypatch):
	session_id = open_session(client, headers['admin'])
	monkeypatch.setattr(attendance_router.settings, 'app_env', 'development')
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda *args, **kwargs: [recognized(student)])
	events = []

	async def broadcast(event, data):
		events.append((event, data))

	monkeypatch.setattr(attendance_router, 'broadcast', broadcast)
	response = submit_scan(client, headers['admin'], session_id, benchmark=True)
	assert response.status_code == 200
	data = response.json()['data']
	assert data['benchmarkMode'] is True
	assert data['attendances'] == []
	assert data['faces'][0]['benchmarkReady'] is True
	assert data['faces'][0]['attendanceStatus'] == 'NOT_RECORDED'
	assert 'studentName' not in data['faces'][0]
	timings = data['faces'][0]['telemetry']['timings_ms']
	assert timings['attendance_write'] == 0.0
	assert timings['realtime_publish'] == 0.0
	assert timings['backend_total'] >= 0
	assert events == []
	with SessionLocal() as db:
		assert db.query(Attendance).count() == 0


def test_benchmark_mode_is_rejected_in_production_before_recognition(client, headers, monkeypatch):
	session_id = open_session(client, headers['admin'])
	called = []
	monkeypatch.setattr(attendance_router.settings, 'app_env', 'production')
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda *args, **kwargs: called.append(True))
	response = submit_scan(client, headers['admin'], session_id, benchmark=True)
	assert response.status_code == 403
	assert response.json()['code'] == 'BENCHMARK_NOT_ALLOWED'
	assert called == []


def test_benchmark_mode_does_not_bypass_spoof_or_pending_liveness(client, headers, student, monkeypatch):
	session_id = open_session(client, headers['admin'])
	monkeypatch.setattr(attendance_router.settings, 'app_env', 'development')
	result = recognized(student)
	tracker = attendance_router.face_recognition_service._trackers[session_id]
	tracker.get_track(result.track_id).liveness_state = 'SPOOF_SUSPECTED'
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda *args, **kwargs: [result])
	response = submit_scan(client, headers['admin'], session_id, benchmark=True)
	assert response.status_code == 200
	face = response.json()['data']['faces'][0]
	assert face['liveness'] == 'SPOOF_SUSPECTED'
	assert face.get('benchmarkReady') is None
	assert face['attendanceStatus'] == 'NOT_RECORDED'
	with SessionLocal() as db:
		assert db.query(Attendance).count() == 0


def test_scan_contract_does_not_accept_client_identity(client, headers):
	schema = client.get('/openapi.json').json()
	operation = schema['paths']['/api/attendance/scan']['post']
	assert 'multipart/form-data' in operation['requestBody']['content']
	assert 'student_id' not in str(operation['requestBody'])


@pytest.mark.parametrize('rejected_status', ['UNKNOWN_FACE', 'AMBIGUOUS_FACE', 'FACE_TOO_BLURRY'])
def test_rejected_face_does_not_block_registered(client, headers, student, monkeypatch, rejected_status):
    session_id = open_session(client, headers['admin'])
    results = [RecognitionResult(rejected_status, track_id=1), recognized(student, 0.9, track_id=2)]
    monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda *args, **kwargs: results)
    response = submit_scan(client, headers['admin'], session_id)
    assert response.status_code == 200
    data = response.json()['data']
    assert len(data['faces']) == 2
    assert data['faces'][0]['status'] == rejected_status
    assert 'studentId' not in data['faces'][0]
    assert len(data['attendances']) == 1
    assert data['attendances'][0]['studentId'] == str(student)
    duplicate = submit_scan(client, headers['admin'], session_id).json()['data']
    assert duplicate['attendances'] == []
    assert duplicate['faces'][1]['status'] == 'DUPLICATE_SCAN'
    assert duplicate['faces'][1]['studentName'] == 'Siswa Test'
    with SessionLocal() as db:
        assert db.query(Attendance).count() == 1


def test_two_registered_students_and_database_duplicate_protection(client, headers, student, classroom, monkeypatch):
    from app.models import Student
    with SessionLocal() as db:
        other = Student(nis='SECOND', full_name='Second Student', class_id=classroom)
        db.add(other)
        db.commit()
        other_id = other.id
    session_id = open_session(client, headers['admin'])
    results = [recognized(sid, 0.9, track_id=i + 1) for i, sid in enumerate([student, other_id])]
    monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda *args, **kwargs: results)
    monkeypatch.setattr(attendance_router.settings, 'face_scan_cooldown_seconds', 0)
    data = submit_scan(client, headers['admin'], session_id).json()['data']
    assert {a['studentId'] for a in data['attendances']} == {str(student), str(other_id)}
    attendance_router._scan_cooldowns.clear()
    for track in attendance_router.face_recognition_service._trackers[session_id]._tracks.values():
        track.attended_student_ids.clear()
        track.state = 'VERIFIED'
        track.attendance_retry_at = 0
    duplicate = submit_scan(client, headers['admin'], session_id).json()['data']
    assert duplicate['attendances'] == []
    assert all(f['status'] == 'DUPLICATE_SCAN' for f in duplicate['faces'])
    with SessionLocal() as db:
        assert db.query(Attendance).count() == 2


@pytest.mark.parametrize('mode', ['CHECK_IN', 'CHECK_OUT'])
def test_temporal_pipeline_requests_attendance_once_after_verified(client, headers, student, monkeypatch, mode, attendance_clock):
    attendance_clock('15:30:00' if mode == 'CHECK_OUT' else '06:45:00')
    import time
    from types import SimpleNamespace
    import numpy as np
    import app.services.face_recognition as module
    from app.services.face_recognition import FaceRecognitionService
    if mode == 'CHECK_OUT':
        with SessionLocal() as db:
            db.add(Attendance(student_id=student, attendance_date=localnow().date(), check_in_time=localnow(), check_in_method='MANUAL', status='PRESENT'))
            db.commit()
    session_id = open_session(client, headers['admin'], mode)
    clock = [10.0]
    service = FaceRecognitionService()
    monkeypatch.setattr(module, 'time', SimpleNamespace(monotonic=lambda: clock[0], perf_counter=time.perf_counter))
    monkeypatch.setattr(attendance_router, 'face_recognition_service', service)
    monkeypatch.setattr(service, 'load_enrolled_embeddings', lambda db: ([student], np.array([[1, 0]], dtype=np.float32)))
    monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
    from face_sequences import natural_face
    monkeypatch.setattr(face_engine, 'detect_faces', lambda frame: [natural_face((clock[0] - 10) / .4)])
    monkeypatch.setattr(face_engine, 'validate_face_quality', lambda frame, face: None)
    monkeypatch.setattr(face_engine, 'extract_embedding', lambda frame, face: np.array([1, 0], dtype=np.float32))
    monkeypatch.setattr(service, 'recognize_image_many', lambda content, db, **kw: service.recognize_frame_many(np.zeros((200, 200, 3), dtype=np.uint8), db, **kw))
    original_take = attendance_router.take
    requests = []
    def take(*args, **kwargs):
        requests.append(True)
        return original_take(*args, **kwargs)
    monkeypatch.setattr(attendance_router, 'take', take)
    events = []
    async def broadcast(event, data):
        events.append(data)
    monkeypatch.setattr(attendance_router, 'broadcast', broadcast)
    for now in [10, 10.4]:
        clock[0] = now
        data = submit_scan(client, headers['admin'], session_id).json()['data']
        assert data['attendances'] == []
        assert data['faces'][0]['state'] == 'VERIFYING'
        assert requests == []
    clock[0] = 10.8
    data = submit_scan(client, headers['admin'], session_id).json()['data']
    assert data['faces'][0]['state'] == 'ATTENDED'
    assert len(data['attendances']) == 1
    assert events[0]['attendance_id'] == int(data['attendances'][0]['id'])
    assert events[0]['recorded_at'] == data['attendances'][0]['recordedAt']
    assert events[0]['session_id'] == session_id
    for now in [10.9, 11.3, 12, 12.5]:
        clock[0] = now
        assert submit_scan(client, headers['admin'], session_id).json()['data']['attendances'] == []
    assert len(requests) == 1
    assert len(events) == 1


def test_single_recognition_without_verified_track_cannot_attend(client, headers, student, monkeypatch):
    session_id = open_session(client, headers['admin'])
    monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda *args, **kwargs: [RecognitionResult('RECOGNIZED', student_id=student, track_id=1)])
    data = submit_scan(client, headers['admin'], session_id).json()['data']
    assert data['attendances'] == []
    assert data['faces'][0]['state'] == 'VERIFYING'
    with SessionLocal() as db:
        assert db.query(Attendance).count() == 0


def test_verified_face_obeys_schedule_and_late_status(client, headers, student, monkeypatch, attendance_clock):
    session_id = open_session(client, headers['admin'])
    attendance_clock('07:01:00')
    monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image_many', lambda *args, **kw: [recognized(student)])
    data = submit_scan(client, headers['admin'], session_id).json()['data']
    assert data['attendances'][0]['status'] == 'LATE'
    assert client.post(f'/api/attendance-sessions/{session_id}/close', headers=headers['admin']).status_code == 200
    session_id = open_session(client, headers['admin'], 'CHECK_OUT')
    attendance_clock('15:29:59')
    early = submit_scan(client, headers['admin'], session_id).json()['data']
    assert early['attendances'] == []
    assert early['faces'][0]['errorCode'] == 'CHECK_OUT_TOO_EARLY'
    assert '15:30' in early['faces'][0]['message']
    attendance_router.face_recognition_service._trackers[session_id].get_track(1).attendance_retry_at = 0
    attendance_clock('15:30:00')
    checkout = submit_scan(client, headers['admin'], session_id).json()['data']
    assert checkout['attendances'][0]['status'] == 'LATE'
    assert checkout['attendances'][0]['checkOutTime'].endswith('15:30:00')
