import math
import numpy as np
import pytest

import app.services.face_recognition as recognition_module
from app.config import settings
from app.database import SessionLocal
from app.models import FaceEnrollment, Student
from app.services.face_engine import FaceEngine, FaceEngineStatus, face_engine
from app.services.face_quality import FaceQualityEvaluator, quality_evaluator
from app.services.face_recognition import FaceRecognitionService, RecognitionResult


@pytest.fixture(autouse=True)
def isolated_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(recognition_module, 'FACE_ROOT', tmp_path)
    recognition_module.face_recognition_service.invalidate()
    yield
    recognition_module.face_recognition_service.invalidate()


def create_synthetic_frame(h=720, w=1280, blur=False):
    import cv2
    frame = np.full((h, w, 3), 120, dtype=np.uint8)
    # Draw textured grid in the face area (500:600, 300:400) to produce edge contrast
    for y in range(300, 400, 4):
        for x in range(500, 600, 4):
            frame[y:y+2, x:x+2] = (200, 200, 200)
    if blur:
        frame[300:400, 500:600] = cv2.GaussianBlur(frame[300:400, 500:600], (31, 31), 10.0)
    return frame


def create_frontal_face(x=500, y=300, w=90, h=90, score=0.92):
    # Subject looking straight ahead
    x_re, y_re = x + 0.25 * w, y + 0.35 * h
    x_le, y_le = x + 0.75 * w, y + 0.35 * h
    x_nt, y_nt = x + 0.50 * w, y + 0.60 * h
    x_rc, y_rc = x + 0.30 * w, y + 0.82 * h
    x_lc, y_lc = x + 0.70 * w, y + 0.82 * h
    return np.array([x, y, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rc, y_rc, x_lc, y_lc, score], dtype=np.float32)


def add_student_enrollment(db, classroom, admin_id, student_id, vector):
    student = Student(
        nis=f'STUDENT-{student_id}', full_name=f'Siswa {student_id}', class_id=classroom,
        is_active=True, face_enrollment_status='REGISTERED',
    )
    db.add(student)
    db.flush()
    filename = f'{student.id}.npy'
    path = recognition_module.FACE_ROOT / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    embedding = np.zeros(128, dtype=np.float32)
    embedding[:len(vector)] = vector
    with path.open('wb') as f:
        np.save(f, embedding, allow_pickle=False)
    db.add(FaceEnrollment(student_id=student.id, embedding_path=filename, sample_count=3, model_name='YuNet+SFace', registered_by=admin_id))
    db.flush()
    return student.id


def test_quality_evaluator_good_face():
    frame = create_synthetic_frame()
    face = create_frontal_face()
    assessment = quality_evaluator.evaluate(frame, face)
    assert assessment.is_acceptable is True
    assert assessment.error_code is None
    assert assessment.status in ('GOOD', 'ACCEPTABLE')
    assert assessment.detection_confidence >= 0.75


def test_quality_evaluator_too_small_rejection():
    frame = create_synthetic_frame()
    # 25x25 px face is below the 36px threshold
    face = create_frontal_face(x=500, y=300, w=25, h=25)
    assessment = quality_evaluator.evaluate(frame, face)
    assert assessment.is_acceptable is False
    assert assessment.status == 'TOO_SMALL'
    assert assessment.error_code == 'FACE_TOO_SMALL'


def test_quality_evaluator_blur_rejection():
    frame = create_synthetic_frame(blur=True)
    face = create_frontal_face(x=500, y=300, w=90, h=90)
    assessment = quality_evaluator.evaluate(frame, face)
    assert assessment.is_acceptable is False
    assert assessment.status == 'BLURRY'
    assert assessment.error_code == 'FACE_TOO_BLURRY'


def test_quality_evaluator_bad_pose_yaw():
    frame = create_synthetic_frame()
    # Turned face: nose is extremely close to right eye
    w, h = 90, 90
    x, y = 500, 300
    face = np.array([x, y, w, h, x + 15, y + 30, x + 75, y + 30, x + 18, y + 55, x + 20, y + 75, x + 70, y + 75, 0.90], dtype=np.float32)
    assessment = quality_evaluator.evaluate(frame, face)
    assert assessment.is_acceptable is False
    assert assessment.status == 'BAD_POSE'
    assert assessment.error_code == 'FACE_BAD_POSE'


