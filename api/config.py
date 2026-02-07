"""
Configuration module for NextBeat music generation backend.

Uses Pydantic Settings for type-safe configuration with .env file support.
All generation parameters are centralized here for easy tuning.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    environment: str = "development"

    # Claude API
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-20250514"
    claude_temperature: float = 0.7
    claude_max_tokens: int = 4096

    # Magenta model paths
    drums_rnn_checkpoint: str = "models/drum_kit_rnn.mag"
    music_transformer_checkpoint: str = "models/music_transformer"

    # Generation defaults
    default_tempo: int = 120
    default_bars: int = 8
    default_primer_bars: int = 2
    default_temperature: float = 0.9

    # Post-processing parameters
    quantize_grid: float = 0.25  # 16th note grid in beats
    swing_ratio: float = 0.66  # Standard swing (2:1 ratio)
    humanize_timing: float = 0.015  # Timing variation in beats (~15ms at 120bpm)
    humanize_velocity: int = 8  # Velocity variation range (+/-)
    velocity_min: int = 40
    velocity_max: int = 120

    # Magenta generation parameters
    drums_temperature: float = 0.9
    piano_temperature: float = 0.8
    steps_per_bar: int = 16  # 16th note resolution

    # Output
    output_dir: str = "output"

    # CORS
    cors_origins: str = "*"  # Comma-separated origins, or * for all

    model_config = {
        "env_file": ".env",
        "case_sensitive": False,
    }

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()
