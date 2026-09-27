from fastapi.testclient import TestClient
from app.full import app

def test_health():
    with TestClient(app) as client:
        response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json()['data']['face_recognition'] == 'READY'

def test_protected_students_requires_authentication():
    with TestClient(app) as client:
        response = client.get('/api/students')
    assert response.status_code == 401
