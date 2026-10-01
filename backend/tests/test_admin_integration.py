"""Admin workflow regressions. conftest confines every mutation to temporary SQLite."""
from datetime import timedelta
import csv
import io

import pytest
from sqlalchemy import select
from app.database import SessionLocal
from app.main import localnow
from app.models import Attendance, ClassRoom, GuardianStudent, Student, User


def data(response):
    assert response.status_code == 200, response.text
    return response.json()['data']


def test_admin_end_to_end_workflow(client, headers, attendance_clock):
    h = headers['admin']
    assert data(client.get('/api/dashboard/admin', headers=h))['activeStudents'] == 0
    classroom = data(client.post('/api/classes', headers=h, json={'name': 'AUDIT-TEMP', 'grade': '12'}))
    sid = data(client.post('/api/students', headers=h, json={
        'nis': 'AUDIT-TEMP-001', 'full_name': 'Audit Temporary Student', 'class_id': int(classroom['id']), 'gender': 'L',
    }))['id']
    guardian = data(client.post('/api/guardians', headers=h, json={
        'full_name': 'Audit Temporary Parent', 'phone_number': '081234567899',
        'password': 'Temporary123!', 'student_ids': [int(sid)], 'relationship': 'Ibu',
    }))
    assert guardian['studentIds'] == [sid]
    assert guardian['username']
    updated = data(client.patch(f'/api/students/{sid}', headers=h, json={
        'nis': 'AUDIT-TEMP-EDIT', 'full_name': 'Audit Student Edited', 'class_id': int(classroom['id']), 'gender': 'P',
    }))
    assert updated['parentName'] == guardian['fullName']  # omitted guardian must survive edit
    assert updated['guardianId'] == guardian['id']
    assert data(client.get(f'/api/students/{sid}', headers=h))['fullName'] == 'Audit Student Edited'
    assert data(client.get('/api/students?q=Edited', headers=h))[0]['id'] == sid
    assert data(client.get('/api/classes', headers=h))[0]['studentCount'] == 1
    metrics = data(client.get('/api/dashboard/admin', headers=h))
    assert (metrics['activeStudents'], metrics['activeClasses'], metrics['facesRegistered'], metrics['facesUnregistered']) == (1, 1, 0, 1)
    attendance_clock('06:45:00')
    recorded = data(client.post('/api/attendance/manual', headers=h, json={'student_id': int(sid), 'mode': 'CHECK_IN', 'reason': 'Audit verification'}))
    assert data(client.get('/api/dashboard/admin', headers=h))['presentToday'] == 1
    assert data(client.get('/api/attendance/summary', headers=h)) == {'today': 1, 'students': 1}
    schedule = data(client.get('/api/attendance/settings', headers=h))
    saved = data(client.put('/api/attendance/settings', headers=h, json={'checkInDeadline': '06:30', 'checkOutStart': '15:30'}))
    assert saved['timezone'] == 'Asia/Jakarta'
    assert data(client.get('/api/attendance/settings', headers=h))['checkInDeadline'] == '06:30'
    assert data(client.get('/api/dashboard/admin', headers=h))['lateToday'] == 1
    assert client.put('/api/attendance/settings', headers=h, json={'checkInDeadline': '17:00', 'checkOutStart': '15:30'}).status_code == 422
    data(client.patch(f"/api/attendance/{recorded['id']}/correction", headers=h, json={'status': 'EXCUSED', 'notes': 'Audit approved permission'}))
    assert data(client.get('/api/attendance?status=EXCUSED', headers=h))[0]['id'] == recorded['id']
    csv_response = client.get('/api/reports/attendance.csv', headers=h, params={'class_id': classroom['id'], 'status': 'EXCUSED'})
    assert csv_response.status_code == 200 and 'text/csv' in csv_response.headers['content-type']
    assert 'attachment' in csv_response.headers['content-disposition']
    rows = list(csv.DictReader(io.StringIO(csv_response.text)))
    assert len(rows) == 1 and rows[0]['NIS'] == 'AUDIT-TEMP-EDIT'
    assert rows[0]['Status'] == 'EXCUSED'
    assert data(client.get('/api/health'))['database']['status'] == 'connected'
    assert data(client.get('/api/face-engine/status', headers=h))['status'] in {'READY', 'ERROR', 'NOT_CONFIGURED'}
    assert data(client.get('/api/attendance-sessions/active', headers=h)) is None
    enrollment = data(client.get(f'/api/students/{sid}/face-enrollment', headers=h))
    assert enrollment['status'] == 'NOT_REGISTERED'
    assert 'embedding' not in enrollment
    logs = data(client.get('/api/audit-logs', headers=h))
    assert any(row['action'] == 'CORRECT' and row['details'] == 'Audit approved permission' for row in logs)
    assert any(row['entity'] == 'Student' and row['action'] == 'UPDATE' for row in logs)
    assert next(row for row in logs if row['entity'] == 'Student' and row['action'] == 'UPDATE')['username'] == 'admin-test'
    assert not any('password_hash' in row or 'embedding' in row for row in logs)
    assert client.delete(f"/api/guardians/{guardian['id']}/students/{sid}", headers=h).status_code == 200
    assert next(row for row in data(client.get('/api/guardians', headers=h)) if row['id'] == guardian['id'])['students'] == []
    linked = data(client.post(f"/api/guardians/{guardian['id']}/students", headers=h, json=[int(sid)]))
    assert linked['studentIds'] == [sid]
    assert client.delete(f'/api/students/{sid}', headers=h).status_code == 200
    assert data(client.get('/api/students', headers=h)) == []
    with SessionLocal() as db:
        assert db.get(Student, int(sid)) is not None
        assert db.scalar(select(Attendance).where(Attendance.student_id == int(sid))) is not None
    assert data(client.delete(f"/api/classes/{classroom['id']}", headers=h))['action'] == 'DEACTIVATE'


