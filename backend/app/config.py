from pydantic_settings import BaseSettings

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

    model_config = {"env_file": ".env", "env_prefix": "DNFER_"}

settings = Settings()
