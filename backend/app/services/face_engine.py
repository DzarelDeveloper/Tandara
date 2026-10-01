from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Any

import numpy as np

from ..config import settings
from .face_quality import FaceQualityAssessment, quality_evaluator


class FaceEngineStatus(str, Enum):
    READY = 'READY'
    NOT_CONFIGURED = 'NOT_CONFIGURED'
    ERROR = 'ERROR'


class FaceEngine:
    def __init__(self) -> None:
        self.status = FaceEngineStatus.NOT_CONFIGURED
        self.error_message: str | None = None
        self.detector: Any = None
        self.recognizer: Any = None
        self._cv2: Any = None

    def initialize(self) -> FaceEngineStatus:
        if self.detector is not None and self.recognizer is not None:
            return self.status
        detector_path = Path(settings.face_detector_model)
        recognizer_path = Path(settings.face_recognizer_model)
        model_dir = detector_path.parent
        if not detector_path.is_file():
            detector_candidates = sorted(model_dir.glob('*yunet*.onnx'))
            if detector_candidates: detector_path = detector_candidates[0]
        if not recognizer_path.is_file():
            recognizer_candidates = sorted(model_dir.glob('*sface*.onnx'))
            if recognizer_candidates: recognizer_path = recognizer_candidates[0]
        if not detector_path.is_file() or not recognizer_path.is_file():
            self.status = FaceEngineStatus.NOT_CONFIGURED
            self.error_message = 'Model YuNet dan SFace lokal belum tersedia.'
            return self.status
        try:
            import cv2

            self._cv2 = cv2
            quality_evaluator.set_cv2(cv2)
            self.detector = cv2.FaceDetectorYN.create(str(detector_path), '', (320, 320), settings.face_detector_score_threshold, settings.face_detector_nms_threshold, settings.face_detector_top_k)
            self.recognizer = cv2.FaceRecognizerSF.create(str(recognizer_path), '')
            self.status = FaceEngineStatus.READY
            self.error_message = None
        except Exception as exc:
            self.detector = None
            self.recognizer = None
            self.status = FaceEngineStatus.ERROR
            self.error_message = f'Model face engine gagal dimuat: {exc}'
        return self.status

    def status_payload(self) -> dict[str, str | None]:
        self.initialize()
        loaded = self.status == FaceEngineStatus.READY
        return {
            'status': self.status.value,
            'detector': 'YuNet',
            'detectorStatus': 'LOADED' if loaded else self.status.value,
            'recognizer': 'SFace',
            'recognizerStatus': 'LOADED' if loaded else self.status.value,
            'engine': 'OpenCV / ONNX',
            'message': self.error_message,
        }

    def detect_faces(self, frame: np.ndarray) -> list[np.ndarray]:
        if self.initialize() != FaceEngineStatus.READY:
            raise RuntimeError('FACE_ENGINE_NOT_READY')
        height, width = frame.shape[:2]
        max_dim = max(height, width)
        if max_dim > 1280 and self._cv2 is not None:
            scale = 1280.0 / max_dim
            det_w = int(round(width * scale))
            det_h = int(round(height * scale))
            det_frame = self._cv2.resize(frame, (det_w, det_h), interpolation=self._cv2.INTER_AREA)
            self.detector.setInputSize((det_w, det_h))
            _, raw_faces = self.detector.detect(det_frame)
            if raw_faces is None:
                return []
            scale_x = width / det_w
            scale_y = height / det_h
            faces = []
            for face in raw_faces:
                scaled = face.copy().astype(np.float32)
                scaled[0::2][:7] *= scale_x
                scaled[1::2][:7] *= scale_y
                faces.append(scaled)
            return faces
        else:
            self.detector.setInputSize((width, height))
            _, faces = self.detector.detect(frame)
            return [] if faces is None else [face.astype(np.float32) for face in faces]

    def evaluate_quality(self, frame: np.ndarray, face: np.ndarray, for_enrollment: bool = False) -> FaceQualityAssessment:
        if self._cv2 is not None:
            quality_evaluator.set_cv2(self._cv2)
        assessment = quality_evaluator.evaluate(frame, face, for_enrollment=for_enrollment)
        self._last_quality_assessment = assessment
        return assessment

    def validate_face_quality(self, frame: np.ndarray, face: np.ndarray, for_enrollment: bool = False) -> str | None:
        assessment = self.evaluate_quality(frame, face, for_enrollment=for_enrollment)
        return assessment.error_code

    def extract_embedding(self, frame: np.ndarray, face: np.ndarray) -> np.ndarray:
        if self.initialize() != FaceEngineStatus.READY:
            raise RuntimeError('FACE_ENGINE_NOT_READY')
        aligned = self.recognizer.alignCrop(frame, face)
        return self.normalize_embedding(self.recognizer.feature(aligned))

    @staticmethod
    def normalize_embedding(embedding: np.ndarray) -> np.ndarray:
        vector = np.asarray(embedding, dtype=np.float32).reshape(-1)
        if not np.isfinite(vector).all():
            raise ValueError('NON_FINITE_EMBEDDING')
        norm = float(np.linalg.norm(vector))
        if not np.isfinite(norm) or norm == 0:
            raise ValueError('EMPTY_EMBEDDING')
        return vector / norm

    @staticmethod
    def cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
        left_normalized = FaceEngine.normalize_embedding(left)
        right_normalized = FaceEngine.normalize_embedding(right)
        return float(np.dot(left_normalized, right_normalized))


face_engine = FaceEngine()
