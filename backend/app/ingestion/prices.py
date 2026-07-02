"""Ingesta de precios diarios OHLCV: yfinance en lotes, fallback Stooq."""
import io
import logging
import time
from datetime import date

import pandas as pd
import requests
import yfinance as yf
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import PriceDaily, Ticker

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}
STOOQ_URL = "https://stooq.com/q/d/l/?s={symbol}.us&i=d"


def _num(v: object) -> float | None:
    """float o None (NaN/faltante)."""
    if v is None or pd.isna(v):
        return None
    return float(v)


def _vol(v: object) -> int | None:
    """Volumen entero o None."""
    if v is None or pd.isna(v):
        return None
    return int(v)


def _resolve_symbols(session: Session, symbols: list[str] | None) -> list[str]:
    """symbols=None => activos; siempre incluye el benchmark (sin duplicados)."""
    if symbols is None:
        base = list(session.scalars(select(Ticker.symbol).where(Ticker.is_active.is_(True))))
    else:
        base = list(symbols)
    return list(dict.fromkeys([*base, settings.benchmark_symbol]))


def _max_dates(session: Session, symbols: list[str]) -> dict[str, date]:
    """Última fecha existente en prices_daily por símbolo."""
    rows = session.execute(
        select(PriceDaily.symbol, func.max(PriceDaily.date))
        .where(PriceDaily.symbol.in_(symbols))
        .group_by(PriceDaily.symbol)
    ).all()
    return {sym: d for sym, d in rows}


def _download_batch(batch: list[str], period: str) -> pd.DataFrame | None:
    """yf.download con reintentos (backoff 2s/4s, 3 intentos); None si falla."""
    for intento in range(3):
        try:
            return yf.download(
                tickers=batch,
                period=period,
                interval="1d",
                group_by="ticker",
                auto_adjust=False,
                progress=False,
                threads=True,
            )
        except Exception as exc:
            if intento == 2:
                logger.warning("yfinance falló para lote de %d símbolos: %s", len(batch), exc)
                return None
            time.sleep(2 ** (intento + 1))
    return None


def _symbol_frame(df: pd.DataFrame | None, symbol: str) -> pd.DataFrame | None:
    """Sub-frame OHLCV de un símbolo sin filas con close NaN; None si no hay datos."""
    if df is None or df.empty:
        return None
    if isinstance(df.columns, pd.MultiIndex):
        if symbol not in df.columns.get_level_values(0):
            return None
        sub = df[symbol]
    else:
        sub = df
    if "Close" not in sub.columns:
        return None
    sub = sub.dropna(subset=["Close"])
    return sub if not sub.empty else None


def _price_row(symbol: str, d: date, r: pd.Series) -> PriceDaily:
    return PriceDaily(
        symbol=symbol,
        date=d,
        open=_num(r.get("Open")),
        high=_num(r.get("High")),
        low=_num(r.get("Low")),
        close=float(r["Close"]),
        volume=_vol(r.get("Volume")),
    )


def _new_rows(symbol: str, sub: pd.DataFrame, after: date | None) -> list[PriceDaily]:
    """Filas posteriores a `after` (todas si after es None)."""
    rows: list[PriceDaily] = []
    seen: set[date] = set()
    for idx, r in sub.iterrows():
        d = idx.date() if hasattr(idx, "date") else idx
        if d in seen or (after is not None and d <= after):
            continue
        seen.add(d)
        rows.append(_price_row(symbol, d, r))
    return rows