def test_student_duplicate_update_and_nonblank_validation(client, headers, classroom, student):
    h = headers['admin']
    payload = {'nis': 'AUDIT-SECOND', 'full_name': 'Other Student', 'class_id': classroom}
    second = data(client.post('/api/students', headers=h, json=payload))
    response = client.patch(f"/api/students/{second['id']}", headers=h, json={**payload, 'nis': 'TEST-001'})
    assert response.status_code == 409 and response.json()['code'] == 'NIS_EXISTS'
    assert data(client.get(f"/api/students/{second['id']}", headers=h))['nis'] == payload['nis']
    for field in ('nis', 'full_name'):
        assert client.post('/api/students', headers=h, json={**payload, field: '   '}).status_code == 422
    for endpoint in ('classes', 'majors'):
        assert client.post(f'/api/{endpoint}', headers=h, json={'name': '   '}).status_code == 422


def test_student_pagination_and_filters(client, headers, classroom):
    with SessionLocal() as db:
        db.add_all([Student(nis=f'AUDIT-{i:04}', full_name=f'Paged Student {i}', class_id=classroom) for i in range(503)])
        db.commit()
    h = headers['admin']
    first = data(client.get('/api/students?page=1&page_size=500', headers=h))
    second = data(client.get('/api/students?page=2&page_size=500', headers=h))
    assert len(first) == 500 and len(second) == 3
    assert len({row['id'] for row in first + second}) == 503
    assert len(data(client.get('/api/students?q=AUDIT-0502', headers=h))) == 1
    assert data(client.get('/api/students?class_id=999999', headers=h)) == []
    assert client.get('/api/students?page=0', headers=h).status_code == 422


def test_import_links_immediately_and_rejects_short_rows(client, headers, classroom):
    h = headers['admin']
    template = client.get('/api/students/import-template.csv', headers=h)
    assert template.status_code == 200 and template.text.startswith('nis,nama,kelas')
    valid = template.text + 'AUDIT-CSV,Imported Student,XII-Test,IPA,Imported Guardian,081234567899\n'
    files = {'file': ('students.csv', valid, 'text/csv')}
    assert data(client.post('/api/students/import/preview', headers=h, files=files))['valid_rows'] == 1
    assert data(client.post('/api/students/import', headers=h, files=files))['importedCount'] == 1
    guardians = data(client.get('/api/guardians', headers=h))
    assert guardians[0]['students'][0]['nis'] == 'AUDIT-CSV'
    malformed = {'file': ('short.csv', template.text + 'AUDIT-SHORT,Short\n', 'text/csv')}
    preview = data(client.post('/api/students/import/preview', headers=h, files=malformed))
    assert preview['invalid_rows'] == 1
    assert client.post('/api/students/import', headers=h, files=malformed).status_code == 422
    assert client.post('/api/students/import/preview', headers=h, files={'file': ('bad.xlsx', b'fake', 'application/octet-stream')}).status_code == 415


def test_empty_guardian_link_returns_validation_error(client, headers, student, guardian):
    h = headers['admin']
    assert client.post(f'/api/guardians/{guardian}/students', headers=h, json=[student]).status_code == 200
    assert client.post(f'/api/guardians/{guardian}/students', headers=h, json=[]).status_code == 422


