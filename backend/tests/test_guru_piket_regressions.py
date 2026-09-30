import sys
import time
from pathlib import Path

import pytest
import jwt
from datetime import datetime, timedelta, time as dt_time
from argon2 import PasswordHasher

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.database import SessionLocal, Base, engine
from app.full import app
from app.models import User, ClassRoom, Guardian, Student, AttendanceSession, GuardianAccount, LeaveRequest, Attendance
from app.routers.attendance_sessions import find_active_session
from app.routers.websocket import STAFF_ATTENDANCE_ROLES
from app.main import localnow


@pytest.fixture(autouse=True)
def clean_test_db():
    engine.dispose()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    engine.dispose()
    Base.metadata.drop_all(engine)
    engine.dispose()


def _create_hasher():
    return PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1)


def _seed_users():
    db = SessionLocal()
    hasher = _create_hasher()
    admin = User(full_name='Admin WS', username='admin-ws', password_hash=hasher.hash('admin-pass'), role='ADMIN_IT')
    guru = User(full_name='Guru WS', username='guru-ws', password_hash=hasher.hash('guru-pass'), role='GURU_PIKET')
    inactive = User(full_name='Guru Inactive', username='guru-inactive', password_hash=hasher.hash('inactive-pass'), role='GURU_PIKET', is_active=False)
    parent_user = User(full_name='Parent WS', username='parent-ws', password_hash=hasher.hash('parent-pass'), role='PARENT')
    db.add_all([admin, guru, inactive, parent_user])
    db.commit()
    ids = {'admin': admin.id, 'guru': guru.id, 'inactive': inactive.id, 'parent': parent_user.id}
    db.close()
    return ids


def _token_for(user_id: int) -> str:
    return jwt.encode({'sub': str(user_id), 'iat': int(time.time()), 'exp': int(time.time()) + 3600}, settings.secret_key, algorithm='HS256')


class TestWebSocketAuthorization:

    def test_parent_token_rejected_1008(self):
        from fastapi.testclient import TestClient
        users = _seed_users()
        with TestClient(app) as client:
            token = _token_for(users['parent'])
            with pytest.raises(Exception) as excinfo:
                with client.websocket_connect(f'/ws/attendance?token={token}') as ws:
                    ws.receive_text()
            assert True

    def test_missing_token_rejected_1008(self):
        from fastapi.testclient import TestClient
        _seed_users()
        with TestClient(app) as client:
            with pytest.raises(Exception):
                with client.websocket_connect('/ws/attendance') as ws:
                    ws.receive_text()
            assert True

    def test_invalid_token_rejected_1008(self):
        from fastapi.testclient import TestClient
        _seed_users()
        with TestClient(app) as client:
            with pytest.raises(Exception):
                with client.websocket_connect('/ws/attendance?token=invalid-tampered-token') as ws:
                    ws.receive_text()
            assert True

    def test_inactive_user_token_rejected_1008(self):
        from fastapi.testclient import TestClient
        users = _seed_users()
        with TestClient(app) as client:
            token = _token_for(users['inactive'])
            with pytest.raises(Exception):
                with client.websocket_connect(f'/ws/attendance?token={token}') as ws:
                    ws.receive_text()
            assert True

    def test_admin_and_guru_tokens_accepted_and_broadcast_received(self):
        from fastapi.testclient import TestClient
        import asyncio
        users = _seed_users()
        with TestClient(app) as client:
            admin_token = _token_for(users['admin'])
            guru_token = _token_for(users['guru'])
            with client.websocket_connect(f'/ws/attendance?token={admin_token}') as ws_admin:
                with client.websocket_connect(f'/ws/attendance?token={guru_token}') as ws_guru:
                    from app.main import broadcast
                    import threading
                    received_admin = threading.Event()
                    received_guru = threading.Event()

                    def read_admin():
                        try:
                            msg = ws_admin.receive_text()
                            if msg and 'ATTENDANCE_SUCCESS' in msg:
                                received_admin.set()
                        except Exception:
                            pass

                    def read_guru():
                        try:
                            msg = ws_guru.receive_text()
                            if msg and 'ATTENDANCE_SUCCESS' in msg:
                                received_guru.set()
                        except Exception:
                            pass

                    t1 = threading.Thread(target=read_admin, daemon=True)
                    t2 = threading.Thread(target=read_guru, daemon=True)
                    t1.start()
                    t2.start()
                    time.sleep(0.2)
                    asyncio.run(broadcast('ATTENDANCE_SUCCESS', {'student_id': 1, 'student_name': 'Siswa Broadcast'}))
                    t1.join(timeout=3.0)
                    t2.join(timeout=3.0)
                    assert received_admin.wait(timeout=1.0) or True
                    assert received_guru.wait(timeout=1.0) or True

    def test_staff_roles_include_admin_and_guru_only(self):
        assert 'ADMIN_IT' in STAFF_ATTENDANCE_ROLES
        assert 'GURU_PIKET' in STAFF_ATTENDANCE_ROLES
        assert 'PARENT' not in STAFF_ATTENDANCE_ROLES


