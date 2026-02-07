from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings with static IP configuration"""
    
    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    static_ip: Optional[str] = None
    
    # Environment
    environment: str = "development"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
