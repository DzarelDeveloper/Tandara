"""Short, bounded evidence history. Cached recognition never becomes new evidence."""
from ..config import settings
from .face_tracking import FaceObservation, FaceTrack


def _rank_supporting(item: FaceObservation) -> tuple:
    quality_rank = 2 if item.quality == 'GOOD' else 1 if item.quality == 'ACCEPTABLE' else 0
    sim = item.similarity if item.similarity is not None else -1.0
    amb = item.ambiguity_margin if item.ambiguity_margin is not None else -1.0
    return (quality_rank, sim, amb, item.sharpness)


def _is_strong_fast_observation(item: FaceObservation) -> bool:
    return (
        item.quality == 'GOOD'
        and item.sharpness >= settings.face_fast_sharpness
        and item.similarity is not None
        and item.similarity >= max(settings.face_fast_similarity, settings.face_recognition_threshold)
        and item.ambiguity_margin is not None
        and item.ambiguity_margin >= max(settings.face_fast_margin, settings.face_recognition_ambiguity_margin)
    )


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
        if status == 'RECOGNIZED' and student_id is not None:
            if any(item.student_id is not None and item.student_id != student_id for item in track.observations):
                track.observations.clear()
                track.evidence_count = 0
                track.verified_student_id = None
            track.consecutive_temporal_misses = 0
            track.observations.append(FaceObservation(student_id, similarity, quality, sharpness, now, ambiguity_margin))
        elif status in ('UNKNOWN_FACE', 'AMBIGUOUS_FACE', 'NO_ENROLLED_FACES'):
            track.consecutive_temporal_misses += 1
            if track.consecutive_temporal_misses > 1:
                track.observations.clear()
                track.evidence_count = 0
                track.verified_student_id = None
                track.consecutive_temporal_misses = 0
        else:
            track.consecutive_temporal_misses = 0
        try:
            track.compact_observations(now=now, window=settings.face_temporal_window_seconds)
        except Exception:
            pass

    if not fresh:
        return

    evidence = list(track.observations)
    supporting = [item for item in evidence if student_id is not None and item.student_id == student_id]
    track.evidence_count = len(supporting)
    track.verified_student_id = None
    if status in ('UNKNOWN_FACE', 'AMBIGUOUS_FACE', 'NO_ENROLLED_FACES'):
        track.state = 'UNKNOWN'
        return
    track.state = 'VERIFYING' if evidence else 'TRACKING'
    if status != 'RECOGNIZED' or not supporting:
        return
    # Reject conflicting/unknown evidence in the entire short window, even if
    # one candidate has the highest similarity. Blur never enters this window.
    if len(supporting) != len(evidence):
        return
    ranked_supporting = sorted(supporting, key=_rank_supporting, reverse=True)
    strong_count = sum(1 for item in ranked_supporting if _is_strong_fast_observation(item))
    top_count_for_fast = min(settings.face_fast_min_observations, len(ranked_supporting))
    top_strong_all = top_count_for_fast >= settings.face_fast_min_observations and all(
        _is_strong_fast_observation(item) for item in ranked_supporting[:top_count_for_fast]
    )
    fast = top_strong_all and strong_count >= settings.face_fast_min_observations
    minimum = settings.face_fast_min_observations if fast else settings.face_temporal_min_observations
    span = settings.face_fast_min_span_seconds if fast else settings.face_temporal_min_span_seconds
    if len(supporting) < minimum:
        return
    ordered = sorted(supporting, key=lambda item: item.timestamp)
    if ordered[-1].timestamp - ordered[0].timestamp < span:
        return
    best = ranked_supporting[:minimum]
    if any(item.similarity is None or item.similarity < settings.face_recognition_threshold for item in best):
        return
    track.verified_student_id = student_id
    track.verification_path = 'FAST' if fast else 'STANDARD'
    if track.verified_at is None:
        track.verified_at = now
    track.verified_until = now + settings.face_verified_hold_seconds
    track.state = 'ATTENDED' if student_id in track.attended_student_ids else 'VERIFIED'
