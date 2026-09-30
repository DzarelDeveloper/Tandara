"""Short, bounded evidence history. Cached recognition never becomes new evidence."""
from ..config import settings
from .face_tracking import FaceObservation, FaceTrack


def verify_observation(track: FaceTrack, *, status: str, student_id: int | None,
                       similarity: float | None, quality: str, sharpness: float,
                       now: float, fresh: bool, ambiguity_margin: float | None = None) -> None:
    if (not fresh and status == 'RECOGNIZED' and track.verified_student_id == student_id
            and now < track.verified_until):
        track.state = 'ATTENDED' if student_id in track.attended_student_ids else 'VERIFIED'
        return
    while track.observations and now - track.observations[0].timestamp > settings.face_temporal_window_seconds:
        track.observations.popleft()
    if fresh:
        track.observations.append(FaceObservation(student_id, similarity, quality, sharpness, now, ambiguity_margin))

    evidence = list(track.observations)
    supporting = [item for item in evidence if student_id is not None and item.student_id == student_id]
    track.evidence_count = len(supporting)
    track.verified_student_id = None
    if status in ('UNKNOWN_FACE', 'NO_ENROLLED_FACES'):
        track.state = 'UNKNOWN'
        return
    track.state = 'VERIFYING' if evidence else 'TRACKING'
    if status != 'RECOGNIZED' or not supporting:
        return
    # Reject conflicting/unknown evidence in the entire short window, even if
    # one candidate has the highest similarity. Blur never enters this window.
    if len(supporting) != len(evidence):
        return
    strong = [item for item in supporting if item.quality == 'GOOD'
              and item.sharpness >= settings.face_fast_sharpness
              and item.similarity is not None and item.similarity >= max(settings.face_fast_similarity, settings.face_recognition_threshold)
              and item.ambiguity_margin is not None and item.ambiguity_margin >= max(settings.face_fast_margin, settings.face_recognition_ambiguity_margin)]
    fast = (len(strong) == len(supporting) and len(strong) >= settings.face_fast_min_observations)
    minimum = settings.face_fast_min_observations if fast else settings.face_temporal_min_observations
    span = settings.face_fast_min_span_seconds if fast else settings.face_temporal_min_span_seconds
    if len(supporting) < minimum:
        return
    if supporting[-1].timestamp - supporting[0].timestamp < span:
        return
    best = sorted(supporting, key=lambda item: (item.quality == 'GOOD', item.sharpness), reverse=True)[:minimum]
    if any(item.similarity is None or item.similarity < settings.face_recognition_threshold for item in best):
        return
    track.verified_student_id = student_id
    track.verification_path = 'FAST' if fast else 'STANDARD'
    if track.verified_at is None:
        track.verified_at = now
    track.verified_until = now + settings.face_verified_hold_seconds
    track.state = 'ATTENDED' if student_id in track.attended_student_ids else 'VERIFIED'
