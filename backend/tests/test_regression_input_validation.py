from datetime import date
from types import SimpleNamespace
import pytest
from app.main import attendance_out, pwd
from app.database import SessionLocal
from app.models import Attendance, Guardian, GuardianAccount, GuardianStudent, Student, User


def test_attendance_out_handles_missing_student_relationship():
    attendance = SimpleNamespace(
        id=1, attendance_date=date(2026, 10, 14), student_id=999,
        student=None, check_in_time=None, check_out_time=None,
        status='PRESENT', notes=None,
    )
    out = attendance_out(attendance)
    assert out['studentName'] is None
    assert out['nis'] is None
    assert out['className'] is None
    assert out['studentId'] == '999'
    assert out['status'] == 'PRESENT'


def test_attendance_out_handles_student_without_classroom():
    student = SimpleNamespace(full_name='Siswa Test', nis='NIS-001', classroom=None)
    attendance = SimpleNamespace(
        id=2, attendance_date=date(2026, 10, 14), student_id=1,
        student=student, check_in_time=None, check_out_time=None,
        status='PRESENT', notes=None,
    )
    out = attendance_out(attendance)
    assert out['studentName'] == 'Siswa Test'
    assert out['nis'] == 'NIS-001'
    assert out['className'] is None


def test_attendance_out_normal_row(client, student, classroom):
    from datetime import datetime
    db = SessionLocal()
    attendance = Attendance(
        student_id=student, attendance_date=date.today(),
        check_in_time=datetime.now(), status='PRESENT',
    )
    db.add(attendance); db.commit(); db.refresh(attendance)
    out = attendance_out(attendance)
    assert out['studentName'] == 'Siswa Test'
    assert out['nis'] == 'TEST-001'
    assert out['className'] == 'XII-Test'
    db.close()


@pytest.mark.parametrize('invalid_type', ['Sakit', 'PERMISSIONX', 'sick', 'CUTI', ''])
def test_leave_type_invalid_rejected(client, headers, student, invalid_type):
    response = client.post('/api/leave-requests', headers=headers['admin'], json={
        'student_id': student, 'leave_date': date.today().isoformat(),
        'leave_type': invalid_type, 'reason': 'Alasan izin yang valid',
    })
    assert response.status_code == 422


def test_leave_type_valid_accepted(client, headers, student):
    for valid_type in ('SICK', 'PERMISSION', 'DISPENSATION'):
        response = client.post('/api/leave-requests', headers=headers['admin'], json={
            'student_id': student, 'leave_date': date.today().isoformat(),
            'leave_type': valid_type, 'reason': 'Alasan yang valid minimal tiga karakter',
        })
        assert response.status_code == 200


@pytest.mark.parametrize('invalid_gender', ['M', 'F', 'male', 'X', 'LP'])
def test_student_gender_invalid_rejected(client, headers, classroom, invalid_gender):
    response = client.post('/api/students', headers=headers['admin'], json={
        'nis': f'GENDER-{invalid_gender}', 'full_name': 'Siswa Gender',
        'class_id': classroom, 'gender': invalid_gender,
    })
    assert response.status_code == 422


@pytest.mark.parametrize('valid_gender', ['L', 'P', None])
def test_student_gender_valid_accepted(client, headers, classroom, valid_gender):
    payload = {'nis': f'GENDER-OK-{valid_gender or "NONE"}', 'full_name': 'Siswa Gender Valid', 'class_id': classroom}
    if valid_gender is not None:
        payload['gender'] = valid_gender
    response = client.post('/api/students', headers=headers['admin'], json=payload)
    assert response.status_code == 200


def test_parent_leave_type_invalid_rejected(client, headers, classroom, student):
    db = SessionLocal()
    guardian = Guardian(full_name='Wali Test', phone_number='081234567890')
    db.add(guardian); db.flush()
    parent_user = User(full_name='Parent Test', username='parent-leave-test', password_hash=pwd.hash('Parent123!'), role='PARENT')
    db.add(parent_user); db.flush()
    db.add(GuardianAccount(guardian_id=guardian.id, user_id=parent_user.id))
    db.add(GuardianStudent(guardian_id=guardian.id, student_id=student))
    db.commit()
    db.close()

    login = client.post('/api/auth/login', json={'username': 'parent-leave-test', 'password': 'Parent123!'})
    parent_headers = {'Authorization': f"Bearer {login.json()['data']['access_token']}"}

    response = client.post('/api/parent/leave-requests', headers=parent_headers, json={
        'student_id': student, 'leave_date': date.today().isoformat(),
        'leave_type': 'INVALID_TYPE', 'reason': 'Alasan yang valid',
    })
    assert response.status_code == 422

    valid = client.post('/api/parent/leave-requests', headers=parent_headers, json={
        'student_id': student, 'leave_date': date.today().isoformat(),
        'leave_type': 'SICK', 'reason': 'Alasan yang valid',
    })
    assert valid.status_code == 201


def _parent_headers(client, student):
    db = SessionLocal()
    guardian = Guardian(full_name='Wali Parent', phone_number='081234567801')
    db.add(guardian); db.flush()
    parent_user = User(full_name='Parent Sec', username='parent-sec-test', password_hash=pwd.hash('Parent123!'), role='PARENT')
    db.add(parent_user); db.flush()
    db.add(GuardianAccount(guardian_id=guardian.id, user_id=parent_user.id))
    db.add(GuardianStudent(guardian_id=guardian.id, student_id=student))
    db.commit(); db.close()
    login = client.post('/api/auth/login', json={'username': 'parent-sec-test', 'password': 'Parent123!'})
    return {'Authorization': f"Bearer {login.json()['data']['access_token']}"}


@pytest.mark.parametrize('method,path', [
    ('get', '/api/attendance/summary'),
    ('get', '/api/attendance/settings'),
    ('get', '/api/attendance-sessions/active'),
    ('get', '/api/attendance'),
    ('get', '/api/dashboard/teacher'),
    ('get', '/api/dashboard/admin'),
])
def test_parent_cannot_access_staff_endpoints(client, headers, student, method, path):
    parent_headers = _parent_headers(client, student)
    response = getattr(client, method)(path, headers=parent_headers)
    assert response.status_code == 403


def test_parent_can_access_own_portal(client, student):
    parent_headers = _parent_headers(client, student)
    profile = client.get('/api/parent/profile', headers=parent_headers)
    assert profile.status_code == 200
    students = client.get('/api/parent/students', headers=parent_headers)
    assert students.status_code == 200
    assert len(students.json()['data']) == 1
