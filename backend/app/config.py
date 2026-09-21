from pathlib import Path

from pydantic_settings import BaseSettings

# config.py 位于 backend/app/，上两级即仓库根；从代码位置解析 .env，与启动目录无关。
# Docker 下不存在仓库根 .env（配置走环境变量），传 None 即跳过 dotenv 加载。
_REPO_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _REPO_ROOT / ".env"

class Settings(BaseSettings):
    database_url: str = "sqlite:///./data/dnfer.db"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 60 * 24 * 7
    admin_username: str = "admin"
    admin_password: str = "admin123"
    admin_nickname: str = "群主"
    api_token: str = "change-me-bot-token"
    code_expire_days: int | None = 7
    static_dir: str = "../frontend/dist"
    job_data_path: str = "../职业信息.json"
    images_dir: str = "../images/adventure"

    # S3 头像存储（公开读桶）
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = ""
    s3_region: str = ""
    s3_public_base: str = ""

    model_config = {"env_file": _ENV_FILE if _ENV_FILE.exists() else None,
                    "env_prefix": "DNFER_"}

settings = Settings()
