import pytest
import numpy as np
from app.config import settings
from app.services.face_tracking import FaceTrack
from app.services.face_liveness import update_liveness
from app.services.face_temporal import verify_observation
from face_sequences import natural_face


def track():
    return FaceTrack(1, (0, 0, .2, .3), 0, first_seen=0)


@pytest.mark.parametrize('moving_photo', [False, True])
def test_static_and_rigidly_moving_photo_never_live(moving_photo):
    item = track()
    for i in range(7):
        face = natural_face(0, offset=i * 2 if moving_photo else 0, scale=1 + i * .04 if moving_photo else 1)
        update_liveness(item, face, now=i * .3, quality_ok=True)
        assert item.liveness_state != 'LIVE'
    assert item.liveness_state == 'SPOOF_SUSPECTED'


def test_multiple_natural_signals_can_be_live_but_one_frame_cannot():
    item = track()
    update_liveness(item, natural_face(0), now=0, quality_ok=True)
    assert item.liveness_state == 'LIVENESS_PENDING'
    update_liveness(item, natural_face(1), now=.3, quality_ok=True)
    assert item.liveness_state == 'LIVENESS_PENDING'
    update_liveness(item, natural_face(2), now=.6, quality_ok=True)
    assert item.liveness_state == 'LIVE'
    update_liveness(item, natural_face(2), now=5, quality_ok=True)
    assert item.liveness_state == 'LIVENESS_PENDING'


def test_bad_quality_disabled_and_missing_landmarks_fail_closed(monkeypatch):
    item = track()
    for i in range(5):
        update_liveness(item, natural_face(i), now=i * .3, quality_ok=False)
    assert len(item.liveness_samples) == 0
    update_liveness(item, np.array([1, 2, 40, 50]), now=2, quality_ok=True)
    assert item.liveness_state == 'LIVENESS_PENDING'
    monkeypatch.setattr(settings, 'face_liveness_enabled', False)
    for i in range(5):
        update_liveness(item, natural_face(i), now=3 + i * .3, quality_ok=True)
    assert item.liveness_state == 'LIVENESS_PENDING'
    assert item.liveness_signals['reason'] == 'DISABLED_MANUAL_ONLY'


@pytest.mark.parametrize('sequence', [[0, 0, 3], [0, 2, 0, 2, 0], [0, 20, 40]])
def test_single_outlier_oscillating_jitter_and_implausible_motion_do_not_pass(sequence):
    item = track()
    for i, step in enumerate(sequence):
        update_liveness(item, natural_face(step), now=i * .3, quality_ok=True)
    assert item.liveness_state != 'LIVE'


def test_fast_path_needs_two_strong_frames_with_margin_and_quality():
    item = track()
    for now in [0, .4]:
        verify_observation(item, status='RECOGNIZED', student_id=1, similarity=.9,
                           quality='GOOD', sharpness=90, now=now, fresh=True, ambiguity_margin=.3)
        if now == 0:
            assert item.state == 'VERIFYING'
    assert item.state == 'VERIFIED'
    assert item.verification_path == 'FAST'
    assert item.verified_at == .4


@pytest.mark.parametrize(('quality', 'similarity', 'margin'), [('ACCEPTABLE', .9, .3), ('GOOD', .5, .3), ('GOOD', .9, .06)])
def test_medium_confidence_requires_more_evidence(quality, similarity, margin):
    item = track()
    for now in [0, .4]:
        verify_observation(item, status='RECOGNIZED', student_id=1, similarity=similarity,
                           quality=quality, sharpness=90, now=now, fresh=True, ambiguity_margin=margin)
    assert item.state == 'VERIFYING'
    verify_observation(item, status='RECOGNIZED', student_id=1, similarity=similarity,
                       quality=quality, sharpness=90, now=.8, fresh=True, ambiguity_margin=margin)
    assert item.state == 'VERIFIED'
    assert item.verification_path == 'STANDARD'
