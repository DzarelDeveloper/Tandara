from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Any

import numpy as np

from ..config import settings


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
        self.detector.setInputSize((width, height))
        _, faces = self.detector.detect(frame)
        return [] if faces is None else [face for face in faces]

    def validate_face_quality(self, frame: np.ndarray, face: np.ndarray) -> str | None:
        x, y, width, height = [float(value) for value in face[:4]]
        frame_height, frame_width = frame.shape[:2]
        if min(width, height) < settings.face_min_size_px or width / frame_width < settings.face_min_area_ratio or height / frame_height < settings.face_min_area_ratio:
            return 'FACE_TOO_SMALL'
        if x < 0 or y < 0 or x + width > frame_width or y + height > frame_height:
            return 'FACE_OUT_OF_FRAME'
        gray = self._cv2.cvtColor(frame[int(y):int(y + height), int(x):int(x + width)], self._cv2.COLOR_BGR2GRAY)
        if float(self._cv2.Laplacian(gray, self._cv2.CV_64F).var()) < settings.face_blur_threshold:
            return 'FACE_TOO_BLURRY'
        brightness = float(np.mean(gray))
        if brightness < settings.face_min_brightness:
            return 'FACE_TOO_DARK'
        if brightness > settings.face_max_brightness:
            return 'FACE_TOO_BRIGHT'
        return None

    def extract_embedding(self, frame: np.ndarray, face: np.ndarray) -> np.ndarray:
        if self.initialize() != FaceEngineStatus.READY:
            raise RuntimeError('FACE_ENGINE_NOT_READY')
        aligned = self.recognizer.alignCrop(frame, face)
        return self.normalize_embedding(self.recognizer.feature(aligned))

    @staticmethod
    def normalize_embedding(embedding: np.ndarray) -> np.ndarray:
        vector = np.asarray(embedding, dtype=np.float32).reshape(-1)
        norm = float(np.linalg.norm(vector))
        if norm == 0:
            raise ValueError('EMPTY_EMBEDDING')
        return vector / norm

    @staticmethod
    def cosine_similarity(left: np.ndarray, right: np.ndarray) -> float:
        left_normalized = FaceEngine.normalize_embedding(left)
        right_normalized = FaceEngine.normalize_embedding(right)
        return float(np.dot(left_normalized, right_normalized))


face_engine = FaceEngine()
