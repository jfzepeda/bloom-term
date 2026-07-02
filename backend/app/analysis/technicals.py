"""Análisis técnico: RSI, pivots y snapshots diarios (distancias en PORCENTAJE)."""
import logging
from datetime import date
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import PriceDaily, TechnicalSnapshot, Ticker

logger = logging.getLogger(__name__)

MIN_SESSIONS = 30


def pct_diff(value: float | None, reference: float | None) -> float | None:
    """Diferencia porcentual (value/reference - 1) * 100. None si falta dato o reference <= 0."""
    if value is None or reference is None or reference <= 0:
        return None
    return (value / reference - 1.0) * 100.0


def compute_rsi(closes: pd.Series, period: int = 14) -> float | None:
    """RSI método Wilder: EMA de ganancias/pérdidas con alpha=1/period.

    None si hay menos de period+1 datos.
    """
    if len(closes) < period + 1:
        return None
    deltas = closes.astype(float).diff().dropna()
    gains = deltas.clip(lower=0.0)
    losses = (-deltas).clip(lower=0.0)
    avg_gain = float(gains.ewm(alpha=1.0 / period, adjust=False).mean().iloc[-1])
    avg_loss = float(losses.ewm(alpha=1.0 / period, adjust=False).mean().iloc[-1])
    if avg_gain == 0.0 and avg_loss == 0.0:
        return 50.0
    if avg_loss == 0.0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - 100.0 / (1.0 + rs)


def find_pivots(closes: pd.Series, window: int = 5) -> tuple[list[float], list[float]]:
    """Pivots locales estrictos respecto a `window` barras a cada lado.

    Devuelve (pivot_lows, pivot_highs) en orden cronológico.
    """
    values = [float(v) for v in closes.tolist()]
    lows: list[float] = []
    highs: list[float] = []
    for i in range(window, len(values) - window):
        around = values[i - window : i] + values[i + 1 : i + window + 1]
        v = values[i]
        if v < min(around):
            lows.append(v)
        elif v > max(around):
            highs.append(v)
    return lows, highs


def _load_prices(session: Session, symbol: str) -> pd.DataFrame:
    """Carga fecha y cierre de prices_daily ordenados por fecha."""
    rows = session.execute(
        select(PriceDaily.date, PriceDaily.close)
        .where(PriceDaily.symbol == symbol)
        .order_by(PriceDaily.date)
    ).all()
    return pd.DataFrame(rows, columns=["date", "close"])


def _upsert_snapshot(session: Session, symbol: str, as_of: date, fields: dict[str, Any]) -> None:
    """Upsert de TechnicalSnapshot por (symbol, as_of)."""
    snap = session.scalars(
        select(TechnicalSnapshot).where(
            TechnicalSnapshot.symbol == symbol, TechnicalSnapshot.as_of == as_of
        )
    ).first()
    if snap is None:
        snap = TechnicalSnapshot(symbol=symbol, as_of=as_of)
        session.add(snap)
    for key, value in fields.items():
        setattr(snap, key, value)


def compute_technicals(session: Session, symbols: list[str] | None = None) -> int:
    """Calcula y upserta un TechnicalSnapshot por símbolo (fecha del último precio).

    symbols=None => todos los tickers activos más el benchmark. Símbolos con
    menos de 30 sesiones se saltan. Devuelve cuántos snapshots escribió.
    """
    if symbols is None:
        symbols = list(session.scalars(select(Ticker.symbol).where(Ticker.is_active.is_(True))))
        if settings.benchmark_symbol not in symbols:
            symbols.append(settings.benchmark_symbol)

    written = 0
    for symbol in symbols:
        df = _load_prices(session, symbol)
        if len(df) < MIN_SESSIONS:
            logger.debug("technicals: %s con %d sesiones (<%d), saltado", symbol, len(df), MIN_SESSIONS)
            continue

        closes = df["close"].astype(float)
        last = float(closes.iloc[-1])
        prev = float(closes.iloc[-2])
        ath = float(closes.max())
        win_52w = closes.iloc[-252:]
        low_52w = float(win_52w.min())
        high_52w = float(win_52w.max())

        win_pivots = closes.iloc[-settings.pivot_window_days :]
        pivot_lows, pivot_highs = find_pivots(win_pivots, window=5)
        support = next((v for v in reversed(pivot_lows) if v < last), float(win_pivots.min()))
        resistance = next((v for v in reversed(pivot_highs) if v > last), float(win_pivots.max()))

        sma200 = float(closes.iloc[-200:].mean()) if len(closes) >= 200 else None

        _upsert_snapshot(
            session,
            symbol,
            df["date"].iloc[-1],
            {
                "last_close": last,
                "change_pct_1d": pct_diff(last, prev),
                "ath": ath,
                "drawdown_from_ath_pct": pct_diff(last, ath),
                "low_52w": low_52w,
                "high_52w": high_52w,
                "rally_from_low_pct": pct_diff(last, low_52w),
                "support": support,
                "resistance": resistance,
                "rsi14": compute_rsi(closes, 14),
                "sma200": sma200,
                "dist_sma200_pct": pct_diff(last, sma200),
            },
        )
        written += 1

    session.commit()
    logger.info("technicals: %d snapshots escritos", written)
    return written
