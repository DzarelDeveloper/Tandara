from datetime import date, datetime, timedelta, timezone
import jwt
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.config import settings
from app.database import SessionLocal
from app.main import app, clients
from app.models import Attendance, AuditLog, Student, User


@pytest.mark.parametrize('method,path', [
    ('get', '/api/users'), ('post', '/api/classes'), ('get', '/api/guardians'),
    ('get', '/api/students'), ('post', '/api/attendance-sessions/open'),
    ('get', '/api/attendance'), ('get', '/api/leave-requests'),
    ('get', '/api/reports/attendance.csv'), ('get', '/api/audit-logs'),
])
def test_representative_protected_endpoints_require_token(client, method, path):
    assert getattr(client, method)(path).status_code == 401


def test_auth_login_errors_and_me_security(client, actors, headers):
    assert client.post('/api/auth/login', json={'username': 'missing', 'password': 'anything'}).status_code == 401
    assert client.post('/api/auth/login', json={'username': 'admin-test', 'password': 'wrong'}).status_code == 401
    assert client.post('/api/auth/login', json={'username': 'inactive-test', 'password': 'password-inactive'}).status_code == 401
    assert client.post('/api/auth/login', json={'username': 'admin-test'}).status_code == 422
    assert client.get('/api/auth/me').status_code == 401
    assert client.get('/api/auth/me', headers={'Authorization': 'Bearer bad'}).status_code == 401
    response = client.get('/api/auth/me', headers=headers['admin']); assert response.status_code == 200
    assert response.json()['data']['role'] == 'ADMIN_IT'
    assert 'password' not in str(response.json()).lower()


def test_logout_is_stateless_and_audited(client, actors, headers):
    assert client.post('/api/auth/logout').status_code == 401
    assert client.post('/api/auth/logout', headers=headers['admin']).status_code == 200
    assert client.get('/api/auth/me', headers=headers['admin']).status_code == 200
    db = SessionLocal(); assert db.query(AuditLog).filter_by(action='LOGOUT').count() == 1; db.close()


def test_user_management_and_security(client, actors, headers):
    assert client.get('/api/users', headers=headers['admin']).status_code == 200
    assert client.get('/api/users', headers=headers['guru']).status_code == 403
    body = {'full_name': 'New User', 'username': 'new-user', 'password': 'password-new', 'role': 'GURU_PIKET'}
    created = client.post('/api/users', headers=headers['admin'], json=body); assert created.status_code == 200
    assert 'password' not in str(created.json()).lower(); uid = created.json()['data']['id']
    assert client.post('/api/users', headers=headers['admin'], json=body).json()['code'] == 'USERNAME_EXISTS'
    assert client.post('/api/users', headers=headers['admin'], json={**body, 'username': 'bad-role', 'role': 'BAD'}).status_code == 422
    assert client.patch(f'/api/users/{uid}/status', headers=headers['admin'], params={'active': 'false'}).status_code == 200
    assert client.post('/api/auth/login', json={'username': 'new-user', 'password': 'password-new'}).status_code == 401
    db = SessionLocal(); row = db.get(User, int(uid)); assert row.password_hash != body['password']; assert db.query(AuditLog).filter(AuditLog.action.in_(['CREATE', 'STATUS_CHANGE'])).count() >= 2; db.close()


def test_classes_roles_duplicate_and_student_count(client, actors, headers, classroom, student):
    listed = client.get('/api/classes', headers=headers['guru']); assert listed.status_code == 200 and listed.json()['data'][0]['studentCount'] == 1
    payload = {'name': 'XII-New', 'grade': '12', 'major': 'IPS', 'school_year': '2026/2027'}
    assert client.post('/api/classes', headers=headers['guru'], json=payload).status_code == 403
    assert client.post('/api/classes', headers=headers['admin'], json=payload).status_code == 200
    assert client.post('/api/classes', headers=headers['admin'], json=payload).json()['code'] == 'CLASS_EXISTS'


