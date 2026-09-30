import numpy as np
import pytest

from app.services.face_tracking import FaceTrack, LightweightFaceTracker
from app.services.face_temporal import verify_observation
from app.services.face_recognition import FaceRecognitionService
from app.services.face_engine import face_engine, FaceEngineStatus


def observe(track, now, student_id=1, status='RECOGNIZED', fresh=True):
    verify_observation(track, status=status, student_id=student_id, similarity=0.85,
                       quality='GOOD', sharpness=80, now=now, fresh=fresh)


def test_consistent_fresh_evidence_verifies_but_cache_does_not():
    track = FaceTrack(1, (0, 0, .1, .1), 0)
    observe(track, 0)
    for now in [.1, .2, .3]:
        observe(track, now, fresh=False)
    assert track.state == 'VERIFYING'
    assert track.evidence_count == 1
    observe(track, .4)
    observe(track, .8)
    assert track.state == 'VERIFIED'
    assert track.verified_student_id == 1


def test_blur_gap_motion_and_scale_change_preserve_evidence():
    tracker = LightweightFaceTracker()
    track = tracker.update([(.1, .2, .1, .15)], now=0)[0]
    observe(track, 0)
    observe(track, .35, student_id=None, status='FACE_TOO_BLURRY', fresh=False)
    tracker.update([], now=.4)
    moved = tracker.update([(.17, .2, .14, .19)], now=.7)[0]
    assert moved.track_id == track.track_id
    observe(moved, .7)
    observe(moved, 1.1)
    assert moved.state == 'VERIFIED'
    assert len(moved.observations) == 3


@pytest.mark.parametrize('middle', [2, None])
def test_conflicting_or_unknown_evidence_blocks_verification(middle):
    track = FaceTrack(1, (0, 0, .1, .1), 0)
    observe(track, 0)
    observe(track, .4, middle, 'RECOGNIZED' if middle else 'UNKNOWN_FACE')
    observe(track, .8)
    observe(track, 1.2)
    assert track.state == 'VERIFYING'
    assert track.verified_student_id is None


def test_evidence_expires_and_minimum_is_configurable(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, 'face_temporal_min_observations', 4)
    track = FaceTrack(1, (0, 0, .1, .1), 0)
    for now in [0, .4, .8]:
        observe(track, now)
    assert track.state == 'VERIFYING'
    observe(track, 1.2)
    assert track.state == 'VERIFIED'
    observe(track, 5)
    assert track.state == 'VERIFYING'
    assert track.evidence_count == 1


def test_two_tracks_verify_independently_with_unknown(monkeypatch):
    import app.services.face_recognition as module
    clock = [10.0]
    monkeypatch.setattr(module.time, 'monotonic', lambda: clock[0])
    service = FaceRecognitionService()
    monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
    monkeypatch.setattr(service, 'load_enrolled_embeddings', lambda db: ([1, 2], np.eye(3, dtype=np.float32)[:2]))
    faces = [np.array([x, 10, 40, 50]) for x in [10, 150, 290]]
    monkeypatch.setattr(face_engine, 'detect_faces', lambda frame: faces)
    monkeypatch.setattr(face_engine, 'validate_face_quality', lambda frame, face: None)
    calls = []
    def embed(frame, face):
        calls.append(face[0])
        return np.eye(3, dtype=np.float32)[int((face[0] - 10) // 140)]
    monkeypatch.setattr(face_engine, 'extract_embedding', embed)
    frame = np.zeros((400, 400, 3), dtype=np.uint8)
    for now in [10, 10.5, 11]:
        clock[0] = now
        results = service.recognize_frame_many(frame, None, session_id=1)
    assert [r.track_state for r in results] == ['VERIFIED', 'VERIFIED', 'UNKNOWN']
    assert [r.student_id for r in results] == [1, 2, None]
    assert len({r.track_id for r in results}) == 3
    service.mark_attendance_attempted(1, results[0].track_id)
    clock[0] = 11.1
    cached = service.recognize_frame_many(frame, None, session_id=1)
    assert cached[0].track_state == 'ATTENDED'
    assert cached[0].evidence_count == 3
    assert len(calls) == 9
