import pytest
from app.database import SessionLocal
from app.models import Attendance, AttendanceSchedule


def manual(client, headers, student, mode='CHECK_IN'):
    return client.post('/api/attendance/manual', headers=headers['guru'], json={
        'student_id': student, 'mode': mode, 'reason': 'Schedule test',
    })


@pytest.mark.parametrize(('clock', 'expected'), [('06:59:59', 'PRESENT'), ('07:00:00', 'PRESENT'), ('07:00:01', 'LATE'), ('08:30:00', 'LATE')])
def test_default_deadline_records_and_lists_attendance(client, headers, student, attendance_clock, clock, expected):
    schedule = client.get('/api/attendance/settings', headers=headers['guru']).json()['data']
    assert schedule['checkInDeadline'] == '07:00'
    assert schedule['checkOutStart'] == '15:30'
    attendance_clock(clock)
    response = manual(client, headers, student)
    assert response.status_code == 200
    assert response.json()['data']['status'] == expected
    rows = client.get('/api/attendance?today=true', headers=headers['guru']).json()['data']
    assert len(rows) == 1 and rows[0]['id'] == response.json()['data']['id']
    assert manual(client, headers, student).status_code == 409


def test_checkout_boundary_preserves_late_status(client, headers, student, attendance_clock):
    attendance_clock('07:10:00')
    assert manual(client, headers, student).json()['data']['status'] == 'LATE'
    attendance_clock('15:29:59')
    early = manual(client, headers, student, 'CHECK_OUT')
    assert early.status_code == 422 and early.json()['code'] == 'CHECK_OUT_TOO_EARLY'
    with SessionLocal() as db:
        assert db.query(Attendance).one().check_out_time is None
    attendance_clock('15:30:00')
    checkout = manual(client, headers, student, 'CHECK_OUT')
    assert checkout.status_code == 200
    assert checkout.json()['data']['status'] == 'LATE'
    assert checkout.json()['data']['checkOutTime'].endswith('15:30:00')
    assert manual(client, headers, student, 'CHECK_OUT').status_code == 409


def test_saved_schedule_recalculates_today(client, headers, student, attendance_clock):
    payload = {'checkInDeadline': '09:00', 'checkOutStart': '12:00'}
    assert client.put('/api/attendance/settings', headers=headers['guru'], json=payload).status_code == 200
    with SessionLocal() as db:
        row = db.get(AttendanceSchedule, 1)
        assert row.check_in_deadline == '09:00' and row.check_out_start == '12:00'
    attendance_clock('08:00:00')
    assert manual(client, headers, student).json()['data']['status'] == 'PRESENT'
    payload['checkInDeadline'] = '07:00'
    assert client.put('/api/attendance/settings', headers=headers['admin'], json=payload).status_code == 200
    attendance_clock('12:00:00')
    assert manual(client, headers, student, 'CHECK_OUT').status_code == 200
    with SessionLocal() as db:
        assert db.query(Attendance).one().status == 'LATE'


@pytest.mark.parametrize('payload', [
    {'checkInDeadline': '25:00', 'checkOutStart': '15:30'},
    {'checkInDeadline': '07:00', 'checkOutStart': '15:99'},
    {'checkInDeadline': '07:00', 'checkOutStart': '06:00'},
    {'checkInDeadline': '07:00', 'checkOutStart': '07:00'},
])
def test_invalid_schedule_is_rejected(client, headers, payload):
    assert client.put('/api/attendance/settings', headers=headers['admin'], json=payload).status_code == 422
    assert client.get('/api/attendance/settings', headers=headers['admin']).json()['data']['checkInDeadline'] == '07:00'


def test_schedule_requires_authorized_role(client, headers, actors):
    from app.models import User
    with SessionLocal() as db:
        db.get(User, actors['guru_id']).role = 'VIEWER'
        db.commit()
    assert client.get('/api/attendance/settings').status_code == 401
    assert client.put('/api/attendance/settings', headers=headers['guru'], json={'checkInDeadline': '09:00', 'checkOutStart': '15:30'}).status_code == 403


def test_recalculation_preserves_previous_days_and_manual_corrections(client, headers, student, attendance_clock):
    from datetime import timedelta, datetime, time
    from app.main import localnow
    attendance_clock('08:00:00')
    response = manual(client, headers, student)
    attendance_id = response.json()['data']['id']
    assert client.patch(f'/api/attendance/{attendance_id}/correction', headers=headers['guru'], json={'status': 'PRESENT', 'notes': 'Approved exception'}).status_code == 200
    yesterday = localnow().date() - timedelta(days=1)
    with SessionLocal() as db:
        db.add(Attendance(student_id=student, attendance_date=yesterday, check_in_time=datetime.combine(yesterday, time(8)), status='PRESENT'))
        db.commit()
    saved = client.put('/api/attendance/settings', headers=headers['guru'], json={'checkInDeadline': '07:00', 'checkOutStart': '15:30'})
    assert saved.status_code == 200
    assert saved.json()['data']['updatedCount'] == 0
    with SessionLocal() as db:
        assert all(row.status == 'PRESENT' for row in db.query(Attendance).all())


def test_later_deadline_changes_today_late_back_to_present(client, headers, student, attendance_clock):
    attendance_clock('08:00:00')
    assert manual(client, headers, student).json()['data']['status'] == 'LATE'
    saved = client.put('/api/attendance/settings', headers=headers['guru'], json={'checkInDeadline': '09:00', 'checkOutStart': '15:30'})
    assert saved.json()['data']['updatedCount'] == 1
    with SessionLocal() as db:
        row = db.query(Attendance).one()
        assert row.status == 'PRESENT'
        assert row.check_in_time.hour == 8