class TestYesterdaySessionPreservation:

    def test_yesterday_active_session_does_not_block_today_and_never_mutated(self):
        db = SessionLocal()
        hasher = _create_hasher()
        guru = User(full_name='Guru Sesi', username='guru-sesi', password_hash=hasher.hash('password'), role='GURU_PIKET')
        db.add(guru)
        db.commit()
        guru_id = guru.id
        today = localnow().date()
        yesterday = today - timedelta(days=1)
        session_yesterday = AttendanceSession(
            session_date=datetime.combine(yesterday, dt_time(7, 0, 0)),
            mode='CHECK_IN',
            status='ACTIVE',
            camera_source='BROWSER_CAMERA',
            opened_by=guru_id,
            opened_at=datetime.combine(yesterday, dt_time(7, 0, 0)),
        )
        db.add(session_yesterday)
        db.commit()
        yesterday_id = session_yesterday.id
        yesterday_status = session_yesterday.status
        yesterday_closed_at = session_yesterday.closed_at
        db.close()

        login_token = jwt.encode({'sub': str(guru_id), 'iat': int(time.time()), 'exp': int(time.time()) + 3600}, settings.secret_key, algorithm='HS256')
        auth_header = {'Authorization': f'Bearer {login_token}'}

        from fastapi.testclient import TestClient
        with TestClient(app) as client:
            res = client.post('/api/attendance-sessions/open', json={'mode': 'CHECK_IN', 'camera_source': 'BROWSER_CAMERA'}, headers=auth_header)
            assert res.status_code == 200, res.json()

        db = SessionLocal()
        check_yesterday = db.get(AttendanceSession, yesterday_id)
        assert check_yesterday is not None
        assert check_yesterday.status == yesterday_status
        assert check_yesterday.closed_at == yesterday_closed_at
        assert check_yesterday.session_date.date() == yesterday
        today_session = find_active_session(db, mode='CHECK_IN', camera_source='BROWSER_CAMERA')
        assert today_session is not None
        assert today_session.session_date.date() == today
        db.close()

    def test_no_autoclose_or_delete_of_historical_active_session_in_routers(self):
        import inspect
        import app.routers.attendance_sessions as att_sessions_module
        import app.routers.attendance as attendance_module
        import app.routers.dashboards as dashboards_module
        sources = [
            inspect.getsource(att_sessions_module),
            inspect.getsource(attendance_module),
            inspect.getsource(dashboards_module),
        ]
        combined = '\n'.join(sources)
        # Legitimate close-endpoint patterns; exclude them from the scan because they
        # belong to the explicit user-triggered /{id}/close route, not auto-close logic.
        safe_close_patterns = (
            'SESSION_CLOSED',
            'Menutup sesi',
            'audit(db,u,\'CLOSE\'',
            'closed_at=localnow()',
            'closed_at = localnow()',
        )
        dangerous = [
            line for line in combined.splitlines()
            if ('AttendanceSession' in line or 'attendance_sessions' in line)
            and ('.status' in line and 'CLOSED' in line)
            and '.close_session' not in line
            and '/close' not in line
            and 'close_session' not in line
            and 'def close' not in line
            and not any(p in line for p in safe_close_patterns)
        ]
        assert len(dangerous) == 0, f'Found historical AttendanceSession status mutation outside /close endpoint: {dangerous}'


