import csv
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from scripts.evaluate_face_resolutions import (
    DatasetRecord,
    ProbeOutcome,
    _accept_match,
    _evaluate_image,
    _load_manifest,
    _paired_outcome_changes,
    _prepare_frame,
    _run_resolution,
    _summarize,
    evaluate_paired_resolutions,
)


def _record(role, subject, capture_id, path='unused.jpg', **conditions):
    return DatasetRecord(role, subject, capture_id, Path(path), **conditions)


def _write_manifest(root: Path, rows):
    root.mkdir()
    image_root = root / 'images'
    image_root.mkdir()
    manifest = root / 'manifest.csv'
    with manifest.open('w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(file, fieldnames=[
            'role', 'subject', 'capture_id', 'path', 'condition', 'face_size', 'distance', 'lighting', 'pose',
        ])
        writer.writeheader()
        for index, row in enumerate(rows):
            filename = f'{index}.jpg'
            (image_root / filename).write_bytes(row.pop('content', f'private-{index}'.encode()))
            writer.writerow({**row, 'path': f'images/{filename}'})
    return manifest, image_root


def test_manifest_rejects_capture_leakage_and_unknown_identity_overlap(tmp_path):
    rows = [
        {'role': 'enrolled', 'subject': 'opaque-a', 'capture_id': 'capture-1'},
        {'role': 'genuine', 'subject': 'opaque-a', 'capture_id': 'capture-1'},
        {'role': 'unknown', 'subject': 'opaque-b', 'capture_id': 'capture-2'},
    ]
    manifest, image_root = _write_manifest(tmp_path / 'capture-leak', rows)
    with pytest.raises(ValueError, match='distinct capture IDs'):
        _load_manifest(manifest, tmp_path / 'capture-leak')

    rows = [
        {'role': 'enrolled', 'subject': 'opaque-a', 'capture_id': 'enroll-1'},
        {'role': 'genuine', 'subject': 'opaque-a', 'capture_id': 'probe-1'},
        {'role': 'unknown', 'subject': 'opaque-a', 'capture_id': 'unknown-1'},
    ]
    manifest, _ = _write_manifest(tmp_path / 'identity-overlap', rows)
    with pytest.raises(ValueError, match='disjoint'):
        _load_manifest(manifest, tmp_path / 'identity-overlap')


def test_manifest_rejects_identical_image_content_across_roles(tmp_path):
    rows = [
        {'role': 'enrolled', 'subject': 'opaque-a', 'capture_id': 'enroll-1', 'content': b'same-image'},
        {'role': 'genuine', 'subject': 'opaque-a', 'capture_id': 'probe-1', 'content': b'same-image'},
        {'role': 'unknown', 'subject': 'opaque-b', 'capture_id': 'unknown-1', 'content': b'other-image'},
    ]
    manifest, _ = _write_manifest(tmp_path / 'duplicate-image', rows)
    with pytest.raises(ValueError, match='Identical image content'):
        _load_manifest(manifest, tmp_path / 'duplicate-image')


def test_manifest_rejects_free_text_condition_values(tmp_path):
    rows = [
        {'role': 'enrolled', 'subject': 'opaque-a', 'capture_id': 'enroll-1', 'face_size': 'large'},
        {'role': 'genuine', 'subject': 'opaque-a', 'capture_id': 'probe-1', 'distance': 'far'},
        {'role': 'unknown', 'subject': 'opaque-b', 'capture_id': 'unknown-1', 'lighting': 'student name'},
    ]
    manifest, _ = _write_manifest(tmp_path / 'unsafe-metadata', rows)
    with pytest.raises(ValueError, match='controlled categories'):
        _load_manifest(manifest, tmp_path / 'unsafe-metadata')


def test_manifest_allows_no_probe_role_so_rates_can_be_reported_as_na(tmp_path):
    from scripts.evaluate_face_resolutions import _validate_manifest

    image = tmp_path / 'enrollment.jpg'
    image.write_bytes(b'private fixture')
    _validate_manifest([
        _record('enrolled', 'opaque-a', 'enroll-1', str(image)),
    ])


