from fastapi.testclient import TestClient
from argon2 import PasswordHasher
from app.full import app
from app.database import SessionLocal
from app.models import User, ClassRoom, Student


def test_admin_can_open_session_and_record_manual_attendance(attendance_clock):
    db = SessionLocal()
    admin = User(full_name='Admin Test', username='admin-test', password_hash=PasswordHasher().hash('password-aman'), role='ADMIN_IT')
    classroom = ClassRoom(name='X-A', grade='10', major='Umum', school_year='2026')
    db.add_all([admin, classroom]); db.flush()
    student = Student(nis='TEST-001', full_name='Siswa Test', class_id=classroom.id, gender='L')
    db.add(student); db.flush(); student_id = student.id; db.commit(); db.close()

    with TestClient(app) as client:
        login = client.post('/api/auth/login', json={'username': 'admin-test', 'password': 'password-aman'})
        assert login.status_code == 200
        headers = {'Authorization': f"Bearer {login.json()['data']['access_token']}"}
        opened = client.post('/api/attendance-sessions/open', headers=headers, json={'mode': 'CHECK_IN', 'camera_source': 'test-camera'})
        assert opened.status_code == 200
        recorded = client.post('/api/attendance/manual', headers=headers, json={'student_id': student_id, 'mode': 'CHECK_IN', 'reason': 'Kamera sedang perawatan'})
        assert recorded.status_code == 200
        assert recorded.json()['data']['status'] == 'PRESENT'
        duplicate = client.post('/api/attendance/manual', headers=headers, json={'student_id': student_id, 'mode': 'CHECK_IN', 'reason': 'Pencatatan ulang'})
        assert duplicate.status_code == 409
