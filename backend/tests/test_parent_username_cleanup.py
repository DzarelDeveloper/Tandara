from datetime import date

from sqlalchemy import select

from app.cli.cleanup_parent_demo import cleanup_parent_development_data
from app.cli.migrate_parent_usernames import migrate_parent_usernames, parent_username_rows
from app.database import SessionLocal
from app.main import pwd
from app.models import Attendance, FaceEnrollment, Guardian, GuardianAccount, GuardianStudent, Student, User
from app.services.usernames import generate_unique_username, username_base


def test_parent_username_normalization():
    assert username_base('Bapa Dzarel') == 'bapadzarel'
    assert username_base('Muhammad Rizky Pratama') == 'muhammadrizkypratama'
    assert username_base('Siti Nur Aisyah') == 'sitinuraisyah'
    assert '.' not in username_base('Parent. Hardware')


def test_parent_username_duplicate_suffix_is_deterministic():
    db = SessionLocal()
    db.add(User(full_name='Existing', username='bapadzarel', password_hash='not-used', role='PARENT'))
    db.commit()
    assert generate_unique_username('Bapa Dzarel', db) == 'bapadzarel2'
    db.close()


def test_identical_guardian_names_receive_distinct_usernames(client, headers, student):
    payload = {
        'full_name': 'Siti Nur Aisyah', 'phone_number': '081234567812',
        'relationship': 'Ibu', 'password': 'SitiAisyah123!', 'student_ids': [student],
    }
    first = client.post('/api/guardians', headers=headers['admin'], json=payload)
    second = client.post('/api/guardians', headers=headers['admin'], json={**payload, 'phone_number': '081234567813'})
    first_username = first.json()['data']['username']
    second_username = second.json()['data']['username']
    assert first_username == 'sitinuraisyah'
    assert second_username == 'sitinuraisyah2'


def test_parent_username_migration_preserves_identity_and_is_idempotent(classroom):
    db = SessionLocal()
    guardian = Guardian(full_name='Bapa Dzarel', phone_number='081234567899')
    parent = User(full_name='Bapa Dzarel', username='parent.hardware', password_hash=pwd.hash('ExistingParent123!'), role='PARENT')
    db.add_all([guardian, parent]); db.flush()
    db.add(GuardianAccount(guardian_id=guardian.id, user_id=parent.id))
    student = Student(nis='MIGRATE-001', full_name='Migration Student', class_id=classroom, guardian_id=guardian.id)
    db.add(student); db.flush()
    link = GuardianStudent(guardian_id=guardian.id, student_id=student.id, relationship='Ayah')
    db.add(link); db.commit()
    user_id, guardian_id, password_hash, link_id = parent.id, guardian.id, parent.password_hash, link.id

    migrations = migrate_parent_usernames(db)
    db.commit(); db.expire_all()
    migrated = db.get(User, user_id)
    assert len(migrations) == 1 and migrated.username == 'bapadzarel'
    assert migrated.id == user_id and db.get(Guardian, guardian_id).id == guardian_id
    assert migrated.password_hash == password_hash
    assert db.scalar(select(GuardianAccount).where(GuardianAccount.guardian_id == guardian_id, GuardianAccount.user_id == user_id)) is not None
    assert db.get(GuardianStudent, link_id).relationship == 'Ayah'
    new_username = migrated.username

    assert migrate_parent_usernames(db) == []
    db.commit(); db.refresh(migrated)
    assert migrated.username == new_username
    db.close()


