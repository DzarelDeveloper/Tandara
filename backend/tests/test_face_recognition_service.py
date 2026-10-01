import numpy as np
import pytest

import app.services.face_recognition as recognition_module
from app.config import settings
from app.database import SessionLocal
from app.models import FaceEnrollment, Student
from app.services.face_engine import FaceEngineStatus, face_engine
from app.services.face_recognition import FaceRecognitionService


@pytest.fixture(autouse=True)
def isolated_embedding_storage(tmp_path, monkeypatch):
	monkeypatch.setattr(recognition_module, 'FACE_ROOT', tmp_path)
	recognition_module.face_recognition_service.invalidate()
	yield
	recognition_module.face_recognition_service.invalidate()


def add_enrollment(db, classroom, admin_id, student_id, vector, *, active=True, registered=True, filename=None):
	student = Student(
		nis=f'FACE-{student_id}', full_name=f'Siswa {student_id}', class_id=classroom,
		is_active=active, face_enrollment_status='REGISTERED' if registered else 'NOT_REGISTERED',
	)
	db.add(student)
	db.flush()
	filename = filename or f'{student.id}.npy'
	path = recognition_module.FACE_ROOT / filename
	path.parent.mkdir(parents=True, exist_ok=True)
	embedding = np.zeros(128, dtype=np.float32)
	embedding[:len(vector)] = vector
	with path.open('wb') as output:
		np.save(output, embedding, allow_pickle=False)
	db.add(FaceEnrollment(student_id=student.id, embedding_path=filename, sample_count=3, model_name='YuNet+SFace', registered_by=admin_id))
	db.flush()
	return student.id, path


def set_inference(monkeypatch, query):
	embedding = np.zeros(128, dtype=np.float32)
	embedding[:len(query)] = query
	monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
	monkeypatch.setattr(face_engine, 'detect_faces', lambda frame: [np.array([0, 0, 100, 100], dtype=np.float32)])
	monkeypatch.setattr(face_engine, 'validate_face_quality', lambda frame, face: None)
	monkeypatch.setattr(face_engine, 'extract_embedding', lambda frame, face: embedding)


def test_recognizes_nearest_student_above_threshold(client, actors, classroom, monkeypatch):
	db = SessionLocal()
	first_id, _ = add_enrollment(db, classroom, actors['admin_id'], 1, [1, 0])
	add_enrollment(db, classroom, actors['admin_id'], 2, [0, 1])
	db.commit()
	monkeypatch.setattr(settings, 'face_recognition_threshold', 0.75)
	set_inference(monkeypatch, [0.8, 0.6])
	result = FaceRecognitionService().recognize_frame(np.zeros((160, 160, 3), dtype=np.uint8), db)
	assert result.status == 'RECOGNIZED'
	assert result.student_id == first_id
	assert result.similarity == pytest.approx(0.8)
	assert result.face_box == {'x': 0.0, 'y': 0.0, 'width': 0.625, 'height': 0.625}
	assert set(result.timings_ms) == {'index', 'detection', 'quality', 'embedding', 'matching', 'tracking', 'total'}
	db.close()


def test_similarity_below_threshold_is_unknown(client, actors, classroom, monkeypatch):
	db = SessionLocal()
	add_enrollment(db, classroom, actors['admin_id'], 1, [1, 0])
	db.commit()
	monkeypatch.setattr(settings, 'face_recognition_threshold', 0.75)
	set_inference(monkeypatch, [0.7, np.sqrt(1 - 0.7**2)])
	result = FaceRecognitionService().recognize_frame(np.zeros((160, 160, 3), dtype=np.uint8), db)
	assert result.status == 'UNKNOWN_FACE'
	assert result.student_id is None
	db.close()


def test_similarity_exactly_at_threshold_is_recognized(client, actors, classroom, monkeypatch):
	db = SessionLocal()
	student_id, _ = add_enrollment(db, classroom, actors['admin_id'], 1, [1, 0])
	db.commit()
	monkeypatch.setattr(settings, 'face_recognition_threshold', 0.363)
	set_inference(monkeypatch, [0.363, np.sqrt(1 - 0.363**2)])
	result = FaceRecognitionService().recognize_frame(np.zeros((160, 160, 3), dtype=np.uint8), db)
	assert result.status == 'RECOGNIZED'
	assert result.student_id == student_id
	db.close()


def test_index_skips_inactive_unregistered_missing_and_corrupt(client, actors, classroom):
	db = SessionLocal()
	add_enrollment(db, classroom, actors['admin_id'], 1, [1, 0], active=False)
	add_enrollment(db, classroom, actors['admin_id'], 2, [1, 0], registered=False)
	_, missing_path = add_enrollment(db, classroom, actors['admin_id'], 3, [1, 0], filename='missing.npy')
	missing_path.unlink()
	_, corrupt_path = add_enrollment(db, classroom, actors['admin_id'], 4, [1, 0], filename='corrupt.npy')
	corrupt_path.write_bytes(b'not a numpy embedding')
	db.commit()
	ids, embeddings = FaceRecognitionService().load_enrolled_embeddings(db)
	assert ids == []
	assert embeddings.shape == (0, 0)
	db.close()


def test_empty_index_and_multiple_candidate_matching(client, actors, classroom):
	db = SessionLocal()
	service = FaceRecognitionService()
	assert service.load_enrolled_embeddings(db)[0] == []
	selected, best, second = service.find_best_match(np.array([0.9, 0.1]), [10, 20, 30], np.array([[1, 0], [0, 1], [-1, 0]], dtype=np.float32))
	assert selected == 10
	assert best == pytest.approx(0.9938837)
	assert second == pytest.approx(0.1104315)
	db.close()


def test_recognize_returns_no_enrolled_faces(client, monkeypatch):
	db = SessionLocal()
	monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
	result = FaceRecognitionService().recognize_frame(np.zeros((160, 160, 3), dtype=np.uint8), db)
	assert result.status == 'NO_ENROLLED_FACES'
	assert result.student_id is None
	db.close()


def test_ambiguity_guard_rejects_close_candidates(client, actors, classroom, monkeypatch):
	db = SessionLocal()
	add_enrollment(db, classroom, actors['admin_id'], 1, [1, 0])
	add_enrollment(db, classroom, actors['admin_id'], 2, [0.999, 0.0447])
	db.commit()
	monkeypatch.setattr(settings, 'face_recognition_threshold', 0.75)
	monkeypatch.setattr(settings, 'face_recognition_ambiguity_margin', 0.01)
	set_inference(monkeypatch, [1, 0])
	result = FaceRecognitionService().recognize_frame(np.zeros((160, 160, 3), dtype=np.uint8), db)
	assert result.status == 'AMBIGUOUS_FACE'
	assert result.student_id is None
	db.close()


def test_cache_uses_version_and_supports_explicit_invalidation(client, actors, classroom):
	db = SessionLocal()
	student_id, path = add_enrollment(db, classroom, actors['admin_id'], 1, [1, 0])
	db.commit()
	service = FaceRecognitionService()
	ids, original = service.load_enrolled_embeddings(db)
	assert ids == [student_id]
	with path.open('wb') as output:
		updated_embedding = np.zeros(128, dtype=np.float32)
		updated_embedding[1] = 1
		np.save(output, updated_embedding, allow_pickle=False)
	assert service.load_enrolled_embeddings(db)[1][0].tolist() == original[0].tolist()
	service.invalidate(student_id)
	updated = service.load_enrolled_embeddings(db)[1][0]
	assert updated[:2].tolist() == [0.0, 1.0]
	assert updated.shape == (128,)
	db.close()
