"""Modelo de datos de Market Sentinel (sección 8 del documento de arquitectura).

Convención de unidades:
- Fundamentals: ROE, márgenes, crecimientos y tasas en FRACCIÓN (0.15 = 15%).
- Technicals / DCF: drawdown, rally, upside y distancias en PORCENTAJE (-35.2 = -35.2%).
- Importes monetarios en USD.
"""
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# JSONB en Postgres, JSON genérico en otros dialectos (tests con sqlite)
JSONType = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class Ticker(Base):
    __tablename__ = "tickers"

    symbol: Mapped[str] = mapped_column(String(12), primary_key=True)  # formato Yahoo (BRK-B)
    name: Mapped[str | None] = mapped_column(String(200))
    sector: Mapped[str | None] = mapped_column(String(100), index=True)
    industry: Mapped[str | None] = mapped_column(String(150))
    market_cap: Mapped[int | None] = mapped_column(BigInteger)
    exchange: Mapped[str | None] = mapped_column(String(20))
    is_nasdaq100: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    added_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class PriceDaily(Base):
    __tablename__ = "prices_daily"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(
        ForeignKey("tickers.symbol", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    open: Mapped[float | None] = mapped_column(Float)
    high: Mapped[float | None] = mapped_column(Float)
    low: Mapped[float | None] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[int | None] = mapped_column(BigInteger)

    __table_args__ = (
        UniqueConstraint("symbol", "date", name="uq_price_symbol_date"),
        Index("ix_prices_symbol_date", "symbol", "date"),
    )


class Fundamentals(Base):
    """Último snapshot fundamental por símbolo. Ratios en FRACCIÓN (0.15 = 15%)."""

    __tablename__ = "fundamentals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(
        ForeignKey("tickers.symbol", ondelete="CASCADE"), unique=True, index=True
    )
    as_of: Mapped[date] = mapped_column(Date)

    pe: Mapped[float | None] = mapped_column(Float)
    peg: Mapped[float | None] = mapped_column(Float)
    roe_ttm: Mapped[float | None] = mapped_column(Float)
    roe_avg_4y: Mapped[float | None] = mapped_column(Float)
    debt_to_equity: Mapped[float | None] = mapped_column(Float)
    gross_margin: Mapped[float | None] = mapped_column(Float)
    operating_margin: Mapped[float | None] = mapped_column(Float)
    operating_margin_trend: Mapped[float | None] = mapped_column(Float)  # último - promedio 4y
    interest_coverage: Mapped[float | None] = mapped_column(Float)  # veces (5.0 = 5x)
    fcf_ttm: Mapped[float | None] = mapped_column(Float)  # USD
    fcf_margin_ttm: Mapped[float | None] = mapped_column(Float)
    fcf_positive_years_4y: Mapped[int | None] = mapped_column(Integer)
    fcf_cagr_5y: Mapped[float | None] = mapped_column(Float)
    revenue_ttm: Mapped[float | None] = mapped_column(Float)  # USD
    revenue_growth_ttm: Mapped[float | None] = mapped_column(Float)
    net_debt: Mapped[float | None] = mapped_column(Float)  # USD (deuda total - caja)
    shares_diluted: Mapped[float | None] = mapped_column(Float)

    raw: Mapped[dict[str, Any] | None] = mapped_column(JSONType)  # estados financieros crudos
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class DcfValuation(Base):
    """Valoración DCF por símbolo y fecha. Veredictos:
    COMPRA | VIGILAR | CARA | FILTRADA (no pasa filtro de calidad) | NO_VALORABLE (datos insuficientes).
    """

    __tablename__ = "dcf_valuations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(
        ForeignKey("tickers.symbol", ondelete="CASCADE"), index=True
    )
    as_of: Mapped[date] = mapped_column(Date)
    intrinsic_value: Mapped[float | None] = mapped_column(Float)  # USD por acción
    price_at_calc: Mapped[float | None] = mapped_column(Float)
    upside_pct: Mapped[float | None] = mapped_column(Float)  # porcentaje (23.4 = +23.4%)
    verdict: Mapped[str] = mapped_column(String(15))
    assumptions: Mapped[dict[str, Any] | None] = mapped_column(JSONType)  # supuestos auditables
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("symbol", "as_of", name="uq_dcf_symbol_asof"),)


