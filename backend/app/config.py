from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "OptiFlow API"
    app_env: str = "development"
    app_port: int = 8000
    cors_allow_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    database_url: str = "postgresql+psycopg://optiflow:optiflow@localhost:5432/optiflow"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = "dev-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120

    alert_delivery_email_enabled: bool = False
    alert_delivery_email_to: str = ""
    alert_delivery_webhook_enabled: bool = False
    alert_delivery_webhook_url: str = ""
    alert_delivery_webhook_timeout_seconds: int = 5
    alert_delivery_max_retries: int = 2


settings = Settings()