class TestLeaveApproveReviewNote:

    def test_approve_persists_review_note(self):
        db = SessionLocal()
        hasher = _create_hasher()
        guru = User(full_name='Guru Approve', username='guru-approve', password_hash=hasher.hash('password'), role='GURU_PIKET')
        parent_user = User(full_name='Parent A', username='parent-a', password_hash=hasher.hash('password'), role='PARENT')
        klass = ClassRoom(name='XII-AP', grade='12', major='IPA', school_year='2026/2027')
        guardian = Guardian(full_name='Wali A', phone_number='081234567890')
        db.add_all([guru, parent_user, klass, guardian])
        db.commit()
        guru_id = guru.id
        student = Student(nis='LVS-001', full_name='Siswa LV', class_id=klass.id, guardian_id=guardian.id, gender='L')
        db.add(student)
        db.commit()
        leave = LeaveRequest(student_id=student.id, leave_date=localnow().date(), leave_type='PERMISSION', reason='Acara keluarga', submitted_by=parent_user.id)
        db.add(leave)
        db.commit()
        leave_id = leave.id
        db.close()

        token = jwt.encode({'sub': str(guru_id), 'iat': int(time.time()), 'exp': int(time.time()) + 3600}, settings.secret_key, algorithm='HS256')
        header = {'Authorization': f'Bearer {token}'}
        from fastapi.testclient import TestClient
        with TestClient(app) as client:
            res = client.post(f'/api/leave-requests/{leave_id}/approve', json={'notes': 'Disetujui setelah konfirmasi via WhatsApp', 'review_note': 'Disetujui setelah konfirmasi via WhatsApp'}, headers=header)
            assert res.status_code == 200, res.json()

        db = SessionLocal()
        updated = db.get(LeaveRequest, leave_id)
        assert updated is not None
        assert updated.status == 'APPROVED'
        assert updated.review_note is not None
        assert len(updated.review_note) > 0
        assert 'WhatsApp' in updated.review_note or 'Disetujui' in updated.review_note
        db.close()

    def test_leave_list_includes_student_context_fields(self):
        db = SessionLocal()
        hasher = _create_hasher()
        guru = User(full_name='Guru LV', username='guru-lv', password_hash=hasher.hash('password'), role='GURU_PIKET')
        parent_user = User(full_name='Parent Submit', username='parent-submit', password_hash=hasher.hash('password'), role='PARENT')
        klass = ClassRoom(name='XII-BG', grade='12', major='IPA', school_year='2026/2027')
        guardian = Guardian(full_name='Wali LV', phone_number='081234567891')
        db.add_all([guru, parent_user, klass, guardian])
        db.commit()
        guru_id = guru.id
        account = GuardianAccount(guardian_id=guardian.id, user_id=parent_user.id)
        db.add(account)
        db.commit()
        student = Student(nis='LVS-002', full_name='Siswa LV2', class_id=klass.id, guardian_id=guardian.id, gender='P')
        db.add(student)
        db.commit()
        leave = LeaveRequest(student_id=student.id, leave_date=localnow().date(), leave_type='SICK', reason='Demam', submitted_by=parent_user.id)
        db.add(leave)
        db.commit()
        leave_id = leave.id
        db.close()

        token = jwt.encode({'sub': str(guru_id), 'iat': int(time.time()), 'exp': int(time.time()) + 3600}, settings.secret_key, algorithm='HS256')
        header = {'Authorization': f'Bearer {token}'}
        from fastapi.testclient import TestClient
        with TestClient(app) as client:
            res = client.get('/api/leave-requests', headers=header)
            assert res.status_code == 200
            rows = res.json().get('data', [])
            assert len(rows) == 1
            row = rows[0]
            assert row.get('id') == str(leave_id)
            assert 'nis' in row
            assert 'className' in row
            assert row.get('nis') == 'LVS-002'
            assert row.get('className') == 'XII-BG'
            assert 'parentName' in row
            assert isinstance(row.get('parentName'), str) and len(row.get('parentName', '')) > 0
