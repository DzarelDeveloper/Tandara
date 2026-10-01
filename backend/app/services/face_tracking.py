from __future__ import annotations

import math
from dataclasses import dataclass, field
from collections import deque


Box = tuple[float, float, float, float]


@dataclass(frozen=True)
class FaceObservation:
    student_id: int | None
    similarity: float | None
    quality: str
    sharpness: float
    timestamp: float
    ambiguity_margin: float | None = None


OBSERVATION_BUFFER_HARD_LIMIT = 24
OBSERVATION_BUFFER_TARGET_SIZE = 12
LIVENESS_BUFFER_LIMIT = 24


def _rank_observation_key(obs: FaceObservation) -> tuple:
    quality_rank = 2 if obs.quality == 'GOOD' else 1 if obs.quality == 'ACCEPTABLE' else 0
    similarity_rank = obs.similarity if obs.similarity is not None else -1.0
    ambiguity_rank = obs.ambiguity_margin if obs.ambiguity_margin is not None else -1.0
    return (quality_rank, similarity_rank, ambiguity_rank, obs.sharpness)


@dataclass
class FaceTrack:
    track_id: int
    box: Box
    last_seen: float
    recognition_status: str | None = None
    student_id: int | None = None
    similarity: float | None = None
    cache_expires_at: float = 0.0
    attendance_attempted: bool = False
    state: str = 'TRACKING'
    observations: deque[FaceObservation] = field(default_factory=lambda: deque(maxlen=OBSERVATION_BUFFER_HARD_LIMIT))
    verified_student_id: int | None = None
    evidence_count: int = 0
    consecutive_temporal_misses: int = 0
    attended_student_ids: set[int] = field(default_factory=set)
    attendance_retry_at: float = 0.0
    first_seen: float | None = None
    verified_at: float | None = None
    verified_until: float = 0.0
    verification_path: str = 'STANDARD'
    liveness_state: str = 'LIVENESS_PENDING'
    liveness_samples: deque = field(default_factory=lambda: deque(maxlen=LIVENESS_BUFFER_LIMIT))
    liveness_signals: dict = field(default_factory=dict)

    def compact_observations(self, *, now: float, window: float, target_size: int = OBSERVATION_BUFFER_TARGET_SIZE) -> None:
        while self.observations and now - self.observations[0].timestamp > window:
            self.observations.popleft()
        if len(self.observations) <= target_size:
            return
        ranked = sorted(self.observations, key=_rank_observation_key, reverse=True)
        keep_ids = {id(obs) for obs in ranked[:target_size]}
        preserved: list[FaceObservation] = []
        for obs in self.observations:
            if id(obs) in keep_ids:
                preserved.append(obs)
        self.observations.clear()
        for obs in preserved:
            self.observations.append(obs)

    def break_continuity(self, *, clear_evidence: bool = False, clear_liveness: bool = True) -> None:
        self.cache_expires_at = 0.0
        self.verified_until = 0.0
        self.verified_student_id = None
        self.state = 'VERIFYING' if self.observations else 'TRACKING'
        if clear_liveness:
            self.liveness_state = 'LIVENESS_PENDING'
            self.liveness_samples.clear()
        if clear_evidence:
            self.observations.clear()
            self.evidence_count = 0
            self.consecutive_temporal_misses = 0


