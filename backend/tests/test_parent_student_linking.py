from sqlalchemy import select

from app.database import SessionLocal
from app.main import pwd
from app.models import Guardian, GuardianAccount, GuardianStudent, Student, User


def create_student(db, classroom, nis, name):
    student = Student(nis=nis, full_name=name, class_id=classroom, gender='L')
    db.add(student); db.flush(); return student


def test_one_parent_one_student_auth_idor_and_admin_management(client, headers, classroom):
    db = SessionLocal()
    first = create_student(db, classroom, 'CHILD-001', 'Anak Pertama')
    second = create_student(db, classroom, 'CHILD-002', 'Anak Kedua')
    third = create_student(db, classroom, 'CHILD-003', 'Bukan Anak')
    db.commit(); first_id, second_id, third_id = first.id, second.id, third.id; db.close()
    initial_student_count = 3

    payload = {
        'full_name': 'Parent A', 'phone_number': '081234567801', 'relationship': 'Ayah',
        'username': 'parent-a', 'password': 'ParentA123!', 'student_ids': [first_id],
    }
    assert client.post('/api/guardians', headers=headers['guru'], json=payload).status_code == 403
    created = client.post('/api/guardians', headers=headers['admin'], json=payload)
    assert created.status_code == 200
    parent_id = int(created.json()['data']['id'])
    assert created.json()['data']['studentIds'] == [str(first_id)]
    generated_username = created.json()['data']['username']
    assert generated_username == 'parenta'

    db = SessionLocal()
    guardian = db.get(Guardian, parent_id)
    account = db.scalar(select(GuardianAccount).where(GuardianAccount.guardian_id == parent_id))
    parent_user = db.get(User, account.user_id)
    assert guardian is not None and parent_user.role == 'PARENT'
    assert parent_user.password_hash != payload['password'] and pwd.verify(parent_user.password_hash, payload['password'])
    assert db.query(Student).count() == initial_student_count
    assert db.query(GuardianStudent).filter_by(guardian_id=parent_id).count() == 1
    db.close()

    # Re-linking an existing child updates the relationship but never duplicates the junction row.
    assert client.post(f'/api/guardians/{parent_id}/students?relationship=Ayah', headers=headers['admin'], json=[first_id]).status_code == 200
    db = SessionLocal(); assert db.query(GuardianStudent).filter_by(guardian_id=parent_id, student_id=first_id).count() == 1; db.close()

    # Neither create nor link may give one Parent account a second Student.
    rejected = client.post('/api/guardians', headers=headers['admin'], json={**payload, 'phone_number': '081234567899', 'student_ids': [first_id, second_id]})
    assert rejected.status_code == 422 and rejected.json()['code'] == 'MULTIPLE_STUDENTS_NOT_ALLOWED'
    rejected_link = client.post(f'/api/guardians/{parent_id}/students', headers=headers['admin'], json=[third_id])
    assert rejected_link.status_code == 422 and rejected_link.json()['code'] == 'MULTIPLE_STUDENTS_NOT_ALLOWED'

    # A second guardian can safely share the same existing Student.
    second_parent = client.post('/api/guardians', headers=headers['admin'], json={
        'full_name': 'Parent B', 'phone_number': '081234567802', 'relationship': 'Ibu',
        'username': 'parent-b', 'password': 'ParentB123!', 'student_ids': [first_id],
    })
    assert second_parent.status_code == 200
    db = SessionLocal(); assert db.query(GuardianStudent).filter_by(student_id=first_id).count() == 2; assert db.query(Student).count() == initial_student_count; db.close()

    updated = client.patch(f'/api/guardians/{parent_id}', headers=headers['admin'], json={'full_name': 'Parent A Updated', 'phone_number': '081234567803', 'relationship': 'Wali'})
    assert updated.status_code == 200 and updated.json()['data']['relationship'] == 'Wali'
    assert client.patch(f'/api/guardians/{parent_id}', headers=headers['guru'], json={'full_name': 'No', 'phone_number': '081234567803'}).status_code == 403
    assert client.post(f'/api/guardians/{parent_id}/students', headers=headers['guru'], json=[third_id]).status_code == 403
    assert client.delete(f'/api/guardians/{parent_id}/students/{first_id}', headers=headers['guru']).status_code == 403

    # Parent-scoped endpoints enforce the junction table, not a client-provided filter.
    login = client.post('/api/auth/login', json={'username': generated_username, 'password': 'ParentA123!'})
    assert login.status_code == 200 and login.json()['data']['user']['role'] == 'PARENT'
    parent_headers = {'Authorization': f"Bearer {login.json()['data']['access_token']}"}
    linked = client.get('/api/parent/students', headers=parent_headers)
    assert linked.status_code == 200 and {row['id'] for row in linked.json()['data']} == {str(first_id)}
    assert client.get('/api/parent/session', headers=parent_headers).json()['data']['student']['id'] == first_id
    assert client.get(f'/api/parent/students/{first_id}', headers=parent_headers).status_code == 200
    assert client.get(f'/api/parent/students/{third_id}', headers=parent_headers).status_code == 404
    assert client.get('/api/parent/profile', headers=parent_headers).json()['data']['id'] == str(parent_id)
    generic_list = client.get('/api/students', headers=parent_headers)
    assert {row['id'] for row in generic_list.json()['data']} == {str(first_id)}
    assert client.get(f'/api/students/{third_id}', headers=parent_headers).status_code == 404

    # Legacy/conflicting data is rejected explicitly, never resolved by picking the first row.
    db = SessionLocal()
    db.add(GuardianStudent(guardian_id=parent_id, student_id=second_id, relationship='Ayah'))
    db.commit(); db.close()
    conflicting = client.get('/api/parent/session', headers=parent_headers)
    assert conflicting.status_code == 409 and conflicting.json()['code'] == 'MULTIPLE_STUDENT_CONFIGURATION'
    db = SessionLocal()
    extra = db.scalar(select(GuardianStudent).where(GuardianStudent.guardian_id == parent_id, GuardianStudent.student_id == second_id))
    db.delete(extra); db.commit(); db.close()

    # Inactive linked students remain in history but disappear from the normal Parent portal.
    assert client.delete(f'/api/students/{first_id}', headers=headers['admin']).status_code == 200
    assert client.get('/api/parent/students', headers=parent_headers).json()['data'] == []
    assert client.get('/api/parent/session', headers=parent_headers).json()['code'] == 'NO_ASSIGNED_STUDENT'
    assert client.get(f'/api/parent/students/{first_id}', headers=parent_headers).status_code == 404

    # Unlink removes only the relationship; Student and its future history remain intact.
    assert client.delete(f'/api/guardians/{parent_id}/students/{first_id}', headers=headers['admin']).status_code == 200
    db = SessionLocal(); assert db.get(Student, first_id) is not None; assert db.query(GuardianStudent).filter_by(guardian_id=parent_id, student_id=first_id).count() == 0; db.close()


def test_parent_username_is_unique_and_credentials_required_together(client, headers, student):
    base = {'full_name': 'Parent Unique', 'phone_number': '081234567804', 'relationship': 'Lainnya', 'username': 'unique-parent', 'password': 'Unique123!', 'student_ids': [student]}
    assert client.post('/api/guardians', headers=headers['admin'], json=base).status_code == 200
    duplicate = client.post('/api/guardians', headers=headers['admin'], json={**base, 'phone_number': '081234567805'})
    assert duplicate.status_code == 200
    assert duplicate.json()['data']['username'] == 'parentunique2'
    incomplete = client.post('/api/guardians', headers=headers['admin'], json={'full_name': 'Incomplete', 'phone_number': '081234567806', 'username': 'only-user', 'student_ids': [student]})
    assert incomplete.status_code == 200 and incomplete.json()['data']['username'] == ''
