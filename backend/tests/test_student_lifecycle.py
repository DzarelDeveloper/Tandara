from datetime import date
from pathlib import Path

import jwt
import numpy as np
import pytest
from sqlalchemy import select, text

from app.config import settings
from app.database import SessionLocal
from app.models import (Attendance, AuditLog, FaceEnrollment, Guardian, GuardianAccount,
                        GuardianStudent, LeaveRequest, Notification, Student, User)
import app.routers.face_enrollment as face_router
import app.services.face_recognition as recognition


@pytest.fixture(autouse=True)
def isolated_faces(tmp_path, monkeypatch):
    root = tmp_path / 'faces'
    monkeypatch.setattr(face_router, 'FACE_ROOT', root)
    monkeypatch.setattr(face_router, 'PENDING_ROOT', root / '.pending')
    monkeypatch.setattr(recognition, 'FACE_ROOT', root)
    recognition.face_recognition_service.invalidate()
    yield root
    recognition.face_recognition_service.invalidate()


def enroll(student, admin_id, root):
    path = root / str(student) / 'embedding-test.npy'
    path.parent.mkdir(parents=True, exist_ok=True)
    np.save(path, np.ones(128, dtype=np.float32))
    pending = root / '.pending' / str(student) / 'sample-01.npy'
    pending.parent.mkdir(parents=True, exist_ok=True)
    np.save(pending, np.ones(128, dtype=np.float32))
    with SessionLocal() as db:
        db.get(Student, student).face_enrollment_status = 'REGISTERED'
        db.add(FaceEnrollment(student_id=student, embedding_path=f'{student}/{path.name}', sample_count=3, model_name='YuNet+SFace', registered_by=admin_id))
        db.commit()
    return path, pending


def test_archive_reactivate_preserves_history_and_recognition_candidates(client, headers, actors, student, guardian, isolated_faces):
    h = headers['admin']
    path, pending = enroll(student, actors['admin_id'], isolated_faces)
    with SessionLocal() as db:
        db.add(GuardianStudent(student_id=student, guardian_id=guardian))
        db.add(Attendance(student_id=student, attendance_date=date.today(), status='LATE', notes='Historical correction'))
        db.commit()
        original = db.get(Student, student).nis
        enrollment_id = db.scalar(select(FaceEnrollment.id))
        assert recognition.face_recognition_service.load_enrolled_embeddings(db)[0] == [student]
    assert len(client.get('/api/students', headers=h).json()['data']) == 1
    assert client.delete(f'/api/students/{student}', headers=h).status_code == 200
    assert client.get('/api/students', headers=h).json()['data'] == []
    archived = client.get('/api/students?is_active=false', headers=h).json()['data']
    assert archived[0]['id'] == str(student) and archived[0]['status'] == 'INACTIVE'
    assert not recognition.face_recognition_service._cache
    with SessionLocal() as db:
        assert recognition.face_recognition_service.load_enrolled_embeddings(db)[0] == []
    response = client.patch(f'/api/students/{student}/status', headers=h, json={'is_active': True})
    assert response.status_code == 200 and response.json()['data']['id'] == str(student)
    assert response.json()['data']['nis'] == original
    assert client.get('/api/students?is_active=false', headers=h).json()['data'] == []
    assert client.get('/api/students', headers=h).json()['data'][0]['id'] == str(student)
    with SessionLocal() as db:
        assert db.get(Student, student).guardian_id == guardian
        assert db.scalar(select(GuardianStudent).where(GuardianStudent.student_id == student))
        assert db.get(FaceEnrollment, enrollment_id).sample_count == 3
        assert db.scalar(select(Attendance)).notes == 'Historical correction'
        assert recognition.face_recognition_service.load_enrolled_embeddings(db)[0] == [student]
        assert {'DEACTIVATE', 'REACTIVATE'} <= set(db.scalars(select(AuditLog.action)).all())
    assert path.exists() and pending.exists()