class LightweightFaceTracker:
    def __init__(self, *, ttl_seconds: float = 2.25) -> None:
        self.ttl_seconds = ttl_seconds
        self._next_track_id = 1
        self._tracks: dict[int, FaceTrack] = {}
        self.last_used = 0.0

    @staticmethod
    def _iou(left: Box, right: Box) -> float:
        left_x, left_y, left_w, left_h = left
        right_x, right_y, right_w, right_h = right
        intersection_w = max(0.0, min(left_x + left_w, right_x + right_w) - max(left_x, right_x))
        intersection_h = max(0.0, min(left_y + left_h, right_y + right_h) - max(left_y, right_y))
        intersection = intersection_w * intersection_h
        union = left_w * left_h + right_w * right_h - intersection
        return intersection / union if union > 0.0 else 0.0

    @staticmethod
    def _center_distance(left: Box, right: Box) -> float:
        left_x, left_y, left_w, left_h = left
        right_x, right_y, right_w, right_h = right
        return math.hypot(left_x + left_w / 2.0 - right_x - right_w / 2.0, left_y + left_h / 2.0 - right_y - right_h / 2.0)

    def update(self, boxes: list[Box], *, now: float) -> list[FaceTrack]:
        self.last_used = now
        expired = [track_id for track_id, track in self._tracks.items() if now - track.last_seen > self.ttl_seconds]
        for track_id in expired:
            del self._tracks[track_id]

        candidates: list[tuple[float, int, int]] = []
        for detection_index, box in enumerate(boxes):
            for track_id, track in self._tracks.items():
                overlap = self._iou(track.box, box)
                distance = self._center_distance(track.box, box)
                scale = max(math.hypot(track.box[2], track.box[3]), math.hypot(box[2], box[3]), 0.035)
                if overlap >= 0.08 or distance <= scale * 1.25:
                    proximity = max(0.0, 1.0 - distance / (scale * 1.25))
                    candidates.append((overlap + proximity * 0.15, detection_index, track_id))

        matches: dict[int, int] = {}
        match_scores: dict[int, float] = {}
        used_tracks: set[int] = set()
        for score, detection_index, track_id in sorted(candidates, reverse=True):
            if detection_index not in matches and track_id not in used_tracks:
                matches[detection_index] = track_id
                match_scores[detection_index] = score
                used_tracks.add(track_id)

        result: list[FaceTrack] = []
        # Keep the track ID through brief occlusion, but drop cached identity/verification
        # when it returns so an entrant cannot inherit a missing face's identity.
        for track_id, track in self._tracks.items():
            if track_id not in used_tracks:
                track.break_continuity(clear_evidence=False, clear_liveness=False)
        for detection_index, box in enumerate(boxes):
            track_id = matches.get(detection_index)
            if track_id is None:
                track_id = self._next_track_id
                self._next_track_id += 1
                track = FaceTrack(track_id=track_id, box=box, last_seen=now, first_seen=now)
                self._tracks[track_id] = track
            else:
                track = self._tracks[track_id]
                iou = self._iou(track.box, box)
                bw, bh = max(box[2], 0.01), max(box[3], 0.01)
                distance = self._center_distance(track.box, box)
                normalized_distance = distance / max(math.hypot(bw, bh), 0.035)
                uncertain = any(abs(score - match_scores[detection_index]) < 0.08
                                and ((di == detection_index and ti != track_id) or (ti == track_id and di != detection_index))
                                for score, di, ti in candidates)
                if uncertain:
                    track.break_continuity(clear_evidence=False)
                elif iou < 0.08 and normalized_distance > 0.75:
                    # Large jump + no overlap: treat as a new entrant with the same slot.
                    # Evidence from an unrelated previously-tracked person must not leak.
                    track.break_continuity(clear_evidence=True)
                elif iou < 0.18 and track.verified_until <= 0:
                    # Low overlap while unverified is fine for walk-through; keep evidence.
                    # Just drop the short-term recognition cache so re-identification runs.
                    track.break_continuity(clear_evidence=False, clear_liveness=False)
                elif iou < 0.18 and track.verified_until > 0 and normalized_distance > 0.45:
                    # Previously verified but the box drifted enough to be suspicious.
                    # Clear the verified identity but preserve observations for re-verification
                    # from the collected best frames (walk-through safety).
                    track.break_continuity(clear_evidence=False)
                track.box = box
                track.last_seen = now
            result.append(track)
        return result

    def get_track(self, track_id: int) -> FaceTrack | None:
        return self._tracks.get(track_id)