def test_user_status_revokes_access_and_audit_identifies_actor(client, headers):
    h = headers['admin']
    user = data(client.post('/api/users', headers=h, json={'full_name': 'Audit Staff', 'username': 'audit-staff', 'password': 'AuditPassword123!', 'role': 'GURU_PIKET'}))
    assert 'password_hash' not in user
    login = data(client.post('/api/auth/login', json={'username': 'audit-staff', 'password': 'AuditPassword123!'}))
    token = {'Authorization': 'Bearer ' + login['access_token']}
    assert client.patch(f"/api/users/{user['id']}/status?active=false", headers=h).status_code == 200
    assert client.get('/api/students', headers=token).status_code == 401
    assert client.post('/api/auth/login', json={'username': 'audit-staff', 'password': 'AuditPassword123!'}).status_code == 403
    logs = data(client.get('/api/audit-logs', headers=h))
    row = next(row for row in logs if row['entity'] == 'User' and row['action'] == 'STATUS_CHANGE')
    assert row['username'] == 'admin-test' and row['entityId'] == user['id']
    assert all('password_hash' not in row for row in data(client.get('/api/users', headers=h)))


def test_attendance_filters_and_staff_rbac(client, headers, student, classroom):
    today = localnow().date()
    with SessionLocal() as db:
        other_class = ClassRoom(name='Other Audit Class', grade='12', major='', school_year='2026/2027'); db.add(other_class); db.flush()
        other = Student(nis='AUDIT-OTHER', full_name='Other Audit Student', class_id=other_class.id); db.add(other); db.flush()
        db.add_all([Attendance(student_id=student, attendance_date=today, status='LATE'), Attendance(student_id=other.id, attendance_date=today-timedelta(days=1), status='PRESENT')])
        parent = User(username='audit-parent', full_name='Audit Parent', role='PARENT', password_hash='unused'); db.add(parent); db.commit(); parent_id = parent.id
    h = headers['admin']
    assert len(data(client.get('/api/attendance', headers=h))) == 2
    for params in ({'class_id': classroom}, {'student_id': student}, {'date_from': today.isoformat()}, {'status': 'LATE'}):
        rows = data(client.get('/api/attendance', headers=h, params=params))
        assert len(rows) == 1 and rows[0]['studentId'] == str(student)
        exported = client.get('/api/reports/attendance.csv', headers=h, params=params)
        assert len(list(csv.DictReader(io.StringIO(exported.text)))) == 1
    import jwt
    from app.config import settings
    parent_headers = {'Authorization': 'Bearer ' + jwt.encode({'sub': str(parent_id)}, settings.secret_key, algorithm='HS256')}
    for endpoint in ('/api/dashboard/admin', '/api/users', '/api/guardians', '/api/audit-logs', '/api/face-engine/status', '/api/attendance', '/api/reports/attendance.csv'):
        assert client.get(endpoint).status_code == 401
        assert client.get(endpoint, headers=parent_headers).status_code == 403
    assert client.get('/api/audit-logs', headers=headers['guru']).status_code == 403
    assert client.get(f'/api/students/{student}/face-enrollment', headers=headers['guru']).status_code == 403


def test_edit_student_in_inactive_class_preserves_existing_assignment(client, headers, student, classroom):
    h = headers['admin']
    assert data(client.delete(f'/api/classes/{classroom}', headers=h))['action'] == 'DEACTIVATE'
    updated = data(client.patch(f'/api/students/{student}', headers=h, json={
        'nis': 'TEST-001', 'full_name': 'Updated Existing Student', 'class_id': classroom,
    }))
    assert updated['classId'] == str(classroom)
    assert client.post('/api/students', headers=h, json={
        'nis': 'NEW-INACTIVE', 'full_name': 'New Student', 'class_id': classroom,
    }).status_code == 422


def test_student_create_cannot_bypass_parent_account_single_student_contract(client, headers, student, classroom):
    h = headers['admin']
    guardian = data(client.post('/api/guardians', headers=h, json={
        'full_name': 'Single Student Guardian', 'phone_number': '081234567899',
        'password': 'Temporary123!', 'student_ids': [student],
    }))
    response = client.post('/api/students', headers=h, json={
        'nis': 'AUDIT-BYPASS', 'full_name': 'Second Student', 'class_id': classroom, 'guardian_id': int(guardian['id']),
    })
    assert response.status_code == 422 and response.json()['code'] == 'MULTIPLE_STUDENTS_NOT_ALLOWED'
    assert len(data(client.get('/api/students', headers=h))) == 1


def test_class_edit_preserves_inactive_major_but_new_assignment_is_rejected(client, headers):
    h = headers['admin']
    major = data(client.post('/api/majors', headers=h, json={'name': 'Audit Major'}))
    payload = {'name': 'Audit Class', 'major_id': int(major['id'])}
    classroom = data(client.post('/api/classes', headers=h, json=payload))
    assert data(client.delete(f"/api/majors/{major['id']}", headers=h))['action'] == 'DEACTIVATE'
    assert data(client.patch(f"/api/classes/{classroom['id']}", headers=h, json={**payload, 'name': 'Audit Renamed'}))['majorId'] == major['id']
    assert client.post('/api/classes', headers=h, json={**payload, 'name': 'Audit New'}).status_code == 422