def _stooq_backfill(session: Session, symbol: str, after: date | None) -> int:
    """Fallback Stooq (CSV diario) para un símbolo sin datos en yfinance."""
    url = STOOQ_URL.format(symbol=symbol.lower())
    text: str | None = None
    for intento in range(3):
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=20)
            resp.raise_for_status()
            text = resp.text
            break
        except Exception as exc:
            if intento == 2:
                logger.warning("Stooq falló para %s: %s", symbol, exc)
                return 0
            time.sleep(2 ** (intento + 1))
    if not text or not text.lstrip().startswith("Date"):
        logger.warning("Sin datos de precios para %s (ni yfinance ni Stooq)", symbol)
        return 0
    try:
        df = pd.read_csv(io.StringIO(text))
    except Exception as exc:
        logger.warning("CSV de Stooq ilegible para %s: %s", symbol, exc)
        return 0
    if "Close" not in df.columns or "Date" not in df.columns or df.empty:
        logger.warning("Sin datos de precios para %s (ni yfinance ni Stooq)", symbol)
        return 0
    rows: list[PriceDaily] = []
    seen: set[date] = set()
    for _, r in df.iterrows():
        close = _num(r.get("Close"))
        if close is None:
            continue
        d = pd.to_datetime(r["Date"]).date()
        if d in seen or (after is not None and d <= after):
            continue
        seen.add(d)
        rows.append(
            PriceDaily(
                symbol=symbol,
                date=d,
                open=_num(r.get("Open")),
                high=_num(r.get("High")),
                low=_num(r.get("Low")),
                close=close,
                volume=_vol(r.get("Volume")),
            )
        )
    if rows:
        session.add_all(rows)
        session.commit()
        logger.info("Stooq: %d filas insertadas para %s", len(rows), symbol)
    return len(rows)


def fetch_price_history(
    session: Session, symbols: list[str] | None = None, period: str | None = None
) -> int:
    """Backfill de histórico diario; inserta solo fechas nuevas. Devuelve filas insertadas."""
    period = period or settings.price_history_period
    syms = _resolve_symbols(session, symbols)
    max_dates = _max_dates(session, syms)
    total = 0
    missing: list[str] = []
    for i in range(0, len(syms), settings.price_batch_size):
        batch = syms[i : i + settings.price_batch_size]
        df = _download_batch(batch, period)
        got: set[str] = set()
        for sym in batch:
            sub = _symbol_frame(df, sym)
            if sub is None:
                continue
            got.add(sym)
            rows = _new_rows(sym, sub, max_dates.get(sym))
            if rows:
                session.add_all(rows)
                total += len(rows)
        session.commit()
        missing.extend(s for s in batch if s not in got)
    for sym in missing:
        total += _stooq_backfill(session, sym, max_dates.get(sym))
    logger.info("Histórico de precios: %d filas insertadas (%d símbolos)", total, len(syms))
    return total


def fetch_latest_prices(session: Session, symbols: list[str] | None = None) -> int:
    """Últimos 5 días: actualiza barras existentes (la de hoy cambia intradía) e inserta nuevas."""
    syms = _resolve_symbols(session, symbols)
    total = 0
    for i in range(0, len(syms), settings.price_batch_size):
        batch = syms[i : i + settings.price_batch_size]
        df = _download_batch(batch, "5d")
        if df is None or df.empty:
            continue
        start = df.index.min()
        start = start.date() if hasattr(start, "date") else start
        existing = {
            (p.symbol, p.date): p
            for p in session.scalars(
                select(PriceDaily).where(PriceDaily.symbol.in_(batch), PriceDaily.date >= start)
            )
        }
        for sym in batch:
            sub = _symbol_frame(df, sym)
            if sub is None:
                continue
            seen: set[date] = set()
            for idx, r in sub.iterrows():
                d = idx.date() if hasattr(idx, "date") else idx
                if d in seen:
                    continue
                seen.add(d)
                row = existing.get((sym, d))
                if row is None:
                    session.add(_price_row(sym, d, r))
                else:
                    row.open = _num(r.get("Open"))
                    row.high = _num(r.get("High"))
                    row.low = _num(r.get("Low"))
                    row.close = float(r["Close"])
                    row.volume = _vol(r.get("Volume"))
                total += 1
        session.commit()
    logger.info("Precios recientes: %d filas upsertadas", total)
    return total
