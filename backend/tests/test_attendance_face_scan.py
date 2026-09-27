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
	yield
	attendance_router._scan_cooldowns.clear()


def open_session(client, headers, mode='CHECK_IN'):
	response = client.post('/api/attendance-sessions/open', headers=headers, json={'mode': mode, 'camera_source': 'test-camera'})
	assert response.status_code == 200
	return int(response.json()['data']['id'])


def submit_scan(client, headers, session_id, content=b'one-frame'):
	return client.post(
		'/api/attendance/scan', headers=headers, data={'session_id': str(session_id)},
		files={'image': ('capture.jpg', content, 'image/jpeg')},
	)


def recognized(student_id, similarity=0.82):
	return RecognitionResult(
		'RECOGNIZED', student_id=student_id, similarity=similarity,
		face_box={'x': 0.25, 'y': 0.2, 'width': 0.5, 'height': 0.6},
	)


def test_check_in_face_scan_cooldown_and_websocket(client, headers, student, monkeypatch):
	session_id = open_session(client, headers['guru'], 'CHECK_IN')
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image', lambda content, db: recognized(student))
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
	assert duplicate.status_code == 409
	assert duplicate.json()['code'] == 'DUPLICATE_SCAN'
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
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image', lambda content, db: recognized(student))
	monkeypatch.setattr(attendance_router.settings, 'face_scan_cooldown_seconds', 0)
	assert submit_scan(client, headers['guru'], session_id).status_code == 200
	duplicate = submit_scan(client, headers['guru'], session_id)
	assert duplicate.status_code == 409
	assert duplicate.json()['code'] == 'DUPLICATE_SCAN'


def test_check_out_uses_existing_attendance_state(client, headers, student, monkeypatch):
	db = SessionLocal()
	db.add(Attendance(student_id=student, attendance_date=localnow().date(), check_in_time=localnow(), check_in_method='MANUAL', status='PRESENT'))
	db.commit()
	db.close()
	session_id = open_session(client, headers['admin'], 'CHECK_OUT')
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image', lambda content, db: recognized(student))
	response = submit_scan(client, headers['admin'], session_id)
	assert response.status_code == 200
	assert response.json()['data']['mode'] == 'CHECK_OUT'
	db = SessionLocal()
	record = db.query(Attendance).filter_by(student_id=student).one()
	assert record.check_out_method == 'FACE'
	assert record.check_out_time is not None
	db.close()


def test_unknown_face_does_not_create_attendance(client, headers, student, monkeypatch):
	session_id = open_session(client, headers['admin'])
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image', lambda content, db: RecognitionResult('UNKNOWN_FACE', reason='BELOW_THRESHOLD'))
	response = submit_scan(client, headers['admin'], session_id)
	assert response.status_code == 422
	assert response.json()['code'] == 'UNKNOWN_FACE'
	assert 'student' not in str(response.json()).lower()
	db = SessionLocal()
	assert db.query(Attendance).count() == 0
	db.close()


def test_inactive_session_and_role_are_rejected_before_recognition(client, headers, monkeypatch):
	called = []
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image', lambda content, db: called.append(True))
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
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image', lambda content, db: called.append(True))
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
	monkeypatch.setattr(attendance_router.face_recognition_service, 'recognize_image', lambda content, db: recognized(student))

	async def fail_broadcast(event, data):
		raise RuntimeError('socket closed')

	monkeypatch.setattr(attendance_router, 'broadcast', fail_broadcast)
	response = submit_scan(client, headers['admin'], session_id)
	assert response.status_code == 200
	db = SessionLocal()
	assert db.query(Attendance).filter_by(student_id=student).one().check_in_method == 'FACE'
	db.close()


def test_scan_contract_does_not_accept_client_identity(client, headers):
	schema = client.get('/openapi.json').json()
	operation = schema['paths']['/api/attendance/scan']['post']
	assert 'multipart/form-data' in operation['requestBody']['content']
	assert 'student_id' not in str(operation['requestBody'])
