from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]
class Settings(BaseSettings):
    app_name: str = 'Kena Scan Tandara'
    secret_key: str = 'development-only-change-me'
    access_token_expire_minutes: int = 480
    database_url: str = f'sqlite:///{BASE_DIR / "data" / "kena_scan.db"}'
    frontend_origin: str = 'http://localhost:3000,http://localhost:5173'
    timezone: str = 'Asia/Jakarta'
    camera_source: str = '0'
    face_confidence_threshold: float = .75
    scan_cooldown_seconds: int = 30
    max_upload_mb: int = 5
    model_config = SettingsConfigDict(env_file=BASE_DIR / '.env', extra='ignore')
settings = Settings()