def test_clean_permanent_delete_scoped_and_guardian_account_survives(client, headers, actors, student, classroom, guardian, isolated_faces):
    h = headers['admin']
    with SessionLocal() as db:
        parent = User(username='lifecycle-parent', full_name='Lifecycle Parent', password_hash='unused', role='PARENT')
        other = Student(nis='LIFECYCLE-OTHER', full_name='Other Student', class_id=classroom, guardian_id=guardian)
        db.add_all([parent, other]); db.flush()
        parent_id, other_id = parent.id, other.id
        db.add(GuardianAccount(guardian_id=guardian, user_id=parent.id))
        db.add_all([GuardianStudent(guardian_id=guardian, student_id=student), GuardianStudent(guardian_id=guardian, student_id=other.id)])
        db.add(AuditLog(user_id=actors['admin_id'], action='CREATE', entity_type='Student', entity_id=str(student), description='Historical creation'))
        db.commit()
    owned = enroll(student, actors['admin_id'], isolated_faces)
    other_files = enroll(other_id, actors['admin_id'], isolated_faces)
    other_bytes = [p.read_bytes() for p in other_files]
    with SessionLocal() as db:
        recognition.face_recognition_service.load_enrolled_embeddings(db)
    response = client.delete(f'/api/students/{student}/permanent', headers=h)
    assert response.status_code == 200, response.text
    assert response.json()['data']['cleanupPending'] is False
    assert all(not p.exists() for p in owned)
    assert [p.read_bytes() for p in other_files] == other_bytes
    assert student not in recognition.face_recognition_service._cache
    with SessionLocal() as db:
        assert db.get(Student, student) is None
        assert db.get(Student, other_id)
        assert db.get(Guardian, guardian) and db.get(User, parent_id)
        assert db.scalar(select(GuardianAccount))
        assert db.scalar(select(GuardianStudent).where(GuardianStudent.student_id == student)) is None
        assert db.scalar(select(GuardianStudent).where(GuardianStudent.student_id == other_id))
        assert db.scalar(select(FaceEnrollment).where(FaceEnrollment.student_id == student)) is None
        logs = db.scalars(select(AuditLog).where(AuditLog.entity_id == str(student), AuditLog.entity_type == 'Student')).all()
        assert any(log.description == 'Historical creation' for log in logs)
        deletion = next(log for log in logs if log.action == 'PERMANENT_DELETE')
        assert 'TEST-001' in deletion.description and 'Siswa Test' in deletion.description
        assert not any(word in deletion.description for word in ('embedding', 'password'))
        assert db.execute(text('PRAGMA foreign_key_check')).all() == []


@pytest.mark.parametrize('history', ['attendance', 'leave', 'notification'])
def test_protected_history_blocks_without_any_cleanup(client, headers, actors, student, isolated_faces, history):
    path, pending = enroll(student, actors['admin_id'], isolated_faces)
    with SessionLocal() as db:
        row = {
            'attendance': lambda: Attendance(student_id=student, attendance_date=date.today(), status='PRESENT'),
            'leave': lambda: LeaveRequest(student_id=student, leave_date=date.today(), leave_type='SICK', reason='Medical leave', submitted_by=actors['admin_id']),
            'notification': lambda: Notification(student_id=student, recipient_user_id=actors['admin_id'], type='TEST', title='History', message='Preserve me'),
        }[history]()
        db.add(row); db.commit()
    response = client.delete(f'/api/students/{student}/permanent', headers=headers['admin'])
    assert response.status_code == 409 and response.json()['code'] == 'STUDENT_HISTORY_PROTECTED'
    assert 'Nonaktifkan' in response.json()['message']
    assert path.exists() and pending.exists()
    with SessionLocal() as db:
        assert db.get(Student, student)
        assert db.scalar(select(FaceEnrollment))
        assert db.scalar(select(AuditLog).where(AuditLog.action == 'PERMANENT_DELETE')) is None