def test_same_manifest_records_are_passed_to_both_resolution_runs():
    records = [
        _record('enrolled', 'opaque-known', 'enroll-1'),
        _record('genuine', 'opaque-known', 'probe-1', condition='indoor', distance='far', lighting='low'),
        _record('unknown', 'opaque-unknown', 'unknown-1'),
    ]
    seen = []

    def run_resolution(records_arg, **kwargs):
        seen.append((records_arg, kwargs['max_width'], kwargs['max_height'], kwargs['jpeg_quality']))
        width = kwargs['max_width']
        return [
            ProbeOutcome(record, 'QUALITY_ACCEPTED' if record.role == 'enrolled' else (
                'ACCEPTED' if width == 1280 else 'FACE_NOT_DETECTED'
            ))
            for record in records_arg
        ]

    settings = SimpleNamespace(face_recognition_threshold=0.363, face_recognition_ambiguity_margin=0.05)
    report = evaluate_paired_resolutions(
        records, jpeg_quality=82, cv2=None, face_engine=None,
        recognition_service=None, settings=settings, run_resolution=run_resolution,
    )
    assert seen == [(records, 1280, 720, 82), (records, 960, 540, 82)]
    assert report['paired_source_image_count'] == 3
    assert report['paired_outcome_change_1280_to_960']['paired_image_count'] == 3
    assert report['paired_outcome_change_1280_to_960']['paired_probe_count'] == 2
    assert report['paired_outcome_change_1280_to_960']['outcome_transitions']['ACCEPTED -> FACE_NOT_DETECTED'] == 2
    assert report['paired_outcome_change_1280_to_960']['outcome_transitions_by_role']['genuine']['ACCEPTED -> FACE_NOT_DETECTED'] == 1
    assert report['resolutions']['1280x720']['genuine_identification_rate'] == 1.0
    assert report['resolutions']['1280x720']['unknown_false_acceptance_rate'] == 1.0
    assert report['resolutions']['960x540']['genuine_false_rejection_rate'] == 1.0
    assert report['resolutions']['960x540']['unknown_false_acceptance_rate'] == 0.0
    assert report['resolutions']['960x540']['detection_success_rate_by_role']['genuine'] == 0.0
    assert report['condition_breakdown']['1280x720']['distance']['far']['probe_count'] == 1
    assert 'opaque-known' not in repr(report)
    assert 'unused.jpg' not in repr(report)


def test_paired_outcomes_match_internal_keys_not_list_order():
    records = [
        _record('genuine', 'opaque-a', 'probe-a'),
        _record('unknown', 'opaque-b', 'probe-b'),
    ]
    baseline = [
        ProbeOutcome(records[0], 'ACCEPTED'),
        ProbeOutcome(records[1], 'BELOW_THRESHOLD'),
    ]
    reduced = [
        ProbeOutcome(records[1], 'ACCEPTED'),
        ProbeOutcome(records[0], 'FACE_NOT_DETECTED'),
    ]
    paired = _paired_outcome_changes(baseline, reduced)
    assert paired['outcome_transitions_by_role']['genuine'] == {
        'ACCEPTED -> FACE_NOT_DETECTED': 1,
    }
    assert paired['outcome_transitions_by_role']['unknown'] == {
        'BELOW_THRESHOLD -> ACCEPTED': 1,
    }


def test_paired_runner_requires_one_outcome_for_every_manifest_record():
    records = [
        _record('enrolled', 'opaque-a', 'enroll-1'),
        _record('genuine', 'opaque-a', 'probe-1'),
    ]

    def incomplete_run(records_arg, **_kwargs):
        return [ProbeOutcome(records_arg[0], 'QUALITY_ACCEPTED')]

    settings = SimpleNamespace(face_recognition_threshold=0.363, face_recognition_ambiguity_margin=0.05)
    with pytest.raises(ValueError, match='exactly one outcome'):
        evaluate_paired_resolutions(
            records, jpeg_quality=82, cv2=None, face_engine=None,
            recognition_service=None, settings=settings, run_resolution=incomplete_run,
        )


def test_preprocessing_resizes_and_encodes_consistently_at_both_caps():
    source = np.zeros((1080, 1920, 3), dtype=np.uint8)

    class FakeCV2:
        INTER_AREA = 1
        IMWRITE_JPEG_QUALITY = 2
        IMREAD_COLOR = 3

        def __init__(self):
            self.encoded = []

        def resize(self, _frame, size, interpolation):
            assert interpolation == self.INTER_AREA
            return np.zeros((size[1], size[0], 3), dtype=np.uint8)

        def imencode(self, _ext, frame, params):
            self.encoded.append((frame.shape[1], frame.shape[0], params))
            return True, frame

        def imdecode(self, encoded, _mode):
            return encoded

    cv2 = FakeCV2()
    large = _prepare_frame(source, max_width=1280, max_height=720, jpeg_quality=82, cv2=cv2)
    small = _prepare_frame(source, max_width=960, max_height=540, jpeg_quality=82, cv2=cv2)
    assert large.shape == (720, 1280, 3)
    assert small.shape == (540, 960, 3)
    assert cv2.encoded == [
        (1280, 720, [cv2.IMWRITE_JPEG_QUALITY, 82]),
        (960, 540, [cv2.IMWRITE_JPEG_QUALITY, 82]),
    ]