def test_guardian_crud_link_and_authorization(client, actors, headers, classroom):
    assert client.post('/api/guardians', headers=headers['guru'], json={'full_name': 'X', 'phone_number': '081234567890'}).status_code == 403
    assert client.post('/api/guardians', headers=headers['admin'], json={'full_name': 'Bad', 'phone_number': 'bad'}).status_code == 422
    created = client.post('/api/guardians', headers=headers['admin'], json={'full_name': 'Guardian Search', 'phone_number': '081234567891'}); assert created.status_code == 200; gid = created.json()['data']['id']
    assert len(client.get('/api/guardians', headers=headers['admin'], params={'q': 'Search'}).json()['data']) == 1
    assert client.patch(f'/api/guardians/{gid}', headers=headers['admin'], json={'full_name': 'Guardian Updated', 'phone_number': '081234567892'}).status_code == 200
    db = SessionLocal(); s = Student(nis='LINK-1', full_name='Linked', class_id=classroom); db.add(s); db.commit(); sid = s.id; db.close()
    assert client.post(f'/api/guardians/{gid}/students', headers=headers['admin'], json=[sid]).status_code == 200
    assert client.patch(f'/api/guardians/{gid}/status', headers=headers['admin'], params={'active': 'false'}).status_code == 200


def test_students_crud_filters_history_and_audit(client, actors, headers, classroom, guardian):
    body = {'nis': 'S-001', 'full_name': 'Alpha Student', 'class_id': classroom, 'guardian_id': guardian, 'gender': 'L'}
    created = client.post('/api/students', headers=headers['admin'], json=body); assert created.status_code == 200; sid = created.json()['data']['id']
    assert client.post('/api/students', headers=headers['admin'], json=body).json()['code'] == 'NIS_EXISTS'
    assert client.post('/api/students', headers=headers['admin'], json={**body, 'nis': 'BADCLASS', 'class_id': 999}).status_code == 422
    invalid = client.post('/api/students', headers=headers['admin'], json={**body, 'nis': 'BADGUARD', 'guardian_id': 999}); assert invalid.status_code == 422 and invalid.json()['code'] == 'GUARDIAN_NOT_FOUND'
    assert client.post('/api/students', headers=headers['admin'], json={**body, 'nis': 'NO-GUARD', 'full_name': 'No Guardian', 'guardian_id': None}).status_code == 200
    assert len(client.get('/api/students', headers=headers['admin'], params={'q': 'Alpha'}).json()['data']) == 1
    assert len(client.get('/api/students', headers=headers['admin'], params={'q': 'S-001'}).json()['data']) == 1
    assert len(client.get('/api/students', headers=headers['admin'], params={'class_id': classroom}).json()['data']) == 2
    assert client.get(f'/api/students/{sid}', headers=headers['admin']).status_code == 200
    assert client.patch(f'/api/students/{sid}', headers=headers['admin'], json={**body, 'full_name': 'Beta Student'}).status_code == 200
    db = SessionLocal(); db.add(Attendance(student_id=int(sid), attendance_date=date.today(), status='PRESENT')); db.commit(); db.close()
    assert client.delete(f'/api/students/{sid}', headers=headers['admin']).status_code == 200
    assert str(sid) not in [x['id'] for x in client.get('/api/students', headers=headers['admin']).json()['data']]
    db = SessionLocal(); assert db.query(Attendance).filter_by(student_id=int(sid)).count() == 1; assert {'CREATE','UPDATE','DEACTIVATE'} <= {x.action for x in db.query(AuditLog).filter_by(entity_type='Student', entity_id=str(sid)).all()}; db.close()