@pytest.mark.parametrize('role', ['anonymous', 'guru', 'parent'])
def test_lifecycle_rbac(client, headers, actors, student, role):
    with SessionLocal() as db:
        parent = User(username='archive-parent', full_name='Parent', password_hash='unused', role='PARENT')
        db.add(parent); db.commit(); parent_id = parent.id
    auth = {} if role == 'anonymous' else headers['guru'] if role == 'guru' else {'Authorization': 'Bearer ' + jwt.encode({'sub': str(parent_id)}, settings.secret_key, algorithm='HS256')}
    expected = 401 if role == 'anonymous' else 403
    assert client.delete(f'/api/students/{student}/permanent', headers=auth).status_code == expected
    assert client.patch(f'/api/students/{student}/status', headers=auth, json={'is_active': True}).status_code == expected
    assert client.get('/api/students?is_active=false', headers=auth).status_code == expected
    with SessionLocal() as db:
        assert db.get(Student, student)


def test_archived_filters_pagination_and_edit_preserve_status(client, headers, student, classroom):
    h = headers['admin']
    client.delete(f'/api/students/{student}', headers=h)
    for query in ('q=TEST-001', f'class_id={classroom}', 'face_status=NOT_REGISTERED', 'page=1&page_size=1'):
        assert len(client.get('/api/students?is_active=false&' + query, headers=h).json()['data']) == 1
    assert client.get('/api/students?is_active=false&page=2&page_size=1', headers=h).json()['data'] == []
    response = client.patch(f'/api/students/{student}', headers=h, json={'nis': 'TEST-001', 'full_name': 'Edited Archive', 'class_id': classroom})
    assert response.status_code == 200 and response.json()['data']['status'] == 'INACTIVE'
    assert client.delete(f'/api/students/{student}/permanent', headers=h).status_code == 200
    assert client.patch(f'/api/students/{student}/status', headers=h, json={'is_active': True}).status_code == 404
    assert client.delete(f'/api/students/{student}/permanent', headers=h).status_code == 404


def test_cleanup_staging_failure_rolls_back(client, headers, actors, student, isolated_faces, monkeypatch):
    path, pending = enroll(student, actors['admin_id'], isolated_faces)
    rename = Path.rename
    def fail_pending(self, target):
        if self == pending.parent:
            raise OSError('simulated staging failure')
        return rename(self, target)
    monkeypatch.setattr(Path, 'rename', fail_pending)
    response = client.delete(f'/api/students/{student}/permanent', headers=headers['admin'])
    assert response.status_code == 503
    assert path.exists() and pending.exists()
    with SessionLocal() as db:
        assert db.get(Student, student) and db.scalar(select(FaceEnrollment))
        assert db.scalar(select(AuditLog).where(AuditLog.action == 'PERMANENT_DELETE')) is None


def test_commit_failure_restores_files_and_rows(client, headers, actors, student, isolated_faces, monkeypatch):
    from sqlalchemy.orm import Session
    from sqlalchemy.exc import IntegrityError
    path, pending = enroll(student, actors['admin_id'], isolated_faces)
    def fail_commit(self):
        raise IntegrityError('simulated constraint failure', {}, Exception())
    monkeypatch.setattr(Session, 'commit', fail_commit)
    response = client.delete(f'/api/students/{student}/permanent', headers=headers['admin'])
    assert response.status_code == 409
    assert path.exists() and pending.exists()
    with SessionLocal() as db:
        assert db.get(Student, student) and db.scalar(select(FaceEnrollment))


def test_unsafe_biometric_path_blocks_deletion(client, headers, actors, student, isolated_faces):
    path, pending = enroll(student, actors['admin_id'], isolated_faces)
    with SessionLocal() as db:
        db.scalar(select(FaceEnrollment)).embedding_path = '../shared-model.onnx'
        db.commit()
    response = client.delete(f'/api/students/{student}/permanent', headers=headers['admin'])
    assert response.status_code == 409 and response.json()['code'] == 'BIOMETRIC_OWNERSHIP_CONFLICT'
    assert path.exists() and pending.exists()


def test_symlink_cleanup_is_blocked(client, headers, actors, student, isolated_faces, tmp_path):
    path, pending = enroll(student, actors['admin_id'], isolated_faces)
    shared = tmp_path / 'model.onnx'; shared.write_bytes(b'preserved model')
    (path.parent / 'linked-model').symlink_to(shared)
    response = client.delete(f'/api/students/{student}/permanent', headers=headers['admin'])
    assert response.status_code == 409
    assert shared.read_bytes() == b'preserved model'
    assert path.exists() and pending.exists()


