from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from ..config import settings


@dataclass(frozen=True)
class FaceQualityAssessment:
    status: str  # 'GOOD', 'ACCEPTABLE', 'TOO_SMALL', 'BLURRY', 'BAD_POSE', 'LOW_DETECTION_CONFIDENCE', 'OUT_OF_FRAME', 'TOO_DARK', 'TOO_BRIGHT'
    is_acceptable: bool
    error_code: str | None
    bbox: tuple[float, float, float, float]
    frame_size: tuple[int, int]
    detection_confidence: float
    sharpness: float
    brightness: float
    yaw_ratio: float
    roll_degrees: float
    eye_distance_ratio: float
    details: dict[str, Any] = field(default_factory=dict)


class FaceQualityEvaluator:
    def __init__(self, cv2_module: Any = None) -> None:
        self._cv2 = cv2_module

    def set_cv2(self, cv2_module: Any) -> None:
        self._cv2 = cv2_module

    def _ensure_cv2(self) -> Any:
        if self._cv2 is None:
            import cv2
            self._cv2 = cv2
        return self._cv2

    def evaluate(
        self,
        frame: np.ndarray,
        face: np.ndarray,
        *,
        for_enrollment: bool = False,
        min_size_px: int | None = None,
        min_area_ratio: float | None = None,
        blur_threshold: float | None = None,
        min_confidence: float | None = None,
    ) -> FaceQualityAssessment:
        frame_h, frame_w = frame.shape[:2]
        x, y, width, height = [float(v) for v in face[:4]]
        cv2 = self._ensure_cv2()

        # 1. Detection confidence
        detection_confidence = float(face[14]) if len(face) >= 15 else (float(face[4]) if len(face) == 5 else 0.99)
        conf_floor = min_confidence if min_confidence is not None else settings.face_confidence_threshold

        # 2. Out of frame check
        if (
            frame_w <= 0
            or frame_h <= 0
            or not all(math.isfinite(value) for value in (x, y, width, height))
            or x < 0
            or y < 0
            or (x + width) > frame_w
            or (y + height) > frame_h
        ):
            return FaceQualityAssessment(
                status='OUT_OF_FRAME',
                is_acceptable=False,
                error_code='FACE_OUT_OF_FRAME',
                bbox=(x, y, width, height),
                frame_size=(frame_w, frame_h),
                detection_confidence=detection_confidence,
                sharpness=0.0,
                brightness=0.0,
                yaw_ratio=0.0,
                roll_degrees=0.0,
                eye_distance_ratio=0.0,
                details={'reason': 'Face extends beyond frame boundaries'},
            )

        # 3. Bounding box size and relative ratio check
        min_dim = min(width, height)
        size_limit = min_size_px if min_size_px is not None else (
            settings.face_enrollment_min_size_px if for_enrollment else settings.face_min_size_px
        )
        ratio_limit = min_area_ratio if min_area_ratio is not None else settings.face_min_area_ratio

        if min_dim < size_limit or (width / frame_w) < ratio_limit or (height / frame_h) < ratio_limit:
            return FaceQualityAssessment(
                status='TOO_SMALL',
                is_acceptable=False,
                error_code='FACE_TOO_SMALL',
                bbox=(x, y, width, height),
                frame_size=(frame_w, frame_h),
                detection_confidence=detection_confidence,
                sharpness=0.0,
                brightness=0.0,
                yaw_ratio=0.0,
                roll_degrees=0.0,
                eye_distance_ratio=0.0,
                details={'min_dim': min_dim, 'limit': size_limit},
            )

        # 4. Low detection confidence
        if not math.isfinite(detection_confidence) or detection_confidence < conf_floor:
            return FaceQualityAssessment(
                status='LOW_DETECTION_CONFIDENCE',
                is_acceptable=False,
                error_code='FACE_LOW_CONFIDENCE',
                bbox=(x, y, width, height),
                frame_size=(frame_w, frame_h),
                detection_confidence=detection_confidence,
                sharpness=0.0,
                brightness=0.0,
                yaw_ratio=0.0,
                roll_degrees=0.0,
                eye_distance_ratio=0.0,
                details={'confidence': detection_confidence, 'limit': conf_floor},
            )

        # 5. Crop face patch for blur & brightness
        crop_x1 = max(0, int(round(x)))
        crop_y1 = max(0, int(round(y)))
        crop_x2 = min(frame_w, int(round(x + width)))
        crop_y2 = min(frame_h, int(round(y + height)))

        if crop_x2 <= crop_x1 or crop_y2 <= crop_y1:
            return FaceQualityAssessment(
                status='TOO_SMALL',
                is_acceptable=False,
                error_code='FACE_TOO_SMALL',
                bbox=(x, y, width, height),
                frame_size=(frame_w, frame_h),
                detection_confidence=detection_confidence,
                sharpness=0.0,
                brightness=0.0,
                yaw_ratio=0.0,
                roll_degrees=0.0,
                eye_distance_ratio=0.0,
                details={'reason': 'Empty crop region'},
            )

        crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        brightness = float(np.mean(gray))

        effective_blur = blur_threshold if blur_threshold is not None else settings.face_blur_threshold
        target_blur = (effective_blur * 1.2) if for_enrollment else effective_blur

        # 6. Blur check
        if sharpness < target_blur:
            return FaceQualityAssessment(
                status='BLURRY',
                is_acceptable=False,
                error_code='FACE_TOO_BLURRY',
                bbox=(x, y, width, height),
                frame_size=(frame_w, frame_h),
                detection_confidence=detection_confidence,
                sharpness=sharpness,
                brightness=brightness,
                yaw_ratio=0.0,
                roll_degrees=0.0,
                eye_distance_ratio=0.0,
                details={'sharpness': sharpness, 'limit': target_blur},
            )

        # 7. Brightness check
        if brightness < settings.face_min_brightness:
            return FaceQualityAssessment(
                status='TOO_DARK',
                is_acceptable=False,
                error_code='FACE_TOO_DARK',
                bbox=(x, y, width, height),
                frame_size=(frame_w, frame_h),
                detection_confidence=detection_confidence,
                sharpness=sharpness,
                brightness=brightness,
                yaw_ratio=0.0,
                roll_degrees=0.0,
                eye_distance_ratio=0.0,
                details={'brightness': brightness, 'limit': settings.face_min_brightness},
            )

        if brightness > settings.face_max_brightness:
            return FaceQualityAssessment(
                status='TOO_BRIGHT',
                is_acceptable=False,
                error_code='FACE_TOO_BRIGHT',
                bbox=(x, y, width, height),
                frame_size=(frame_w, frame_h),
                detection_confidence=detection_confidence,
                sharpness=sharpness,
                brightness=brightness,
                yaw_ratio=0.0,
                roll_degrees=0.0,
                eye_distance_ratio=0.0,
                details={'brightness': brightness, 'limit': settings.face_max_brightness},
            )

        # 8. Pose and alignment check (if YuNet 5 landmarks are present)
        yaw_ratio = 1.0
        roll_degrees = 0.0
        eye_distance_ratio = 0.45

        if len(face) >= 15:
            if not np.isfinite(face[4:14]).all():
                return FaceQualityAssessment(
                    status='BAD_POSE',
                    is_acceptable=False,
                    error_code='FACE_BAD_POSE',
                    bbox=(x, y, width, height),
                    frame_size=(frame_w, frame_h),
                    detection_confidence=detection_confidence,
                    sharpness=sharpness,
                    brightness=brightness,
                    yaw_ratio=0.0,
                    roll_degrees=0.0,
                    eye_distance_ratio=0.0,
                    details={'reason': 'Non-finite facial landmarks'},
                )
            x_re, y_re = float(face[4]), float(face[5])
            x_le, y_le = float(face[6]), float(face[7])
            x_nt, y_nt = float(face[8]), float(face[9])
            x_rc, y_rc = float(face[10]), float(face[11])
            x_lc, y_lc = float(face[12]), float(face[13])

            dx_eyes = x_le - x_re
            dy_eyes = y_le - y_re
            d_eyes = math.hypot(dx_eyes, dy_eyes)
            eye_distance_ratio = d_eyes / max(width, 1.0)

            roll_degrees = abs(math.degrees(math.atan2(abs(dy_eyes), abs(dx_eyes) + 1e-6)))

            dx_r = abs(x_nt - x_re)
            dx_l = abs(x_le - x_nt)
            yaw_ratio = min(dx_r, dx_l) / (max(dx_r, dx_l) + 1e-6)

            y_eyes_mid = (y_re + y_le) / 2.0
            y_mouth_mid = (y_rc + y_lc) / 2.0

            max_roll = 25.0 if for_enrollment else 35.0
            min_yaw = 0.35 if for_enrollment else 0.20

            # Pose violations
            if eye_distance_ratio < 0.18:
                return FaceQualityAssessment(
                    status='BAD_POSE',
                    is_acceptable=False,
                    error_code='FACE_BAD_POSE',
                    bbox=(x, y, width, height),
                    frame_size=(frame_w, frame_h),
                    detection_confidence=detection_confidence,
                    sharpness=sharpness,
                    brightness=brightness,
                    yaw_ratio=yaw_ratio,
                    roll_degrees=roll_degrees,
                    eye_distance_ratio=eye_distance_ratio,
                    details={'reason': 'Interpupillary distance too narrow for valid alignment'},
                )

            if roll_degrees > max_roll:
                return FaceQualityAssessment(
                    status='BAD_POSE',
                    is_acceptable=False,
                    error_code='FACE_BAD_POSE',
                    bbox=(x, y, width, height),
                    frame_size=(frame_w, frame_h),
                    detection_confidence=detection_confidence,
                    sharpness=sharpness,
                    brightness=brightness,
                    yaw_ratio=yaw_ratio,
                    roll_degrees=roll_degrees,
                    eye_distance_ratio=eye_distance_ratio,
                    details={'roll_degrees': roll_degrees, 'limit': max_roll},
                )

            if yaw_ratio < min_yaw:
                return FaceQualityAssessment(
                    status='BAD_POSE',
                    is_acceptable=False,
                    error_code='FACE_BAD_POSE',
                    bbox=(x, y, width, height),
                    frame_size=(frame_w, frame_h),
                    detection_confidence=detection_confidence,
                    sharpness=sharpness,
                    brightness=brightness,
                    yaw_ratio=yaw_ratio,
                    roll_degrees=roll_degrees,
                    eye_distance_ratio=eye_distance_ratio,
                    details={'yaw_ratio': yaw_ratio, 'limit': min_yaw},
                )

            # Pitch anomaly check (nose must be between eyes and mouth)
            if y_nt <= y_eyes_mid or y_nt >= y_mouth_mid:
                return FaceQualityAssessment(
                    status='BAD_POSE',
                    is_acceptable=False,
                    error_code='FACE_BAD_POSE',
                    bbox=(x, y, width, height),
                    frame_size=(frame_w, frame_h),
                    detection_confidence=detection_confidence,
                    sharpness=sharpness,
                    brightness=brightness,
                    yaw_ratio=yaw_ratio,
                    roll_degrees=roll_degrees,
                    eye_distance_ratio=eye_distance_ratio,
                    details={'reason': 'Nose tip pitch inverted relative to eyes/mouth'},
                )

        # 9. Quality classification: GOOD vs ACCEPTABLE
        is_good = (
            min_dim >= (80 if for_enrollment else 50)
            and sharpness >= (target_blur * 1.35)
            and detection_confidence >= 0.75
            and yaw_ratio >= 0.40
            and roll_degrees <= 20.0
        )
        status = 'GOOD' if is_good else 'ACCEPTABLE'

        return FaceQualityAssessment(
            status=status,
            is_acceptable=True,
            error_code=None,
            bbox=(x, y, width, height),
            frame_size=(frame_w, frame_h),
            detection_confidence=detection_confidence,
            sharpness=sharpness,
            brightness=brightness,
            yaw_ratio=yaw_ratio,
            roll_degrees=roll_degrees,
            eye_distance_ratio=eye_distance_ratio,
            details={'is_good': is_good},
        )

    def validate(self, frame: np.ndarray, face: np.ndarray, *, for_enrollment: bool = False) -> str | None:
        assessment = self.evaluate(frame, face, for_enrollment=for_enrollment)
        return assessment.error_code


quality_evaluator = FaceQualityEvaluator()

