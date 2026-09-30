from datetime import date

from argon2 import PasswordHasher
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Guardian, GuardianAccount, GuardianStudent, Notification, Student, User


PASSWORD = 'ParentTest123!'


def create_parent(db, classroom_id, name, username, phone, student_ids):
    hasher = PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1)
    guardian = Guardian(full_name=name, phone_number=phone)
    user = User(full_name=name, username=username, password_hash=hasher.hash(PASSWORD), role='PARENT')
    db.add_all([guardian, user]); db.flush()
    db.add(GuardianAccount(guardian_id=guardian.id, user_id=user.id))
    for student_id in student_ids:
        db.add(GuardianStudent(guardian_id=guardian.id, student_id=student_id, relationship='Wali'))
    db.commit()
    return user.id


def create_parent_fixture_data(classroom):
    db = SessionLocal()
    first = Student(nis='PARENT-001', full_name='Anak Terhubung', class_id=classroom, gender='L')
    second = Student(nis='PARENT-002', full_name='Anak Lain', class_id=classroom, gender='P')
    db.add_all([first, second]); db.flush()
    parent_a = create_parent(db, classroom, 'Parent A', 'parent-a.test', '081234567891', [first.id])
    parent_b = create_parent(db, classroom, 'Parent B', 'parent-b.test', '081234567892', [first.id])
    unrelated = create_parent(db, classroom, 'Parent C', 'parent-c.test', '081234567893', [second.id])
    ids = {'student': first.id, 'other_student': second.id, 'parent_a': parent_a, 'parent_b': parent_b, 'unrelated': unrelated}
    db.close()
    return ids


def login_parent(client, username):
    response = client.post('/api/auth/login', json={'username': username, 'password': PASSWORD})
    assert response.status_code == 200
    return {'Authorization': f"Bearer {response.json()['data']['access_token']}"}


def test_parent_dashboard_attendance_and_student_idor(client, headers, classroom, attendance_clock):
    ids = create_parent_fixture_data(classroom)
    parent_headers = login_parent(client, 'parent-a.test')

    dashboard = client.get('/api/parent/dashboard', headers=parent_headers)
    assert dashboard.status_code == 200
    assert [row['student']['id'] for row in dashboard.json()['data']['students']] == [ids['student']]
    assert dashboard.json()['data']['students'][0]['today']['status'] is None

    detail = client.get(f"/api/parent/students/{ids['student']}", headers=parent_headers)
    assert detail.status_code == 200
    denied = client.get(f"/api/parent/students/{ids['other_student']}", headers=parent_headers)
    assert denied.status_code == 404

    checkin = client.post('/api/attendance/manual', headers=headers['admin'], json={
        'student_id': ids['student'], 'mode': 'CHECK_IN', 'reason': 'parent foundation test',
    })
    assert checkin.status_code == 200
    today = client.get(f"/api/parent/students/{ids['student']}/attendance/today", headers=parent_headers)
    assert today.status_code == 200 and today.json()['data']['status'] == 'PRESENT'
    history = client.get(f"/api/parent/students/{ids['student']}/attendance", headers=parent_headers)
    assert history.status_code == 200 and history.json()['data']['total'] == 1
    invalid_range = client.get(
        f"/api/parent/students/{ids['student']}/attendance",
        headers=parent_headers,
        params={'date_from': '2026-09-28', 'date_to': '2026-09-27'},
    )
    assert invalid_range.status_code == 422 and invalid_range.json()['code'] == 'INVALID_DATE_RANGE'