def test_import_template_preview_validation_and_import(client, actors, headers, classroom):
    template = client.get('/api/students/import-template.csv', headers=headers['admin']); assert template.status_code == 200 and 'nis,nama,kelas' in template.text
    csv = '\ufeffnis,nama,kelas,jurusan,nama_wali,nomor_wali\nI-1,Import Student,XII-Test,IPA,Wali,081234567899\n'
    preview = client.post('/api/students/import/preview', headers=headers['admin'], files={'file': ('x.csv', csv, 'text/csv')}); assert preview.status_code == 200 and preview.json()['data']['valid_rows'] == 1
    db = SessionLocal(); assert db.query(Student).count() == 0; db.close()
    bad = 'nis,nama,kelas,jurusan,nama_wali,nomor_wali\nDUP,A,XII-Test,IPA,W,0812\nDUP,B,XII-Test,IPA,W,0812\n'
    assert client.post('/api/students/import', headers=headers['admin'], files={'file': ('x.csv', bad, 'text/csv')}).status_code == 422
    db = SessionLocal(); assert db.query(Student).count() == 0; db.close()
    assert client.post('/api/students/import', headers=headers['admin'], files={'file': ('x.csv', csv, 'text/csv')}).status_code == 200


def test_import_routes_not_captured_by_student_dynamic_route(client, actors, headers):
    assert client.get('/api/students/import-template.csv', headers=headers['admin']).status_code == 200
    assert client.post('/api/students/import/preview', headers=headers['admin'], files={'file': ('x.csv', 'bad', 'text/csv')}).status_code == 422


def test_attendance_sessions_and_audits(client, actors, headers):
    body = {'mode': 'CHECK_IN', 'camera_source': 'camera-1'}
    opened = client.post('/api/attendance-sessions/open', headers=headers['guru'], json=body); assert opened.status_code == 200; sid = opened.json()['data']['id']
    assert client.get('/api/attendance-sessions/active', headers=headers['guru']).json()['data']['id'] == sid
    assert client.post('/api/attendance-sessions/open', headers=headers['guru'], json=body).status_code == 409
    assert client.post('/api/attendance-sessions/open', headers=headers['guru'], json={**body, 'mode': 'CHECK_OUT'}).status_code == 200
    assert client.post(f'/api/attendance-sessions/{sid}/close', headers=headers['guru']).status_code == 200
    assert client.post(f'/api/attendance-sessions/{sid}/close', headers=headers['guru']).status_code == 404


def test_attendance_state_machine_list_summary_correction(client, actors, headers, student):
    out = client.post('/api/attendance/manual', headers=headers['guru'], json={'student_id': student, 'mode': 'CHECK_OUT', 'reason': 'test reason'}); assert out.status_code == 422
    checkin = client.post('/api/attendance/manual', headers=headers['guru'], json={'student_id': student, 'mode': 'CHECK_IN', 'reason': 'test reason'}); assert checkin.status_code == 200; aid = checkin.json()['data']['id']
    assert client.post('/api/attendance/manual', headers=headers['guru'], json={'student_id': student, 'mode': 'CHECK_IN', 'reason': 'again'}).status_code == 409
    assert client.post('/api/attendance/manual', headers=headers['guru'], json={'student_id': student, 'mode': 'CHECK_OUT', 'reason': 'checkout'}).status_code == 200
    assert client.get('/api/attendance', headers=headers['guru'], params={'date_from': date.today().isoformat(), 'date_to': date.today().isoformat()}).status_code == 200
    assert client.get('/api/attendance', headers=headers['guru'], params={'date_from': 'bad'}).status_code == 422
    assert client.get('/api/attendance/summary', headers=headers['guru']).json()['data']['today'] == 1
    assert client.patch(f'/api/attendance/{aid}/correction', headers=headers['guru'], json={'status': 'LATE'}).status_code == 422
    assert client.patch(f'/api/attendance/{aid}/correction', headers=headers['guru'], json={'status': 'LATE', 'notes': 'Late bus'}).status_code == 200