def test_shared_embedding_reference_blocks_cleanup(client, headers, actors, student, classroom, isolated_faces):
    path, _ = enroll(student, actors['admin_id'], isolated_faces)
    with SessionLocal() as db:
        other = Student(nis='SHARED-PATH', full_name='Other Student', class_id=classroom)
        db.add(other); db.flush()
        db.add(FaceEnrollment(student_id=other.id, embedding_path=f'{student}/{path.name}', sample_count=3, model_name='YuNet+SFace', registered_by=actors['admin_id']))
        db.commit()
    assert client.delete(f'/api/students/{student}/permanent', headers=headers['admin']).status_code == 409
    assert path.exists()


def test_unknown_photo_ownership_blocks_cleanup(client, headers, student):
    with SessionLocal() as db:
        db.get(Student, student).photo_path = 'legacy-photo.jpg'; db.commit()
    response = client.delete(f'/api/students/{student}/permanent', headers=headers['admin'])
    assert response.status_code == 409 and response.json()['code'] == 'STUDENT_FILE_PROTECTED'


def test_post_commit_purge_failure_is_explicit(client, headers, actors, student, isolated_faces, monkeypatch):
    import app.services.biometric_cleanup as cleanup
    enroll(student, actors['admin_id'], isolated_faces)
    def fail_purge(path):
        raise OSError('simulated purge failure')
    monkeypatch.setattr(cleanup.shutil, 'rmtree', fail_purge)
    response = client.delete(f'/api/students/{student}/permanent', headers=headers['admin'])
    assert response.status_code == 200 and response.json()['data']['cleanupPending'] is True
    assert not (isolated_faces / str(student)).exists()
    assert len(list((isolated_faces / '.deleting').iterdir())) == 2
    with SessionLocal() as db:
        assert db.get(Student, student) is None


def test_foreign_keys_reject_late_historical_write(client, headers, student):
    from sqlalchemy.exc import IntegrityError
    assert client.delete(f'/api/students/{student}/permanent', headers=headers['admin']).status_code == 200
    with SessionLocal() as db:
        assert db.execute(text('PRAGMA foreign_keys')).scalar() == 1
        db.add(Attendance(student_id=student, attendance_date=date.today(), status='PRESENT'))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_legacy_identity_patch_status_change_invalidates_cache(client, headers, actors, student, classroom, isolated_faces):
    enroll(student, actors['admin_id'], isolated_faces)
    h = headers['admin']
    with SessionLocal() as db:
        recognition.face_recognition_service.load_enrolled_embeddings(db)
    payload = {'nis': 'TEST-001', 'full_name': 'Siswa Test', 'class_id': classroom, 'is_active': False}
    assert client.patch(f'/api/students/{student}', headers=h, json=payload).status_code == 200
    assert not recognition.face_recognition_service._cache
    assert client.patch(f'/api/students/{student}', headers=h, json={**payload, 'is_active': True}).status_code == 200
    with SessionLocal() as db:
        assert recognition.face_recognition_service.load_enrolled_embeddings(db)[0] == [student]
        assert 'REACTIVATE' in db.scalars(select(AuditLog.action)).all()


def test_enrollment_mutations_cannot_recreate_files_after_permanent_delete(client, headers, student, isolated_faces):
    h = headers['admin']
    assert client.delete(f'/api/students/{student}/permanent', headers=h).status_code == 200
    assert client.post(f'/api/students/{student}/face-enrollment/samples', headers=h,
                       files={'image': ('sample.jpg', b'no-image', 'image/jpeg')}).status_code == 404
    assert client.post(f'/api/students/{student}/face-enrollment/complete', headers=h).status_code == 404
    assert client.delete(f'/api/students/{student}/face-enrollment/samples', headers=h).status_code == 404
    assert not (isolated_faces / str(student)).exists()
    assert not (isolated_faces / '.pending' / str(student)).exists()