def test_attendance_notifications_are_persisted_per_parent_and_read_state(client, headers, classroom, attendance_clock):
    ids = create_parent_fixture_data(classroom)
    parent_a_headers = login_parent(client, 'parent-a.test')
    parent_b_headers = login_parent(client, 'parent-b.test')
    unrelated_headers = login_parent(client, 'parent-c.test')

    checkin = client.post('/api/attendance/manual', headers=headers['admin'], json={
        'student_id': ids['student'], 'mode': 'CHECK_IN', 'reason': 'notification test',
    })
    assert checkin.status_code == 200
    attendance_clock('15:30:00')
    checkout = client.post('/api/attendance/manual', headers=headers['admin'], json={
        'student_id': ids['student'], 'mode': 'CHECK_OUT', 'reason': 'notification test',
    })
    assert checkout.status_code == 200
    duplicate = client.post('/api/attendance/manual', headers=headers['admin'], json={
        'student_id': ids['student'], 'mode': 'CHECK_OUT', 'reason': 'duplicate notification test',
    })
    assert duplicate.status_code == 409

    db = SessionLocal()
    rows = db.scalars(select(Notification).order_by(Notification.id)).all()
    assert len(rows) == 4
    assert {row.recipient_user_id for row in rows} == {ids['parent_a'], ids['parent_b']}
    assert {row.type for row in rows} == {'ATTENDANCE_CHECK_IN', 'ATTENDANCE_CHECK_OUT'}
    db.close()

    listing = client.get('/api/parent/notifications', headers=parent_a_headers)
    assert listing.status_code == 200 and listing.json()['data']['total'] == 2
    assert client.get('/api/parent/notifications/unread-count', headers=parent_a_headers).json()['data']['count'] == 2
    notification_id = listing.json()['data']['items'][0]['id']
    assert client.patch(f'/api/parent/notifications/{notification_id}/read', headers=parent_b_headers).status_code == 404
    read = client.patch(f'/api/parent/notifications/{notification_id}/read', headers=parent_a_headers)
    assert read.status_code == 200 and read.json()['data']['is_read'] is True
    assert client.patch(f'/api/parent/notifications/{notification_id}/read', headers=parent_a_headers).status_code == 200
    assert client.get('/api/parent/notifications/unread-count', headers=parent_a_headers).json()['data']['count'] == 1
    assert client.patch('/api/parent/notifications/read-all', headers=parent_a_headers).json()['data']['updated'] == 1
    assert client.patch('/api/parent/notifications/read-all', headers=parent_a_headers).json()['data']['updated'] == 0
    assert client.get('/api/parent/notifications', headers=unrelated_headers).json()['data']['total'] == 0


def test_parent_leave_decision_notifies_submitter_only(client, headers, classroom):
    ids = create_parent_fixture_data(classroom)
    parent_a_headers = login_parent(client, 'parent-a.test')
    parent_b_headers = login_parent(client, 'parent-b.test')
    request = client.post('/api/parent/leave-requests', headers=parent_a_headers, json={
        'student_id': ids['student'], 'leave_date': date.today().isoformat(),
        'leave_type': 'SICK', 'reason': 'Demam',
    })
    assert request.status_code == 201
    leave_id = request.json()['data']['id']
    assert client.post(f'/api/leave-requests/{leave_id}/approve', headers=headers['admin']).status_code == 200
    parent_a_notifications = client.get('/api/parent/notifications', headers=parent_a_headers).json()['data']['items']
    parent_b_notifications = client.get('/api/parent/notifications', headers=parent_b_headers).json()['data']['items']
    assert [item['type'] for item in parent_a_notifications] == ['LEAVE_APPROVED']
    assert parent_b_notifications == []


def test_parent_websocket_routes_only_recipient_events(client, headers, classroom):
    ids = create_parent_fixture_data(classroom)
    parent_a_headers = login_parent(client, 'parent-a.test')
    parent_b_headers = login_parent(client, 'parent-b.test')
    token_a = parent_a_headers['Authorization'][7:]
    token_b = parent_b_headers['Authorization'][7:]

    with client.websocket_connect(f'/ws/parent?token={token_a}') as socket_a:
        with client.websocket_connect(f'/ws/parent?token={token_a}') as socket_a_second:
            with client.websocket_connect(f'/ws/parent?token={token_b}') as socket_b:
                response = client.post('/api/attendance/manual', headers=headers['admin'], json={
                    'student_id': ids['student'], 'mode': 'CHECK_IN', 'reason': 'websocket test',
                })
                assert response.status_code == 200
                events = [socket_a.receive_json(), socket_a_second.receive_json(), socket_b.receive_json()]
                assert all(event['type'] == 'STUDENT_CHECK_IN' for event in events)
                assert all(event['notification']['student']['id'] == ids['student'] for event in events)
                assert all('confidence_score' not in str(event) for event in events)


def test_parent_websocket_rejects_non_parent_and_invalid_token(client, headers):
    from starlette.websockets import WebSocketDisconnect

    for token in ('invalid', headers['admin']['Authorization'][7:]):
        try:
            with client.websocket_connect(f'/ws/parent?token={token}'):
                assert False
        except WebSocketDisconnect as exc:
            assert exc.code == 1008
