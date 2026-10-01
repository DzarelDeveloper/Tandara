from app.services.face_tracking import LightweightFaceTracker


def test_track_ids_remain_stable_for_two_moving_faces():
    tracker = LightweightFaceTracker()
    first = tracker.update([(0.10, 0.20, 0.08, 0.12), (0.70, 0.20, 0.08, 0.12)], now=1.0)

    moved = tracker.update([(0.12, 0.20, 0.08, 0.12), (0.68, 0.20, 0.08, 0.12)], now=1.8)

    assert [track.track_id for track in moved] == [track.track_id for track in first]


def test_track_survives_short_detection_gap_but_expires_after_ttl():
    tracker = LightweightFaceTracker(ttl_seconds=2.0)
    first = tracker.update([(0.20, 0.30, 0.10, 0.15)], now=1.0)[0]

    assert tracker.update([], now=2.0) == []
    returned = tracker.update([(0.21, 0.30, 0.10, 0.15)], now=2.5)[0]
    expired = tracker.update([(0.21, 0.30, 0.10, 0.15)], now=5.0)[0]

    assert returned.track_id == first.track_id
    assert expired.track_id != first.track_id

def test_multiface_recognition_is_independent_and_cached(monkeypatch):
    import numpy as np
    from app.services.face_engine import face_engine, FaceEngineStatus
    from app.services.face_recognition import FaceRecognitionService
    import app.services.face_recognition as module

    service = FaceRecognitionService()
    clock = [10.0]
    monkeypatch.setattr(module.time, 'monotonic', lambda: clock[0])
    monkeypatch.setattr(face_engine, 'initialize', lambda: FaceEngineStatus.READY)
    monkeypatch.setattr(service, 'load_enrolled_embeddings', lambda db: ([1, 2], np.eye(3, dtype=np.float32)[:2]))
    boxes = [np.array([10, 20, 40, 50]), np.array([180, 20, 40, 50])]
    monkeypatch.setattr(face_engine, 'detect_faces', lambda frame: boxes)
    monkeypatch.setattr(face_engine, 'validate_face_quality', lambda frame, face: None)
    calls = []
    def embed(frame, face):
        calls.append(float(face[0]))
        return np.array([1, 0, 0] if face[0] < 100 else [0, 0, 1], dtype=np.float32)
    monkeypatch.setattr(face_engine, 'extract_embedding', embed)
    frame = np.zeros((300, 300, 3), dtype=np.uint8)
    first = service.recognize_frame_many(frame, None, session_id=1)
    assert [r.status for r in first] == ['RECOGNIZED', 'UNKNOWN_FACE']
    assert [r.student_id for r in first] == [1, None]
    assert len({r.track_id for r in first}) == 2
    clock[0] += 0.2
    boxes.reverse()
    cached = service.recognize_frame_many(frame, None, session_id=1)
    assert [r.track_id for r in cached] == [first[1].track_id, first[0].track_id]
    assert len(calls) == 2
    clock[0] += 0.7
    service.recognize_frame_many(frame, None, session_id=1)
    assert len(calls) == 4  # Pending identity needs fresh temporal evidence too.
    monkeypatch.setattr(face_engine, 'validate_face_quality', lambda frame, face: 'FACE_TOO_BLURRY' if face[0] < 100 else None)
    rejected = service.recognize_frame_many(frame, None, session_id=1)
    assert rejected[1].status == 'FACE_TOO_BLURRY'
    assert rejected[1].student_id is None


def test_missing_track_keeps_id_but_invalidates_identity_cache():
    tracker = LightweightFaceTracker()
    track = tracker.update([(0.1, 0.2, 0.1, 0.1)], now=1)[0]
    track.cache_expires_at = 3
    tracker.update([], now=1.2)
    returned = tracker.update([(0.1, 0.2, 0.1, 0.1)], now=1.5)[0]
    assert returned.track_id == track.track_id
    assert returned.cache_expires_at == 0


def test_crossing_assignment_cannot_keep_verified_identity_or_live_state():
    tracker = LightweightFaceTracker()
    tracks = tracker.update([(.1, .2, .1, .1), (.2, .2, .1, .1)], now=1)
    for item in tracks:
        item.state = 'VERIFIED'
        item.verified_student_id = item.track_id
        item.verified_until = 5
        item.liveness_state = 'LIVE'
    crossing = tracker.update([(.149, .2, .1, .1), (.151, .2, .1, .1)], now=1.3)
    assert all(item.verified_student_id is None and item.liveness_state != 'LIVE' for item in crossing)