def test_quality_evaluator_bad_pose_roll():
    frame = create_synthetic_frame()
    # Tilted head > 40 degrees
    w, h = 90, 90
    x, y = 500, 300
    face = np.array([x, y, w, h, x + 20, y + 15, x + 70, y + 65, x + 45, y + 50, x + 25, y + 70, x + 65, y + 80, 0.90], dtype=np.float32)
    assessment = quality_evaluator.evaluate(frame, face)
    assert assessment.is_acceptable is False
    assert assessment.status == 'BAD_POSE'
    assert assessment.error_code == 'FACE_BAD_POSE'


def test_quality_evaluator_low_detection_confidence():
    frame = create_synthetic_frame()
    face = create_frontal_face(score=0.45)
    assessment = quality_evaluator.evaluate(frame, face)
    assert assessment.is_acceptable is False
    assert assessment.status == 'LOW_DETECTION_CONFIDENCE'
    assert assessment.error_code == 'FACE_LOW_CONFIDENCE'


def test_quality_evaluator_rejects_non_finite_detection_confidence():
    frame = create_synthetic_frame()
    face = create_frontal_face(score=np.nan)

    assessment = quality_evaluator.evaluate(frame, face)

    assert assessment.is_acceptable is False
    assert assessment.status == 'LOW_DETECTION_CONFIDENCE'
    assert assessment.error_code == 'FACE_LOW_CONFIDENCE'


def test_quality_evaluator_rejects_non_finite_bbox_coordinates():
    frame = create_synthetic_frame()
    face = create_frontal_face()
    face[0] = np.nan

    assessment = quality_evaluator.evaluate(frame, face)

    assert assessment.is_acceptable is False
    assert assessment.status == 'OUT_OF_FRAME'
    assert assessment.error_code == 'FACE_OUT_OF_FRAME'


def test_quality_evaluator_rejects_non_finite_landmarks():
    frame = create_synthetic_frame()
    face = create_frontal_face()
    face[8] = np.nan

    assessment = quality_evaluator.evaluate(frame, face)

    assert assessment.is_acceptable is False
    assert assessment.status == 'BAD_POSE'
    assert assessment.error_code == 'FACE_BAD_POSE'


def test_detect_faces_scales_yunet_coordinates_but_not_score():
    raw_face = np.array([10, 20, 30, 40, 12, 30, 28, 30, 20, 40, 14, 50, 26, 50, 0.87], dtype=np.float32)

    class FakeDetector:
        def setInputSize(self, size):
            self.input_size = size

        def detect(self, frame):
            return None, np.array([raw_face])

    class FakeCV2:
        INTER_AREA = 1

        @staticmethod
        def resize(frame, size, interpolation):
            return np.zeros((size[1], size[0], 3), dtype=np.uint8)

    engine = FaceEngine()
    engine.status = FaceEngineStatus.READY
    engine.detector = FakeDetector()
    engine.recognizer = object()
    engine._cv2 = FakeCV2()

    face = engine.detect_faces(np.zeros((1440, 2560, 3), dtype=np.uint8))[0]

    assert face[:14].tolist() == [20, 40, 60, 80, 24, 60, 56, 60, 40, 80, 28, 100, 52, 100]
    assert face[14] == pytest.approx(0.87)


def test_quality_evaluator_out_of_frame():
    frame = create_synthetic_frame(h=720, w=1280)
    # Face extends past width 1280
    face = create_frontal_face(x=1250, y=300, w=90, h=90)
    assessment = quality_evaluator.evaluate(frame, face)
    assert assessment.is_acceptable is False
    assert assessment.status == 'OUT_OF_FRAME'
    assert assessment.error_code == 'FACE_OUT_OF_FRAME'


def test_ambiguity_rejection_when_candidates_are_close(client, actors, classroom, monkeypatch):
    db = SessionLocal()
    # Dzarel = candidate 1, Azzam = candidate 2
    dzarel_id = add_student_enrollment(db, classroom, actors['admin_id'], 101, [1.0, 0.0])
    azzam_id = add_student_enrollment(db, classroom, actors['admin_id'], 102, [0.999, 0.0447])
    db.commit()

    monkeypatch.setattr(settings, 'face_recognition_threshold', 0.70)
    monkeypatch.setattr(settings, 'face_recognition_ambiguity_margin', 0.05)

    # Mock query embedding aligned with [1.0, 0.0]
    query = np.zeros(128, dtype=np.float32)
    query[0] = 1.0
    monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
    monkeypatch.setattr(face_engine, 'detect_faces', lambda f: [np.array([100, 100, 80, 80], dtype=np.float32)])
    monkeypatch.setattr(face_engine, 'validate_face_quality', lambda f, face: None)
    monkeypatch.setattr(face_engine, 'extract_embedding', lambda f, face: query)

    service = FaceRecognitionService()
    result = service.recognize_frame(np.zeros((720, 1280, 3), dtype=np.uint8), db)

    # Because both candidates are ~1.00 and ~0.999 (difference 0.001 < 0.05), it MUST be rejected as AMBIGUOUS_FACE
    assert result.status == 'AMBIGUOUS_FACE'
    assert result.student_id is None
    assert result.reason == 'MATCHES_TOO_CLOSE'
    assert result.telemetry['ambiguity_margin'] < 0.05
    db.close()


