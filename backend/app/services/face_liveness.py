"""Experimental passive motion check, NOT a trained presentation-attack detector.

Five YuNet points cannot reliably detect blinks, replay video or a moving/warped
photo. Fail closed when multiple temporal signals are absent. No image storage.
"""
import numpy as np
from ..config import settings
from .face_tracking import FaceTrack


def update_liveness(track: FaceTrack, face: np.ndarray, *, now: float, quality_ok: bool) -> None:
    previous_state = track.liveness_state
    track.liveness_state = 'LIVENESS_PENDING'
    if not settings.face_liveness_enabled:
        track.liveness_samples.clear()
        track.liveness_signals = {'reason': 'DISABLED_MANUAL_ONLY'}
        return
    samples = track.liveness_samples
    while samples and now - samples[0][0] > settings.face_liveness_window_seconds:
        samples.popleft()
    if not quality_ok or len(face) < 15 or not np.isfinite(face).all():
        track.liveness_signals = {'reason': 'INSUFFICIENT_QUALITY_OR_LANDMARKS'}
        return
    if samples and now - samples[-1][0] < 0.15:
        track.liveness_state = previous_state
        return
    points = np.asarray(face[4:14], dtype=np.float64).reshape(5, 2)
    eye_axis = points[1] - points[0]
    eye_distance = float(np.linalg.norm(eye_axis))
    if eye_distance < 8 or min(face[2:4]) <= 0:
        return
    # Remove image translation, scale and roll: moving a rigid photo must not
    # count as facial geometry change.
    axis = eye_axis / eye_distance
    rotation = np.array([axis, [-axis[1], axis[0]]])
    normalized = (points - (points[0] + points[1]) / 2) @ rotation.T / eye_distance
    pose = float(normalized[2, 0])
    geometry = float(np.linalg.norm(normalized[4] - normalized[3]))
    if abs(pose) > 0.7 or not 0.2 < geometry < 1.5:
        return
    samples.append((now, pose, geometry))
    if len(samples) < settings.face_liveness_min_observations:
        return
    elapsed = samples[-1][0] - samples[0][0]
    values = np.array([[s[1], s[2]] for s in samples])
    ranges = np.ptp(values, axis=0)
    steps = np.diff(values, axis=0)
    # Both pose and mouth/eye geometry must evolve coherently over at least
    # two transitions. A single twitch/outlier or uncorrelated jitter is weak.
    meaningful = (np.abs(steps[:, 0]) >= 0.005) & (np.abs(steps[:, 1]) >= 0.005)
    plausible = bool(np.all(np.abs(steps) < 0.18))
    coherent = False
    for i in range(1, len(steps)):
        if meaningful[i - 1] and meaningful[i] and np.all(steps[i - 1] * steps[i] > 0):
            coherent = True
    track.liveness_signals = {
        'samples': len(samples), 'span_ms': round(elapsed * 1000, 1),
        'pose_range': round(float(ranges[0]), 4), 'geometry_range': round(float(ranges[1]), 4),
        'coherent': coherent, 'plausible': plausible,
    }
    if (elapsed >= settings.face_liveness_min_span_seconds and plausible and coherent
            and ranges[0] >= settings.face_liveness_pose_range
            and ranges[1] >= settings.face_liveness_geometry_range):
        track.liveness_state = 'LIVE'
    elif elapsed >= settings.face_liveness_static_seconds and bool(np.all(ranges < 0.01)):
        track.liveness_state = 'SPOOF_SUSPECTED'