def test_detection_failure_is_preserved_as_an_outcome(tmp_path):
    class FakeCV2:
        IMREAD_COLOR = 1
        IMWRITE_JPEG_QUALITY = 2

        def imread(self, _path, _mode):
            return np.zeros((100, 100, 3), dtype=np.uint8)

        def imencode(self, *_args):
            return True, b'jpeg'

        def imdecode(self, *_args):
            return np.zeros((100, 100, 3), dtype=np.uint8)

    class FakeEngine:
        def detect_faces(self, _frame):
            return []

    status, embedding = _evaluate_image(
        _record('genuine', 'opaque-a', 'probe-1', str(tmp_path / 'image.jpg')),
        max_width=1280, max_height=720, jpeg_quality=82,
        cv2=FakeCV2(), face_engine=FakeEngine(),
    )
    assert status == 'FACE_NOT_DETECTED'
    assert embedding is None


def test_unreadable_probe_is_explicit_and_reported_outside_valid_probe_metrics(tmp_path):
    class FakeCV2:
        IMREAD_COLOR = 1

        def imread(self, _path, _mode):
            return None

    status, embedding = _evaluate_image(
        _record('genuine', 'opaque-a', 'probe-1', str(tmp_path / 'corrupt.jpg')),
        max_width=1280, max_height=720, jpeg_quality=82,
        cv2=FakeCV2(), face_engine=None,
    )
    assert status == 'UNREADABLE_IMAGE'
    assert embedding is None

    summary = _summarize([
        ProbeOutcome(_record('genuine', 'opaque-a', 'p1'), 'UNREADABLE_IMAGE'),
        ProbeOutcome(_record('genuine', 'opaque-a', 'p2'), 'FACE_NOT_DETECTED'),
        ProbeOutcome(_record('genuine', 'opaque-a', 'p3'), 'QUALITY_TOO_SMALL'),
        ProbeOutcome(_record('genuine', 'opaque-a', 'p4'), 'ACCEPTED'),
    ])
    assert summary['scheduled_probe_count_by_role']['genuine'] == 4
    assert summary['source_load_failures_by_role']['genuine'] == 1
    assert summary['valid_loaded_probe_count_by_role']['genuine'] == 3
    assert summary['detection_success_rate_by_role']['genuine'] == 0.6667
    assert summary['genuine_identification_rate'] == 0.3333
    assert summary['genuine_scheduled_identification_rate'] == 0.25


def test_incomplete_enrollment_is_an_explicit_failure_and_rates_handle_na(monkeypatch):
    from scripts import evaluate_face_resolutions as evaluator

    records = [
        _record('enrolled', 'opaque-a', 'enroll-1'),
        _record('genuine', 'opaque-a', 'probe-1'),
    ]

    def fake_evaluate_image(record, **_kwargs):
        if record.role == 'enrolled':
            return 'QUALITY_TOO_SMALL', None
        return 'QUALITY_ACCEPTED', np.array([1.0, 0.0], dtype=np.float32)

    monkeypatch.setattr(evaluator, '_evaluate_image', fake_evaluate_image)
    outcomes = _run_resolution(
        records, max_width=1280, max_height=720, jpeg_quality=82,
        cv2=None, face_engine=SimpleNamespace(normalize_embedding=lambda value: value),
        recognition_service=None, settings=SimpleNamespace(),
    )
    summary = _summarize(outcomes)
    assert summary['outcomes_by_role']['genuine'] == {'NO_ENROLLMENT_REFERENCE': 1}
    assert summary['genuine_identification_rate'] == 0.0
    assert summary['genuine_false_rejection_rate'] == 1.0
    assert summary['unknown_false_acceptance_rate'] is None
    assert summary['quality_acceptance_rate_by_role']['unknown'] is None
    assert summary['enrollment_subject_count'] == 1
    assert summary['complete_enrollment_subject_count'] == 0
    assert summary['incomplete_enrollment_subject_count'] == 1
    assert summary['genuine_missing_expected_enrollment_reference_count'] == 1


