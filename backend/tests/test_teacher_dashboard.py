from datetime import date, timedelta

from app.database import SessionLocal
from app.models import Attendance, Student


def test_teacher_dashboard_uses_requested_attendance_date_and_disjoint_statuses(
    client, headers, classroom, student
):
    selected_date = date(2026, 9, 16)
    db = SessionLocal()
    additional_students = [
        Student(nis=f'DASH-{index}', full_name=f'Dashboard Student {index}', class_id=classroom)
        for index in range(1, 4)
    ]
    db.add_all(additional_students)
    db.flush()
    db.add_all([
        Attendance(student_id=student, attendance_date=selected_date, status='PRESENT'),
        Attendance(student_id=additional_students[0].id, attendance_date=selected_date, status='LATE'),
        Attendance(student_id=additional_students[1].id, attendance_date=selected_date, status='SICK'),
        Attendance(student_id=additional_students[2].id, attendance_date=selected_date - timedelta(days=1), status='PRESENT'),
    ])
    db.commit()
    db.close()

    response = client.get(
        '/api/dashboard/teacher',
        headers=headers['guru'],
        params={'attendance_date': selected_date.isoformat()},
    )
    assert response.status_code == 200
    data = response.json()['data']
    assert data['presentToday'] == 1
    assert data['lateToday'] == 1
    assert data['excusedToday'] == 1
    assert data['notPresent'] == 1
    assert {row['date'] for row in data['recentAttendance']} == {selected_date.isoformat()}


def test_teacher_dashboard_returns_zero_counts_for_empty_date(client, headers, student):
    response = client.get(
        '/api/dashboard/teacher',
        headers=headers['guru'],
        params={'attendance_date': '2026-09-16'},
    )
    assert response.status_code == 200
    data = response.json()['data']
    assert data['presentToday'] == 0
    assert data['lateToday'] == 0
    assert data['excusedToday'] == 0
    assert data['notPresent'] == 1
    assert data['recentAttendance'] == []


def test_teacher_dashboard_rejects_invalid_attendance_date(client, headers):
    response = client.get(
        '/api/dashboard/teacher',
        headers=headers['guru'],
        params={'attendance_date': 'not-a-date'},
    )
    assert response.status_code == 422
