from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]
class Settings(BaseSettings):
    app_name: str = 'Kena Scan Tandara'
    app_env: str = 'production'
    secret_key: str
    access_token_expire_minutes: int = 480
    database_url: str = f'sqlite:///{BASE_DIR / "data" / "kena_scan.db"}'
    frontend_origin: str = 'http://localhost:3000,http://localhost:5173'
    timezone: str = 'Asia/Jakarta'
    camera_source: str = '0'
    face_confidence_threshold: float = .75
    scan_cooldown_seconds: int = 30
    max_upload_mb: int = 5
    face_detector_model: str = str(BASE_DIR / 'backend' / 'ml_models' / 'yunet_face_detection.onnx')
    face_recognizer_model: str = str(BASE_DIR / 'backend' / 'ml_models' / 'face_recognition_sface.onnx')
    face_detector_score_threshold: float = 0.65
    face_detector_nms_threshold: float = 0.3
    face_detector_top_k: int = 5000
    face_min_size_px: int = 36
    face_enrollment_min_size_px: int = 60
    face_min_area_ratio: float = 0.015
    face_blur_threshold: float = 28.0
    face_min_brightness: float = 35.0
    face_max_brightness: float = 220.0
    face_sample_similarity_threshold: float = 0.55
    face_min_samples: int = 3
    face_recognition_threshold: float = Field(default=0.363, ge=-1, le=1)
    face_recognition_ambiguity_margin: float = Field(default=0.05, ge=0, le=2)
    face_scan_cooldown_seconds: int = Field(default=4, ge=0)
    face_temporal_min_observations: int = Field(default=3, ge=2, le=10)
    face_temporal_window_seconds: float = Field(default=3.0, ge=1, le=10)
    face_temporal_min_span_seconds: float = Field(default=0.6, ge=0.2, le=3)
    face_observation_interval_seconds: float = Field(default=0.3, ge=0.15, le=2)
    face_track_ttl_seconds: float = Field(default=2.25, ge=0.5, le=10)
    face_verified_hold_seconds: float = Field(default=4.0, ge=1, le=10)
    face_fast_min_observations: int = Field(default=2, ge=2, le=10)
    face_fast_min_span_seconds: float = Field(default=0.3, ge=0.2, le=2)
    face_fast_similarity: float = Field(default=0.75, ge=0, le=1)
    face_fast_margin: float = Field(default=0.15, ge=0.05, le=2)
    face_fast_sharpness: float = Field(default=60, ge=28)
    face_liveness_enabled: bool = True
    face_liveness_min_observations: int = Field(default=3, ge=3, le=12)
    face_liveness_min_span_seconds: float = Field(default=0.5, ge=0.3, le=3)
    face_liveness_window_seconds: float = Field(default=3.0, ge=1, le=10)
    face_liveness_static_seconds: float = Field(default=1.5, ge=1, le=5)
    face_liveness_pose_range: float = Field(default=0.025, ge=0.01, le=0.2)
    face_liveness_geometry_range: float = Field(default=0.025, ge=0.01, le=0.2)
    model_config = SettingsConfigDict(env_file=BASE_DIR / '.env', extra='ignore')
settings = Settings()
