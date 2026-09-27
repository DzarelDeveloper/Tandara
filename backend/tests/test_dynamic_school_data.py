from datetime import date

from app.database import SessionLocal
from app.models import Attendance, ClassRoom, Major, Student


def test_dynamic_classes_majors_authorization_and_relation_safety(client, headers):
    major_payload = {'name': 'Teknik Komputer dan Jaringan', 'is_active': True}
    assert client.post('/api/majors', headers=headers['guru'], json=major_payload).status_code == 403
    created_major = client.post('/api/majors', headers=headers['admin'], json=major_payload)
    assert created_major.status_code == 200
    major_id = created_major.json()['data']['id']
    assert client.post('/api/majors', headers=headers['admin'], json=major_payload).json()['code'] == 'MAJOR_EXISTS'

    cases = [
        {'name': '6A', 'grade': '6', 'major_id': None, 'school_year': '2026/2027', 'is_active': True},
        {'name': 'IX E', 'grade': 'IX', 'major_id': None, 'school_year': '2026/2027', 'is_active': True},
        {'name': 'XI TKJ 3', 'grade': 'XI', 'major_id': int(major_id), 'school_year': '2026/2027', 'is_active': True},
        {'name': 'Robotik A', 'grade': 'Robotik', 'major_id': None, 'school_year': '', 'is_active': True},
    ]
    assert client.post('/api/classes', headers=headers['guru'], json=cases[0]).status_code == 403
    created_classes = [client.post('/api/classes', headers=headers['admin'], json=payload) for payload in cases]
    assert all(response.status_code == 200 for response in created_classes)
    assert created_classes[0].json()['data']['major'] == ''
    assert created_classes[1].json()['data']['major'] == ''
    assert created_classes[2].json()['data']['major'] == major_payload['name']
    assert client.post('/api/classes', headers=headers['admin'], json=cases[0]).json()['code'] == 'CLASS_EXISTS'

    custom_major = client.post('/api/majors', headers=headers['admin'], json={'name': 'Game Development', 'is_active': True})
    custom_major_id = custom_major.json()['data']['id']
    custom_class = client.post('/api/classes', headers=headers['admin'], json={'name': 'GameDev A', 'major_id': int(custom_major_id), 'is_active': True})
    assert custom_class.status_code == 200 and custom_class.json()['data']['major'] == 'Game Development'

    class_id = created_classes[2].json()['data']['id']
    updated = client.patch(f'/api/classes/{class_id}', headers=headers['admin'], json={**cases[2], 'name': 'XI Network 3'})
    assert updated.status_code == 200 and updated.json()['data']['name'] == 'XI Network 3'
    assert client.patch(f'/api/classes/{class_id}', headers=headers['guru'], json=cases[2]).status_code == 403

    renamed_major = client.patch(f'/api/majors/{major_id}', headers=headers['admin'], json={'name': 'Jaringan Komputer', 'is_active': True})
    assert renamed_major.status_code == 200
    assert client.patch(f'/api/majors/{major_id}', headers=headers['guru'], json=major_payload).status_code == 403
    class_rows = client.get('/api/classes', headers=headers['admin']).json()['data']
    assert next(row for row in class_rows if row['id'] == class_id)['major'] == 'Jaringan Komputer'

    student_response = client.post('/api/students', headers=headers['admin'], json={'nis': 'DYNAMIC-001', 'full_name': 'Dynamic Student', 'class_id': int(class_id), 'guardian_id': None, 'gender': 'L'})
    assert student_response.status_code == 200
    student_id = int(student_response.json()['data']['id'])
    db = SessionLocal(); db.add(Attendance(student_id=student_id, attendance_date=date.today(), status='PRESENT')); db.commit(); db.close()

    deleted_class = client.delete(f'/api/classes/{class_id}', headers=headers['admin'])
    assert deleted_class.json()['data']['action'] == 'DEACTIVATE'
    db = SessionLocal()
    assert not db.get(ClassRoom, int(class_id)).is_active
    assert db.query(Attendance).filter_by(student_id=student_id).count() == 1
    db.close()
    assert client.post('/api/students', headers=headers['admin'], json={'nis': 'INACTIVE-CLASS', 'full_name': 'Rejected Student', 'class_id': int(class_id)}).json()['code'] == 'CLASS_NOT_FOUND'
    assert client.delete(f'/api/classes/{class_id}', headers=headers['guru']).status_code == 403

    deleted_major = client.delete(f'/api/majors/{major_id}', headers=headers['admin'])
    assert deleted_major.json()['data']['action'] == 'DEACTIVATE'
    db = SessionLocal(); assert not db.get(Major, int(major_id)).is_active; db.close()
    assert client.delete(f'/api/majors/{major_id}', headers=headers['guru']).status_code == 403

    unused_class_id = custom_class.json()['data']['id']
    assert client.delete(f'/api/classes/{unused_class_id}', headers=headers['admin']).json()['data']['action'] == 'DELETE'
    unused_major_delete = client.delete(f'/api/majors/{custom_major_id}', headers=headers['admin'])
    assert unused_major_delete.json()['data']['action'] == 'DELETE'


def test_student_mutations_are_admin_only_and_guardian_is_optional(client, headers, classroom):
    payload = {'nis': 'OPTIONAL-GUARDIAN', 'full_name': 'Tanpa Wali', 'class_id': classroom, 'guardian_id': None, 'gender': 'P'}
    assert client.post('/api/students', headers=headers['guru'], json=payload).status_code == 403
    created = client.post('/api/students', headers=headers['admin'], json=payload)
    assert created.status_code == 200 and created.json()['data']['parentName'] == ''
    student_id = created.json()['data']['id']
    assert client.patch(f'/api/students/{student_id}', headers=headers['guru'], json=payload).status_code == 403
    assert client.delete(f'/api/students/{student_id}', headers=headers['guru']).status_code == 403
