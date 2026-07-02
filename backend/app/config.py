"""Configuración por variables de entorno (ver .env.example)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg2://sentinel:sentinel@localhost:5432/sentinel"

    # Agentes IA (Anthropic) — sin key, la capa de agentes se omite
    anthropic_api_key: str = ""
    agent_model: str = "claude-sonnet-5"
    agent_max_tokens: int = 2000

    # Umbrales de alertas (sección 6 del diseño)
    alert_drop_pct: float = -7.0
    alert_spike_pct: float = 10.0
    drawdown_thresholds: str = "-30,-50,-70"   # cruces de drawdown desde ATH, en %
    rally_thresholds: str = "50,100,150"       # cruces de rally desde mínimo 52w, en %
    threshold_reset_buffer_pp: float = 5.0     # histéresis (puntos %) para re-armar un umbral
    pivot_window_days: int = 60

    # Valoración DCF conservadora (sección 5, Nivel 1) — tasas en fracción
    dcf_discount_rate: float = 0.10
    dcf_terminal_growth: float = 0.025
    dcf_growth_cap: float = 0.15
    dcf_margin_of_safety: float = 0.30
    dcf_horizon_years: int = 10

    # Ingestión
    price_batch_size: int = 100
    price_history_period: str = "10y"
    fundamentals_batch_per_day: int = 100
    min_universe_rows: int = 480
    benchmark_symbol: str = "^GSPC"

    market_timezone: str = "America/New_York"
    cors_origins: str = "*"

    @property
    def drawdown_levels(self) -> list[float]:
        return [float(x) for x in self.drawdown_thresholds.split(",") if x.strip()]

    @property
    def rally_levels(self) -> list[float]:
        return [float(x) for x in self.rally_thresholds.split(",") if x.strip()]

    @property
    def cors_origins_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


settings = Settings()
