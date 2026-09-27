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
    face_detector_score_threshold: float = 0.9
    face_detector_nms_threshold: float = 0.3
    face_detector_top_k: int = 5000
    face_min_size_px: int = 80
    face_min_area_ratio: float = 0.08
    face_blur_threshold: float = 45.0
    face_min_brightness: float = 35.0
    face_max_brightness: float = 220.0
    face_sample_similarity_threshold: float = 0.55
    face_min_samples: int = 3
    face_recognition_threshold: float = Field(default=0.363, ge=-1, le=1)
    face_recognition_ambiguity_margin: float = Field(default=0.0, ge=0, le=2)
    face_scan_cooldown_seconds: int = Field(default=4, ge=0)
    model_config = SettingsConfigDict(env_file=BASE_DIR / '.env', extra='ignore')
settings = Settings()