def test_scan_rejects_inactive_or_missing_session_without_mutation(client, actors, headers, student):
    response = client.post('/api/attendance/scan', headers=headers['guru'], json={'session_id': 999, 'student_id': student, 'confidence_score': 0.9})
    assert response.status_code == 422
    db = SessionLocal(); assert db.query(Attendance).count() == 0; db.close()


def test_leave_approve_reject_and_no_duplicate_attendance(client, actors, headers, student):
    body = {'student_id': student, 'leave_date': date.today().isoformat(), 'leave_type': 'SICK', 'reason': 'Flu berat'}
    created = client.post('/api/leave-requests', headers=headers['guru'], json=body); assert created.status_code == 200; lid = created.json()['data']['id']
    assert client.post(f'/api/leave-requests/{lid}/approve', headers=headers['guru']).status_code == 200
    assert client.post(f'/api/leave-requests/{lid}/approve', headers=headers['guru']).status_code == 404
    db = SessionLocal(); assert db.query(Attendance).filter_by(student_id=student, attendance_date=date.today()).one().status == 'SICK'; db.close()
    second = client.post('/api/leave-requests', headers=headers['guru'], json={**body, 'leave_type': 'PERMISSION'}); lid2 = second.json()['data']['id']
    assert client.post(f'/api/leave-requests/{lid2}/reject', headers=headers['guru'], json={'rejectionReason': 'x'}).status_code == 422
    assert client.post(f'/api/leave-requests/{lid2}/reject', headers=headers['guru'], json={'rejectionReason': 'Tidak lengkap'}).status_code == 200


def test_reports_and_audit_log_contract(client, actors, headers, student):
    assert client.get('/api/reports/attendance.csv').status_code == 401
    empty = client.get('/api/reports/attendance.csv', headers=headers['guru']); assert empty.status_code == 200 and empty.text.startswith('Tanggal,NIS,Nama') and 'attachment; filename=' in empty.headers['content-disposition']
    db = SessionLocal(); db.add(Attendance(student_id=student, attendance_date=date.today(), status='PRESENT')); db.commit(); db.close()
    report = client.get('/api/reports/attendance.csv', headers=headers['guru'], params={'status': 'PRESENT', 'student_id': student}); assert 'TEST-001' in report.text
    assert client.get('/api/audit-logs').status_code == 401
    assert client.get('/api/audit-logs', headers=headers['guru']).status_code == 403
    rows = client.get('/api/audit-logs', headers=headers['admin']); assert rows.status_code == 200 and isinstance(rows.json()['data'], list)


def test_websocket_auth_events_and_disconnect(client, actors, headers, student):
    try:
        with client.websocket_connect('/ws/attendance'):
            assert False
    except WebSocketDisconnect as exc: assert exc.code == 1008
    inactive_token = jwt.encode({'sub': str(actors['inactive_id']), 'role': 'GURU_PIKET', 'exp': datetime.now(timezone.utc) + timedelta(minutes=5)}, settings.secret_key, algorithm='HS256')
    try:
        with client.websocket_connect('/ws/attendance?token=' + inactive_token):
            assert False
    except WebSocketDisconnect as exc: assert exc.code == 1008
    admin_token = headers['admin']['Authorization'][7:]
    with client.websocket_connect('/ws/attendance?token=' + admin_token) as ws:
        opened = client.post('/api/attendance-sessions/open', headers=headers['admin'], json={'mode': 'CHECK_IN', 'camera_source': 'ws'}); assert opened.status_code == 200
        assert ws.receive_json()['event'] == 'SESSION_OPENED'
        assert client.post('/api/attendance/manual', headers=headers['admin'], json={'student_id': student, 'mode': 'CHECK_IN', 'reason': 'ws test'}).status_code == 200
        assert ws.receive_json()['event'] == 'ATTENDANCE_SUCCESS'
        assert client.post(f"/api/attendance-sessions/{opened.json()['data']['id']}/close", headers=headers['admin']).status_code == 200
        assert ws.receive_json()['event'] == 'SESSION_CLOSED'
    assert not clients