def test_generated_parent_username_login_rename_and_inactive_filter(client, headers, student):
    created = client.post('/api/guardians', headers=headers['admin'], json={
        'full_name': 'Budi Santoso', 'phone_number': '081234567811', 'relationship': 'Ayah',
        'password': 'BudiSantoso123!', 'student_ids': [student],
    })
    assert created.status_code == 200
    assert created.json()['data']['username'] == 'budisantoso'
    assert not created.json()['data']['username'].startswith(('parent.', 'guardian.', 'ortu.', 'wali.'))

    parent_id = int(created.json()['data']['id'])
    login = client.post('/api/auth/login', json={'username': created.json()['data']['username'], 'password': 'BudiSantoso123!'})
    assert login.status_code == 200
    parent_headers = {'Authorization': f"Bearer {login.json()['data']['access_token']}"}
    assert client.get('/api/auth/me', headers=parent_headers).json()['data']['role'] == 'PARENT'

    renamed = client.patch(f'/api/guardians/{parent_id}', headers=headers['admin'], json={
        'full_name': 'Budi Santoso Utama', 'phone_number': '081234567811', 'relationship': 'Ayah',
    })
    assert renamed.status_code == 200 and renamed.json()['data']['username'] == created.json()['data']['username']

    assert client.delete(f'/api/students/{student}', headers=headers['admin']).status_code == 200
    assert client.get('/api/parent/students', headers=parent_headers).json()['data'] == []
    admin_parent = client.get('/api/guardians?include_inactive=true', headers=headers['admin']).json()['data'][0]
    assert admin_parent['students'] == []


def test_known_development_cleanup_preserves_identity_hash_and_history(client, classroom):
    db = SessionLocal()
    guardian = Guardian(full_name='Bapa Dzarel', phone_number='081234567899')
    parent = User(full_name='Bapa Dzarel', username='parent.hardware', password_hash=pwd.hash('ExistingParent123!'), role='PARENT')
    admin = User(full_name='Admin', username='cleanup-admin', password_hash=pwd.hash('AdminCleanup123!'), role='ADMIN_IT')
    db.add_all([guardian, parent, admin]); db.flush()
    db.add(GuardianAccount(guardian_id=guardian.id, user_id=parent.id))
    hardware = Student(nis='HW-VALIDATION-001', full_name='Siswa Hardware Validation', class_id=classroom, guardian_id=guardian.id, is_active=False)
    real = Student(nis='123456', full_name='Muhammad Dzarel Alghifari', class_id=classroom, guardian_id=guardian.id, is_active=True)
    db.add_all([hardware, real]); db.flush()
    db.add_all([
        GuardianStudent(guardian_id=guardian.id, student_id=hardware.id, relationship='Ayah'),
        GuardianStudent(guardian_id=guardian.id, student_id=real.id, relationship='Ayah'),
        Attendance(student_id=hardware.id, attendance_date=date(2026, 9, 27), status='PRESENT'),
        FaceEnrollment(student_id=hardware.id, embedding_path='preserved.npy', sample_count=3, model_name='SFace', registered_by=admin.id),
    ])
    db.commit()
    guardian_id, user_id, hardware_id, real_id, original_hash = guardian.id, parent.id, hardware.id, real.id, parent.password_hash

    result = cleanup_parent_development_data(db)
    db.expire_all()
    migrated = db.get(User, user_id)
    assert result.username_changed and result.student_unlinked
    assert result.guardian_id == guardian_id and result.user_id == user_id
    assert migrated.username == 'bapadzarel' and migrated.password_hash == original_hash
    assert pwd.verify(migrated.password_hash, 'ExistingParent123!')
    assert db.scalar(select(GuardianAccount).where(GuardianAccount.guardian_id == guardian_id)).user_id == user_id
    assert db.query(GuardianStudent).filter_by(guardian_id=guardian_id, student_id=hardware_id).count() == 0
    assert db.query(GuardianStudent).filter_by(guardian_id=guardian_id, student_id=real_id).count() == 1
    assert db.query(Attendance).filter_by(student_id=hardware_id).count() == 1
    assert db.query(FaceEnrollment).filter_by(student_id=hardware_id).count() == 1
    assert db.get(Student, hardware_id) is not None and db.get(Student, hardware_id).guardian_id is None
    db.close()

    new_login = client.post('/api/auth/login', json={'username': migrated.username, 'password': 'ExistingParent123!'})
    assert new_login.status_code == 200
    assert new_login.json()['data']['user']['role'] == 'PARENT'
    token = new_login.json()['data']['access_token']
    me = client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'})
    assert me.status_code == 200 and me.json()['data']['username'] == migrated.username
    assert client.post('/api/auth/login', json={'username': 'parent.hardware', 'password': 'ExistingParent123!'}).status_code == 401
