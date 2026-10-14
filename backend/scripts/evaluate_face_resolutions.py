"""Paired offline YuNet/SFace resolution evaluation.

Dataset must remain local and authorized. Use a private CSV manifest with columns:
role,subject,capture_id,path[,condition,face_size,distance,lighting,pose]
where role is enrolled, genuine, or unknown. Subject and capture_id are local
anonymous labels. Each genuine subject must have separate capture_id values for
enrollment and probe; each enrollment must include at least the configured
minimum number of quality-accepted captures. Unknown labels must be disjoint
from enrolled labels.
Optional metadata values are controlled categories: condition=controlled|field,
face_size=large|medium|small, distance=near|medium|far,
lighting=bright|normal|low, pose=frontal|moderate|profile. The same manifest and
source image are evaluated at both resolution caps.
Only aggregate counts/rates are printed. Static images cannot evaluate liveness.

Metric definitions (per role unless noted):
- Detection success = images with >=1 detected face / source images decoded by
  OpenCV. Failed source-image loads are excluded here and reported separately;
  resize/JPEG/detector failures remain denominator failures.
- Quality acceptance = accepted quality assessments / completed assessments.
  Quality-assessment exceptions are reported separately, not as rejections.
- Embedding success = successful embeddings / actual embedding attempts.
- Genuine identification and FRR use all loadable genuine probes as denominator;
  failures after loading, including no face, quality rejection, embedding failure,
  missing enrollment references, and matching failure, are non-identifications.
  Genuine identification = correct accepted IDs / valid loaded genuine probes;
  FRR = 1 - genuine identification and therefore also counts wrong-identity
  acceptances as failures, which are reported separately.
  Source-load failures are reported separately and also included in a scheduled
  identification rate over all manifest genuine probes.
- Unknown end-to-end FAR = accepted unknown probes / all loadable unknown probes.
  Source-load failures are excluded and reported separately. Conditional FAR
  uses only unknown probes whose matcher was actually invoked, including a
  matcher error, and never counts a technical failure as a false acceptance.
- Paired transitions match by (role, subject, capture_id), never list position.

Outcome-to-stage map:
  UNREADABLE_IMAGE / IMAGE_DECODE_FAILED: image loading failed.
  RESIZE_FAILED / JPEG_ENCODE_FAILED / JPEG_DECODE_FAILED: loaded image,
    preprocessing failed before face detection.
  DETECTION_FAILED / FACE_NOT_DETECTED: detection attempted, no valid detection.
  MULTIPLE_FACES: detection succeeded; quality and recognition are skipped.
  QUALITY_ASSESSMENT_FAILED: quality attempted but no decision was produced.
  QUALITY_<status> (except QUALITY_ASSESSMENT_FAILED): quality rejected.
  EMBEDDING_FAILED: quality accepted, embedding attempted and failed.
  QUALITY_ACCEPTED: quality and embedding succeeded for an enrollment image.
  NO_ENROLLMENT_REFERENCE: probe embedding succeeded; no complete enrollment set.
  MATCHING_FAILED: probe embedding succeeded; matching attempted and failed.
  BELOW_THRESHOLD / AMBIGUOUS: matching completed and rejected.
  ACCEPTED / WRONG_IDENTITY_ACCEPTED: matching accepted; the latter is a
    genuine probe accepted as a different enrolled subject.
  Genuine probes also carry an internal expected_enrollment_ready flag;
    aggregate missing-reference counts are reported without subject labels.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Any, Callable

import numpy as np

IMAGE_SUFFIXES = {'.jpg', '.jpeg', '.png', '.webp'}
RESOLUTIONS = ((1280, 720), (960, 540))
ROLES = {'enrolled', 'genuine', 'unknown'}
SOURCE_LOAD_FAILURES = {'UNREADABLE_IMAGE', 'IMAGE_DECODE_FAILED'}
PRE_DETECTION_FAILURES = SOURCE_LOAD_FAILURES | {
    'JPEG_ENCODE_FAILED', 'JPEG_DECODE_FAILED', 'RESIZE_FAILED', 'DETECTION_FAILED',
    'FACE_NOT_DETECTED',
}
QUALITY_ASSESSMENT_FAILURES = {'QUALITY_ASSESSMENT_FAILED'}
QUALITY_REJECTION_PREFIX = 'QUALITY_'
QUALITY_PASS_OUTCOMES = {
    'QUALITY_ACCEPTED', 'EMBEDDING_FAILED', 'NO_ENROLLMENT_REFERENCE',
    'MATCHING_FAILED', 'BELOW_THRESHOLD', 'AMBIGUOUS', 'ACCEPTED',
    'WRONG_IDENTITY_ACCEPTED',
}
EMBEDDING_OUTCOMES = QUALITY_PASS_OUTCOMES
MATCHING_ATTEMPT_OUTCOMES = {
    'MATCHING_FAILED', 'BELOW_THRESHOLD', 'AMBIGUOUS', 'ACCEPTED',
    'WRONG_IDENTITY_ACCEPTED',
}
CONDITION_FIELDS = ('condition', 'face_size', 'distance', 'lighting', 'pose')
CONDITION_VALUES = {
    'condition': {'controlled', 'field'},
    'face_size': {'large', 'medium', 'small'},
    'distance': {'near', 'medium', 'far'},
    'lighting': {'bright', 'normal', 'low'},
    'pose': {'frontal', 'moderate', 'profile'},
}


@dataclass(frozen=True)
class DatasetRecord:
    role: str
    subject: str
    capture_id: str
    path: Path
    condition: str | None = None
    face_size: str | None = None
    distance: str | None = None
    lighting: str | None = None
    pose: str | None = None


@dataclass(frozen=True)
class ProbeOutcome:
    record: DatasetRecord
    status: str
    predicted_subject: str | None = None
    enrollment_ready: bool | None = None
    expected_enrollment_ready: bool | None = None


def _percent(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 4) if denominator else None


def _median(values: list[float]) -> float | None:
    return round(float(median(values)), 4) if values else None


def _load_manifest(manifest_path: Path, dataset_root: Path) -> list[DatasetRecord]:
    if not manifest_path.is_file() or manifest_path.is_symlink():
        raise ValueError('Manifest must be a regular local file.')
    if not dataset_root.is_dir() or dataset_root.is_symlink():
        raise ValueError('Dataset root must be a regular local directory.')

    records: list[DatasetRecord] = []
    with manifest_path.open(newline='', encoding='utf-8-sig') as file:
        reader = csv.DictReader(file)
        required = {'role', 'subject', 'capture_id', 'path'}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise ValueError('Manifest must include role, subject, capture_id, and path columns.')
        for row in reader:
            role = (row.get('role') or '').strip().lower()
            subject = (row.get('subject') or '').strip()
            capture_id = (row.get('capture_id') or '').strip()
            relative_path = (row.get('path') or '').strip()
            if role not in ROLES or not subject or not capture_id or not relative_path:
                raise ValueError('Manifest contains a row with an invalid role or empty label/path.')
            relative = Path(relative_path)
            if relative.is_absolute():
                raise ValueError('Manifest paths must be relative to dataset root.')
            cursor = dataset_root
            for component in relative.parts:
                cursor = cursor / component
                if cursor.is_symlink():
                    raise ValueError('Manifest image paths cannot traverse symlinks.')
            path = (dataset_root / relative).resolve()
            if not path.is_relative_to(dataset_root.resolve()) or not path.is_file():
                raise ValueError('Manifest references a missing or out-of-root image.')
            if path.suffix.lower() not in IMAGE_SUFFIXES:
                raise ValueError('Manifest contains an unsupported image type.')
            metadata = {field: (row.get(field) or '').strip().lower() or None for field in CONDITION_FIELDS}
            if any(value is not None and value not in CONDITION_VALUES[field]
                   for field, value in metadata.items()):
                raise ValueError('Manifest condition metadata must use documented controlled categories.')
            records.append(DatasetRecord(
                role=role,
                subject=subject,
                capture_id=capture_id,
                path=path,
                **metadata,
            ))
    _validate_manifest(records)
    return records


def _validate_manifest(records: list[DatasetRecord]) -> None:
    if not records:
        raise ValueError('Manifest contains no image rows.')
    keys = [(record.role, record.subject, record.capture_id) for record in records]
    if len(keys) != len(set(keys)):
        raise ValueError('Manifest repeats a role/subject/capture_id tuple.')
    enrolled_subjects = {record.subject for record in records if record.role == 'enrolled'}
    genuine_subjects = {record.subject for record in records if record.role == 'genuine'}
    unknown_subjects = {record.subject for record in records if record.role == 'unknown'}
    if not enrolled_subjects:
        raise ValueError('At least one enrolled capture is required.')
    if not genuine_subjects.issubset(enrolled_subjects):
        raise ValueError('Every genuine probe subject must have enrollment captures.')
    if enrolled_subjects & unknown_subjects:
        raise ValueError('Unknown probe labels must be disjoint from enrolled subjects.')

    enrolled_captures = {
        (record.subject, record.capture_id)
        for record in records if record.role == 'enrolled'
    }
    genuine_captures = {
        (record.subject, record.capture_id)
        for record in records if record.role == 'genuine'
    }
    if enrolled_captures & genuine_captures:
        raise ValueError('Enrollment and genuine probes must use distinct capture IDs per subject.')

    content_hashes: set[str] = set()
    for record in records:
        digest = hashlib.sha256()
        with record.path.open('rb') as image_file:
            for chunk in iter(lambda: image_file.read(1024 * 1024), b''):
                digest.update(chunk)
        if digest.hexdigest() in content_hashes:
            raise ValueError('Identical image content appears more than once in the manifest.')
        content_hashes.add(digest.hexdigest())


def _prepare_frame(
    source: np.ndarray,
    *,
    max_width: int,
    max_height: int,
    jpeg_quality: int,
    cv2: Any,
) -> np.ndarray:
    source_height, source_width = source.shape[:2]
    scale = min(1.0, max_width / source_width, max_height / source_height)
    width = max(1, round(source_width * scale))
    height = max(1, round(source_height * scale))
    cv_error = getattr(cv2, 'error', RuntimeError)
    try:
        frame = source if (width, height) == (source_width, source_height) else cv2.resize(
            source, (width, height), interpolation=cv2.INTER_AREA,
        )
    except (RuntimeError, ValueError, cv_error) as exc:
        raise ValueError('RESIZE_FAILED') from exc
    try:
        encoded_ok, encoded = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
    except (RuntimeError, ValueError, cv_error) as exc:
        raise ValueError('JPEG_ENCODE_FAILED') from exc
    if not encoded_ok:
        raise ValueError('JPEG_ENCODE_FAILED')
    try:
        decoded = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    except (RuntimeError, ValueError, cv_error) as exc:
        raise ValueError('JPEG_DECODE_FAILED') from exc
    if decoded is None:
        raise ValueError('JPEG_DECODE_FAILED')
    return decoded


def _evaluate_image(
    record: DatasetRecord,
    *,
    max_width: int,
    max_height: int,
    jpeg_quality: int,
    cv2: Any,
    face_engine: Any,
) -> tuple[str, np.ndarray | None]:
    cv_error = getattr(cv2, 'error', RuntimeError)
    try:
        source = cv2.imread(str(record.path), cv2.IMREAD_COLOR)
    except (OSError, RuntimeError, cv_error):
        return 'IMAGE_DECODE_FAILED', None
    if source is None:
        return 'UNREADABLE_IMAGE', None
    try:
        frame = _prepare_frame(
            source, max_width=max_width, max_height=max_height,
            jpeg_quality=jpeg_quality, cv2=cv2,
        )
    except ValueError as exc:
        return str(exc), None
    try:
        faces = face_engine.detect_faces(frame)
    except (RuntimeError, ValueError, cv_error):
        return 'DETECTION_FAILED', None
    if not faces:
        return 'FACE_NOT_DETECTED', None
    if len(faces) != 1:
        return 'MULTIPLE_FACES', None
    try:
        assessment = face_engine.evaluate_quality(frame, faces[0])
    except (RuntimeError, ValueError, cv_error):
        return 'QUALITY_ASSESSMENT_FAILED', None
    if not assessment.is_acceptable:
        return f'QUALITY_{assessment.status}', None
    try:
        return 'QUALITY_ACCEPTED', face_engine.extract_embedding(frame, faces[0])
    except (RuntimeError, ValueError, cv_error):
        return 'EMBEDDING_FAILED', None


def _accept_match(
    query: np.ndarray,
    enrolled: dict[str, list[np.ndarray]],
    *,
    face_engine: Any,
    recognition_service: Any,
    settings: Any,
) -> tuple[str, str | None]:
    labels = sorted(enrolled)
    if not labels:
        return 'NO_ENROLLMENT_REFERENCE', None
    try:
        centers = [
            face_engine.normalize_embedding(np.mean(np.stack(enrolled[label]), axis=0))
            for label in labels
        ]
        matrix = np.stack(centers).astype(np.float32, copy=False)
        predicted, similarity, second_similarity = recognition_service.find_best_match(query, labels, matrix)
    except (RuntimeError, ValueError):
        return 'MATCHING_FAILED', None
    if predicted is None or similarity is None:
        return 'MATCHING_FAILED', None
    if similarity < settings.face_recognition_threshold:
        return 'BELOW_THRESHOLD', None
    margin = similarity - second_similarity if second_similarity is not None else None
    if (
        second_similarity is not None
        and settings.face_recognition_ambiguity_margin > 0
        and margin is not None
        and margin < settings.face_recognition_ambiguity_margin
    ):
        return 'AMBIGUOUS', None
    return 'ACCEPTED', predicted


def _run_resolution(
    records: list[DatasetRecord],
    *,
    max_width: int,
    max_height: int,
    jpeg_quality: int,
    cv2: Any,
    face_engine: Any,
    recognition_service: Any,
    settings: Any,
) -> list[ProbeOutcome]:
    outcomes: dict[tuple[str, str, str], ProbeOutcome] = {}
    enrollment: dict[str, list[np.ndarray]] = defaultdict(list)
    for record in records:
        if record.role != 'enrolled':
            continue
        status, embedding = _evaluate_image(
            record, max_width=max_width, max_height=max_height,
            jpeg_quality=jpeg_quality, cv2=cv2, face_engine=face_engine,
        )
        outcomes[(record.role, record.subject, record.capture_id)] = ProbeOutcome(record, status)
        if embedding is not None:
            enrollment[record.subject].append(embedding)

    minimum_enrollment_captures = getattr(settings, 'face_min_samples', 3)
    complete_enrollment_subjects = {
        subject for subject, vectors in enrollment.items()
        if len(vectors) >= minimum_enrollment_captures
    }
    enrollment = {
        subject: vectors for subject, vectors in enrollment.items()
        if subject in complete_enrollment_subjects
    }
    for key, outcome in list(outcomes.items()):
        if outcome.record.role == 'enrolled':
            outcomes[key] = ProbeOutcome(
                outcome.record,
                outcome.status,
                enrollment_ready=outcome.record.subject in complete_enrollment_subjects,
            )

    for record in records:
        if record.role == 'enrolled':
            continue
        status, embedding = _evaluate_image(
            record, max_width=max_width, max_height=max_height,
            jpeg_quality=jpeg_quality, cv2=cv2, face_engine=face_engine,
        )
        if embedding is not None:
            status, predicted = _accept_match(
                embedding, enrollment, face_engine=face_engine,
                recognition_service=recognition_service, settings=settings,
            )
        else:
            predicted = None
        if status == 'ACCEPTED' and record.role == 'genuine' and predicted != record.subject:
            status = 'WRONG_IDENTITY_ACCEPTED'
        outcomes[(record.role, record.subject, record.capture_id)] = ProbeOutcome(
            record,
            status,
            predicted,
            expected_enrollment_ready=(
                record.subject in complete_enrollment_subjects if record.role == 'genuine' else None
            ),
        )
    return [outcomes[key] for key in sorted(outcomes)]


def _summarize(outcomes: list[ProbeOutcome]) -> dict[str, Any]:
    by_role: dict[str, list[ProbeOutcome]] = defaultdict(list)
    for outcome in outcomes:
        by_role[outcome.record.role].append(outcome)

    result: dict[str, Any] = {
        'image_count': len(outcomes),
        'subject_count': len({(item.record.role, item.record.subject) for item in outcomes}),
        'outcomes_by_role': {
            role: dict(sorted(Counter(item.status for item in by_role[role]).items()))
            for role in sorted(ROLES)
        },
        'scheduled_probe_count_by_role': {
            role: len(by_role[role]) if role in {'genuine', 'unknown'} else 0
            for role in sorted(ROLES)
        },
        'source_load_failures_by_role': {
            role: sum(item.status in SOURCE_LOAD_FAILURES for item in by_role[role])
            for role in sorted(ROLES)
        },
        'valid_loaded_probe_count_by_role': {
            role: sum(item.status not in SOURCE_LOAD_FAILURES for item in by_role[role])
            if role in {'genuine', 'unknown'} else 0
            for role in sorted(ROLES)
        },
        'pre_detection_failures_by_role': {},
        'quality_assessment_failures_by_role': {},
        'detection_success_rate_by_role': {},
        'quality_evaluated_count_by_role': {},
        'quality_acceptance_rate_by_role': {},
        'embedding_attempt_count_by_role': {},
        'embedding_success_rate_by_role': {},
        'genuine_identification_rate': None,
        'genuine_false_rejection_rate': None,
        'genuine_wrong_identity_acceptances': 0,
        'genuine_missing_expected_enrollment_reference_count': sum(
            item.expected_enrollment_ready is False for item in by_role['genuine']
        ),
        'unknown_false_acceptance_rate': None,
        'unknown_scheduled_false_acceptance_rate': None,
        'unknown_probe_count': len(by_role['unknown']),
        'enrollment_subject_count': len({item.record.subject for item in by_role['enrolled']}),
        'complete_enrollment_subject_count': len({
            item.record.subject for item in by_role['enrolled'] if item.enrollment_ready
        }),
        'incomplete_enrollment_subject_count': len({
            item.record.subject for item in by_role['enrolled']
            if item.enrollment_ready is False
        }),
        'liveness': 'N/A (static images do not contain temporal evidence)',
    }
    for role in ROLES:
        rows = by_role[role]
        loaded_rows = [item for item in rows if item.status not in SOURCE_LOAD_FAILURES]
        quality_assessed = [
            item for item in loaded_rows
            if (item.status.startswith(QUALITY_REJECTION_PREFIX)
                and item.status not in QUALITY_ASSESSMENT_FAILURES)
            or item.status in QUALITY_PASS_OUTCOMES
        ]
        embedding_attempts = [item for item in loaded_rows if item.status in EMBEDDING_OUTCOMES]
        result['pre_detection_failures_by_role'][role] = sum(
            item.status in PRE_DETECTION_FAILURES for item in rows
        )
        result['quality_assessment_failures_by_role'][role] = sum(
            item.status in QUALITY_ASSESSMENT_FAILURES for item in rows
        )
        if rows:
            result['detection_success_rate_by_role'][role] = _percent(
                sum(item.status not in PRE_DETECTION_FAILURES for item in loaded_rows),
                len(loaded_rows),
            )
            result['quality_evaluated_count_by_role'][role] = len(quality_assessed)
            result['quality_acceptance_rate_by_role'][role] = _percent(
                sum(item.status in QUALITY_PASS_OUTCOMES for item in quality_assessed),
                len(quality_assessed),
            )
            result['embedding_attempt_count_by_role'][role] = len(embedding_attempts)
            result['embedding_success_rate_by_role'][role] = _percent(
                sum(item.status != 'EMBEDDING_FAILED' for item in embedding_attempts),
                len(embedding_attempts),
            )
        else:
            result['detection_success_rate_by_role'][role] = None
            result['quality_evaluated_count_by_role'][role] = 0
            result['quality_acceptance_rate_by_role'][role] = None
            result['embedding_attempt_count_by_role'][role] = 0
            result['embedding_success_rate_by_role'][role] = None

    genuine = [item for item in by_role['genuine'] if item.status not in SOURCE_LOAD_FAILURES]
    if genuine:
        correct = sum(item.status == 'ACCEPTED' for item in genuine)
        result['genuine_identification_rate'] = _percent(correct, len(genuine))
        result['genuine_false_rejection_rate'] = _percent(len(genuine) - correct, len(genuine))
        result['genuine_wrong_identity_acceptances'] = sum(
            item.status == 'WRONG_IDENTITY_ACCEPTED' for item in genuine
        )
    genuine_scheduled_count = len(by_role['genuine'])
    result['genuine_scheduled_identification_rate'] = _percent(
        sum(item.status == 'ACCEPTED' for item in by_role['genuine']),
        genuine_scheduled_count,
    )
    unknown = by_role['unknown']
    valid_unknown = [item for item in unknown if item.status not in SOURCE_LOAD_FAILURES]
    if valid_unknown:
        accepted = sum(item.status == 'ACCEPTED' for item in valid_unknown)
        result['unknown_false_acceptances'] = accepted
        result['unknown_false_acceptance_rate'] = _percent(accepted, len(valid_unknown))
        matching_attempts = [item for item in valid_unknown if item.status in MATCHING_ATTEMPT_OUTCOMES]
        result['unknown_matching_attempt_count'] = len(matching_attempts)
        result['unknown_false_acceptance_rate_when_matching'] = _percent(
            sum(item.status == 'ACCEPTED' for item in matching_attempts),
            len(matching_attempts),
        )
    else:
        result['unknown_false_acceptances'] = 0
        result['unknown_matching_attempt_count'] = 0
        result['unknown_false_acceptance_rate_when_matching'] = None
    if unknown:
        result['unknown_scheduled_false_acceptance_rate'] = _percent(
            sum(item.status == 'ACCEPTED' for item in unknown), len(unknown),
        )
    return result


def _paired_outcome_changes(
    baseline: list[ProbeOutcome],
    reduced: list[ProbeOutcome],
) -> dict[str, Any]:
    if len(baseline) != len({
        (item.record.role, item.record.subject, item.record.capture_id) for item in baseline
    }) or len(reduced) != len({
        (item.record.role, item.record.subject, item.record.capture_id) for item in reduced
    }):
        raise ValueError('Resolution run contains duplicate internal record keys.')
    baseline_by_key = {
        (item.record.role, item.record.subject, item.record.capture_id): item.status
        for item in baseline
    }
    reduced_by_key = {
        (item.record.role, item.record.subject, item.record.capture_id): item.status
        for item in reduced
    }
    if baseline_by_key.keys() != reduced_by_key.keys():
        raise ValueError('Resolution runs did not evaluate the same dataset records.')
    transitions = Counter()
    transitions_by_role: dict[str, Counter[str]] = defaultdict(Counter)
    for key in baseline_by_key:
        transition = f'{baseline_by_key[key]} -> {reduced_by_key[key]}'
        transitions[transition] += 1
        transitions_by_role[key[0]][transition] += 1
    return {
        'paired_image_count': len(baseline_by_key),
        'paired_probe_count': sum(key[0] != 'enrolled' for key in baseline_by_key),
        'outcome_transitions': dict(sorted(transitions.items())),
        'outcome_transitions_by_role': {
            role: dict(sorted(counts.items()))
            for role, counts in sorted(transitions_by_role.items())
        },
    }


def _grouped_probe_rates(outcomes: list[ProbeOutcome]) -> dict[str, Any]:
    groups: dict[str, dict[str, list[ProbeOutcome]]] = {
        field: defaultdict(list) for field in CONDITION_FIELDS
    }
    for item in outcomes:
        if item.record.role != 'genuine':
            continue
        for field in CONDITION_FIELDS:
            value = getattr(item.record, field)
            if value:
                groups[field][value].append(item)
    return {
        field: {
            value: {
                'probe_count': len(items),
                'identification_rate': _percent(
                    sum(item.status == 'ACCEPTED' for item in items), len(items),
                ),
                'false_rejection_rate': _percent(
                    sum(item.status != 'ACCEPTED' for item in items), len(items),
                ),
            }
            for value, items in sorted(values.items())
        }
        for field, values in groups.items()
    }


def evaluate_paired_resolutions(
    records: list[DatasetRecord],
    *,
    jpeg_quality: int,
    cv2: Any,
    face_engine: Any,
    recognition_service: Any,
    settings: Any,
    run_resolution: Callable[..., list[ProbeOutcome]] = _run_resolution,
) -> dict[str, Any]:
    results = {}
    outcomes_by_resolution = []
    expected_keys = {
        (record.role, record.subject, record.capture_id) for record in records
    }
    if len(expected_keys) != len(records):
        raise ValueError('Input manifest contains duplicate internal record keys.')
    for width, height in RESOLUTIONS:
        outcomes = run_resolution(
            records,
            max_width=width,
            max_height=height,
            jpeg_quality=jpeg_quality,
            cv2=cv2,
            face_engine=face_engine,
            recognition_service=recognition_service,
            settings=settings,
        )
        actual_keys = {
            (item.record.role, item.record.subject, item.record.capture_id)
            for item in outcomes
        }
        if len(actual_keys) != len(outcomes) or actual_keys != expected_keys:
            raise ValueError('Resolution run did not return exactly one outcome for every manifest record.')
        outcomes_by_resolution.append(outcomes)
        results[f'{width}x{height}'] = _summarize(outcomes)
    return {
        'paired_source_image_count': len(records),
        'enrolled_subject_count': len({r.subject for r in records if r.role == 'enrolled'}),
        'genuine_subject_count': len({r.subject for r in records if r.role == 'genuine'}),
        'unknown_subject_count': len({r.subject for r in records if r.role == 'unknown'}),
        'threshold': settings.face_recognition_threshold,
        'ambiguity_margin': settings.face_recognition_ambiguity_margin,
        'minimum_enrollment_captures': getattr(settings, 'face_min_samples', 3),
        'jpeg_quality': jpeg_quality / 100,
        'resolutions': results,
        'paired_outcome_change_1280_to_960': _paired_outcome_changes(*outcomes_by_resolution),
        'condition_breakdown': {
            f'{width}x{height}': _grouped_probe_rates(outcomes)
            for (width, height), outcomes in zip(RESOLUTIONS, outcomes_by_resolution)
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True, help='Private local CSV manifest; never included in report.')
    parser.add_argument('--dataset-root', type=Path, required=True, help='Private local image root outside the repository.')
    parser.add_argument('--jpeg-quality', type=int, default=82, help='JPEG quality, bounded to 50..95.')
    args = parser.parse_args()
    if not 50 <= args.jpeg_quality <= 95:
        parser.error('--jpeg-quality must be between 50 and 95.')
    try:
        if args.manifest.is_symlink() or args.dataset_root.is_symlink():
            raise ValueError('Manifest and dataset root cannot be symlinks.')
        manifest_path = args.manifest.resolve()
        dataset_root = args.dataset_root.resolve()
        repository_root = Path(__file__).resolve().parents[2]
        if manifest_path.is_relative_to(repository_root) or dataset_root.is_relative_to(repository_root):
            raise ValueError('Keep the private manifest and image dataset outside the repository.')
        records = _load_manifest(manifest_path, dataset_root)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))

    backend_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend_root))
    import cv2
    from app.config import settings
    from app.services.face_engine import FaceEngineStatus, face_engine
    from app.services.face_recognition import FaceRecognitionService

    if face_engine.initialize() != FaceEngineStatus.READY:
        parser.error('Local YuNet/SFace models are not ready; no images were evaluated.')
    report = evaluate_paired_resolutions(
        records,
        jpeg_quality=args.jpeg_quality,
        cv2=cv2,
        face_engine=face_engine,
        recognition_service=FaceRecognitionService,
        settings=settings,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
