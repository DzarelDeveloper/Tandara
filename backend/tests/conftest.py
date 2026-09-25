import sys
import os
from pathlib import Path
import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ['DATABASE_URL'] = f"sqlite:///{Path(__file__).resolve().parents[1] / 'data' / 'tandara_test.db'}"
os.environ['SECRET_KEY'] = 'test-secret-key-for-tandara-security-hardening-2026'

from app.database import Base, engine, SessionLocal
from app.full import app
from app.models import User, ClassRoom, Guardian, Student


@pytest.fixture(autouse=True)
def clean_test_database():
    engine.dispose()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    engine.dispose()
    Base.metadata.drop_all(engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def actors():
    db = SessionLocal(); hasher = PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1)
    admin = User(full_name='Admin Test', username='admin-test', password_hash=hasher.hash('password-aman'), role='ADMIN_IT')
    guru = User(full_name='Guru Test', username='guru-test', password_hash=hasher.hash('password-guru'), role='GURU_PIKET')
    inactive = User(full_name='Inactive Test', username='inactive-test', password_hash=hasher.hash('password-inactive'), role='GURU_PIKET', is_active=False)
    db.add_all([admin, guru, inactive]); db.commit()
    result = {'admin_id': admin.id, 'guru_id': guru.id, 'inactive_id': inactive.id}
    db.close(); return result


@pytest.fixture
def headers(client, actors):
    def login(username, password):
        response = client.post('/api/auth/login', json={'username': username, 'password': password})
        assert response.status_code == 200
        return {'Authorization': f"Bearer {response.json()['data']['access_token']}"}
    return {'admin': login('admin-test', 'password-aman'), 'guru': login('guru-test', 'password-guru')}


@pytest.fixture
def classroom():
    db = SessionLocal(); row = ClassRoom(name='XII-Test', grade='12', major='IPA', school_year='2026/2027'); db.add(row); db.commit(); result = row.id; db.close(); return result


@pytest.fixture
def guardian():
    db = SessionLocal(); row = Guardian(full_name='Wali Test', phone_number='081234567890'); db.add(row); db.commit(); result = row.id; db.close(); return result


@pytest.fixture
def student(classroom, guardian):
    db = SessionLocal(); row = Student(nis='TEST-001', full_name='Siswa Test', class_id=classroom, guardian_id=guardian, gender='L'); db.add(row); db.commit(); result = row.id; db.close(); return result