def test_stage_rates_use_stage_specific_denominators_and_count_failures():
    outcomes = [
        ProbeOutcome(_record('genuine', 'opaque-a', 'p1'), 'FACE_NOT_DETECTED'),
        ProbeOutcome(_record('genuine', 'opaque-a', 'p2'), 'QUALITY_TOO_SMALL'),
        ProbeOutcome(_record('genuine', 'opaque-a', 'p3'), 'EMBEDDING_FAILED'),
        ProbeOutcome(_record('genuine', 'opaque-a', 'p4'), 'BELOW_THRESHOLD'),
        ProbeOutcome(_record('unknown', 'opaque-b', 'u1'), 'FACE_NOT_DETECTED'),
        ProbeOutcome(_record('unknown', 'opaque-b', 'u2'), 'ACCEPTED'),
    ]
    summary = _summarize(outcomes)
    assert summary['detection_success_rate_by_role']['genuine'] == 0.75
    assert summary['quality_evaluated_count_by_role']['genuine'] == 3
    assert summary['quality_acceptance_rate_by_role']['genuine'] == 0.6667
    assert summary['embedding_attempt_count_by_role']['genuine'] == 2
    assert summary['embedding_success_rate_by_role']['genuine'] == 0.5
    assert summary['genuine_identification_rate'] == 0.0
    assert summary['genuine_false_rejection_rate'] == 1.0
    assert summary['unknown_false_acceptance_rate'] == 0.5
    assert summary['unknown_matching_attempt_count'] == 1
    assert summary['unknown_false_acceptance_rate_when_matching'] == 1.0


def test_quality_assessment_failure_is_not_counted_as_quality_rejection():
    summary = _summarize([
        ProbeOutcome(_record('genuine', 'opaque-a', 'p1'), 'QUALITY_ASSESSMENT_FAILED'),
        ProbeOutcome(_record('genuine', 'opaque-a', 'p2'), 'QUALITY_TOO_SMALL'),
    ])
    assert summary['quality_assessment_failures_by_role']['genuine'] == 1
    assert summary['quality_evaluated_count_by_role']['genuine'] == 1
    assert summary['quality_acceptance_rate_by_role']['genuine'] == 0.0


def test_unknown_far_uses_loaded_probes_and_separates_matching_conditional_rate():
    summary = _summarize([
        ProbeOutcome(_record('unknown', 'opaque-b', 'u1'), 'UNREADABLE_IMAGE'),
        ProbeOutcome(_record('unknown', 'opaque-c', 'u2'), 'QUALITY_TOO_SMALL'),
        ProbeOutcome(_record('unknown', 'opaque-d', 'u3'), 'BELOW_THRESHOLD'),
        ProbeOutcome(_record('unknown', 'opaque-e', 'u4'), 'AMBIGUOUS'),
        ProbeOutcome(_record('unknown', 'opaque-f', 'u5'), 'ACCEPTED'),
        ProbeOutcome(_record('unknown', 'opaque-g', 'u6'), 'MATCHING_FAILED'),
    ])
    assert summary['scheduled_probe_count_by_role']['unknown'] == 6
    assert summary['valid_loaded_probe_count_by_role']['unknown'] == 5
    assert summary['unknown_false_acceptances'] == 1
    assert summary['unknown_false_acceptance_rate'] == 0.2
    assert summary['unknown_scheduled_false_acceptance_rate'] == 0.1667
    assert summary['unknown_matching_attempt_count'] == 4
    assert summary['unknown_false_acceptance_rate_when_matching'] == 0.25


def test_absent_genuine_and_unknown_probes_report_na():
    summary = _summarize([
        ProbeOutcome(_record('enrolled', 'opaque-a', 'e1'), 'QUALITY_ACCEPTED', enrollment_ready=True),
    ])
    assert summary['genuine_identification_rate'] is None
    assert summary['genuine_false_rejection_rate'] is None
    assert summary['genuine_scheduled_identification_rate'] is None
    assert summary['unknown_false_acceptance_rate'] is None
    assert summary['unknown_false_acceptance_rate_when_matching'] is None
    assert summary['detection_success_rate_by_role']['unknown'] is None
    assert summary['quality_acceptance_rate_by_role']['unknown'] is None


def test_matching_uses_configured_threshold_and_reports_no_candidate():
    engine = SimpleNamespace(normalize_embedding=lambda value: value)
    settings = SimpleNamespace(face_recognition_threshold=0.9, face_recognition_ambiguity_margin=0.05)

    class FakeMatcher:
        @staticmethod
        def find_best_match(_query, labels, _matrix):
            return labels[0], 0.8, None

    assert _accept_match(
        np.array([1.0]), {'opaque-a': [np.array([1.0])]},
        face_engine=engine, recognition_service=FakeMatcher, settings=settings,
    ) == ('BELOW_THRESHOLD', None)
    assert _accept_match(
        np.array([1.0]), {},
        face_engine=engine, recognition_service=FakeMatcher, settings=settings,
    ) == ('NO_ENROLLMENT_REFERENCE', None)


def test_unpaired_image_outcomes_are_rejected():
    baseline = [ProbeOutcome(_record('genuine', 'opaque-a', 'probe-1'), 'ACCEPTED')]
    reduced = [ProbeOutcome(_record('genuine', 'opaque-a', 'probe-2'), 'ACCEPTED')]
    with pytest.raises(ValueError, match='same dataset records'):
        _paired_outcome_changes(baseline, reduced)