def test_acceptance_when_candidate_is_distinct(client, actors, classroom, monkeypatch):
    db = SessionLocal()
    target_id = add_student_enrollment(db, classroom, actors['admin_id'], 201, [1.0, 0.0])
    other_id = add_student_enrollment(db, classroom, actors['admin_id'], 202, [0.0, 1.0])
    db.commit()

    monkeypatch.setattr(settings, 'face_recognition_threshold', 0.50)
    monkeypatch.setattr(settings, 'face_recognition_ambiguity_margin', 0.05)

    query = np.zeros(128, dtype=np.float32)
    query[0] = 0.9
    query[1] = np.sqrt(1 - 0.9**2)
    monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
    monkeypatch.setattr(face_engine, 'detect_faces', lambda f: [np.array([100, 100, 80, 80], dtype=np.float32)])
    monkeypatch.setattr(face_engine, 'validate_face_quality', lambda f, face: None)
    monkeypatch.setattr(face_engine, 'extract_embedding', lambda f, face: query)

    service = FaceRecognitionService()
    result = service.recognize_frame(np.zeros((720, 1280, 3), dtype=np.uint8), db)

    # Candidate 1: 0.90, Candidate 2: ~0.435 -> margin ~0.465 >= 0.05 -> RECOGNIZED
    assert result.status == 'RECOGNIZED'
    assert result.student_id == target_id
    assert result.similarity == pytest.approx(0.9)
    assert result.telemetry['ambiguity_margin'] > 0.05
    assert result.telemetry['candidate_id'] == target_id
    db.close()


def test_unknown_rejection_below_threshold(client, actors, classroom, monkeypatch):
    db = SessionLocal()
    add_student_enrollment(db, classroom, actors['admin_id'], 301, [1.0, 0.0])
    db.commit()

    monkeypatch.setattr(settings, 'face_recognition_threshold', 0.70)
    query = np.zeros(128, dtype=np.float32)
    query[0] = 0.4
    query[1] = np.sqrt(1 - 0.4**2)
    monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
    monkeypatch.setattr(face_engine, 'detect_faces', lambda f: [np.array([100, 100, 80, 80], dtype=np.float32)])
    monkeypatch.setattr(face_engine, 'validate_face_quality', lambda f, face: None)
    monkeypatch.setattr(face_engine, 'extract_embedding', lambda f, face: query)

    service = FaceRecognitionService()
    result = service.recognize_frame(np.zeros((720, 1280, 3), dtype=np.uint8), db)

    assert result.status == 'UNKNOWN_FACE'
    assert result.student_id is None
    assert result.reason == 'BELOW_THRESHOLD'
    assert 'candidate_id' not in result.telemetry
    db.close()


def test_non_finite_query_embedding_is_not_recognized(client, actors, classroom, monkeypatch):
    db = SessionLocal()
    add_student_enrollment(db, classroom, actors['admin_id'], 401, [1.0, 0.0])
    db.commit()

    monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
    monkeypatch.setattr(face_engine, 'detect_faces', lambda frame: [np.array([100, 100, 80, 80], dtype=np.float32)])
    monkeypatch.setattr(face_engine, 'validate_face_quality', lambda frame, face: None)
    monkeypatch.setattr(face_engine, 'extract_embedding', lambda frame, face: np.full(128, np.nan, dtype=np.float32))

    result = FaceRecognitionService().recognize_frame(np.zeros((720, 1280, 3), dtype=np.uint8), db)

    assert result.status == 'UNKNOWN_FACE'
    assert result.student_id is None
    db.close()


def test_telemetry_structure_contains_expected_fields():
    frame = create_synthetic_frame()
    face = create_frontal_face()
    assessment = quality_evaluator.evaluate(frame, face)

    assert assessment.bbox == (500.0, 300.0, 90.0, 90.0)
    assert assessment.frame_size == (1280, 720)
    assert assessment.sharpness > 0.0
    assert assessment.brightness > 0.0
    assert isinstance(assessment.details, dict)