class TechnicalSnapshot(Base):
    """Snapshot técnico por símbolo y fecha. Distancias en PORCENTAJE."""

    __tablename__ = "technical_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(
        ForeignKey("tickers.symbol", ondelete="CASCADE"), index=True
    )
    as_of: Mapped[date] = mapped_column(Date)
    last_close: Mapped[float | None] = mapped_column(Float)
    change_pct_1d: Mapped[float | None] = mapped_column(Float)
    ath: Mapped[float | None] = mapped_column(Float)
    drawdown_from_ath_pct: Mapped[float | None] = mapped_column(Float)  # negativo (-35.2)
    low_52w: Mapped[float | None] = mapped_column(Float)
    high_52w: Mapped[float | None] = mapped_column(Float)
    rally_from_low_pct: Mapped[float | None] = mapped_column(Float)  # positivo (+120.0)
    support: Mapped[float | None] = mapped_column(Float)
    resistance: Mapped[float | None] = mapped_column(Float)
    rsi14: Mapped[float | None] = mapped_column(Float)
    sma200: Mapped[float | None] = mapped_column(Float)
    dist_sma200_pct: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint("symbol", "as_of", name="uq_tech_symbol_asof"),)


class ScreenResult(Base):
    """Resultados de screens. screen: 'value' | 'growth' | 'event'.
    Para 'event', symbol es NULL y la idea completa vive en details.
    """

    __tablename__ = "screen_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    screen: Mapped[str] = mapped_column(String(10), index=True)
    as_of: Mapped[date] = mapped_column(Date, index=True)
    symbol: Mapped[str | None] = mapped_column(
        ForeignKey("tickers.symbol", ondelete="CASCADE"), nullable=True, index=True
    )
    score: Mapped[float | None] = mapped_column(Float)
    rank: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("screen", "as_of", "symbol", name="uq_screen_asof_symbol"),
    )


class Alert(Base):
    """Alertas del motor de reglas. status: new -> queued -> analyzed.
    kind: hard_drop | hard_spike | drawdown_cross | rally_cross | technical_break | breaking_news | system.
    severity: info | media | alta.
    agent_analysis: {bullets, interpretation, severity, fundamentals_intact, cause_identified}.
    """

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str | None] = mapped_column(
        ForeignKey("tickers.symbol", ondelete="CASCADE"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(30), index=True)
    severity: Mapped[str] = mapped_column(String(10), default="media")
    title: Mapped[str] = mapped_column(String(300))
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    dedup_key: Mapped[str | None] = mapped_column(String(200), index=True)
    status: Mapped[str] = mapped_column(String(15), default="new", index=True)
    agent_analysis: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), index=True
    )


class AlertState(Base):
    """Estado persistido por (símbolo, regla) para deduplicación de umbrales."""

    __tablename__ = "alert_states"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str] = mapped_column(
        ForeignKey("tickers.symbol", ondelete="CASCADE"), index=True
    )
    rule_key: Mapped[str] = mapped_column(String(40))
    state: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (UniqueConstraint("symbol", "rule_key", name="uq_alertstate_symbol_rule"),)


class AgentJob(Base):
    """Cola de trabajos para agentes IA. kind: research | event_scout | observer.
    status: pending | running | done | error | skipped.
    """

    __tablename__ = "agent_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class ObserverReport(Base):
    __tablename__ = "observer_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_date: Mapped[date] = mapped_column(Date, unique=True)
    markdown: Mapped[str] = mapped_column(Text)
    recommendations: Mapped[list[Any] | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class NewsItem(Base):
    """Titulares por ticker (symbol) o macro (symbol NULL)."""

    __tablename__ = "news_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    symbol: Mapped[str | None] = mapped_column(
        ForeignKey("tickers.symbol", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(String(100))
    published_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (Index("ix_news_symbol_published", "symbol", "published_at"),)
