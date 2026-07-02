"""Refresco del universo de tickers: S&P 500 (+flag Nasdaq-100) desde Wikipedia."""
import io
import logging
import time
from datetime import date

import pandas as pd
import requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Alert, Ticker

logger = logging.getLogger(__name__)

SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
NASDAQ100_URL = "https://en.wikipedia.org/wiki/Nasdaq-100"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}


def _get_html(url: str) -> str | None:
    """GET con reintentos y backoff exponencial (3 intentos)."""
    for intento in range(3):
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=20)
            resp.raise_for_status()
            return resp.text
        except Exception as exc:
            if intento == 2:
                logger.warning("GET %s falló: %s", url, exc)
                return None
            time.sleep(2 ** (intento + 1))
    return None


def _norm_symbol(raw: object) -> str:
    """Normaliza a formato Yahoo (BRK.B -> BRK-B)."""
    return str(raw).strip().upper().replace(".", "-")


def _cell(row: pd.Series, col: str | None) -> str | None:
    """Valor de celda como str o None si falta."""
    if col is None:
        return None
    v = row.get(col)
    if v is None or pd.isna(v):
        return None
    s = str(v).strip()
    return s or None


def _sp500_rows() -> list[dict]:
    """Filas de constituyentes del S&P 500; [] si el scrape falla."""
    html = _get_html(SP500_URL)
    if not html:
        return []
    try:
        tables = pd.read_html(io.StringIO(html))
    except ValueError:
        return []
    for df in tables:
        if isinstance(df.columns, pd.MultiIndex):
            continue
        cols = {str(c).strip().lower(): c for c in df.columns}
        if "symbol" not in cols or "security" not in cols:
            continue
        rows: list[dict] = []
        for _, r in df.iterrows():
            sym = r.get(cols["symbol"])
            if sym is None or pd.isna(sym):
                continue
            rows.append(
                {
                    "symbol": _norm_symbol(sym),
                    "name": _cell(r, cols.get("security")),
                    "sector": _cell(r, cols.get("gics sector")),
                    "industry": _cell(r, cols.get("gics sub-industry")),
                }
            )
        if rows:
            return rows
    return []


def _nasdaq100_symbols() -> set[str] | None:
    """Símbolos del Nasdaq-100; None si el scrape falla (no tocar flags)."""
    html = _get_html(NASDAQ100_URL)
    if not html:
        return None
    try:
        tables = pd.read_html(io.StringIO(html))
    except ValueError:
        return None
    for df in tables:
        if isinstance(df.columns, pd.MultiIndex):
            continue
        cols = {str(c).strip().lower(): c for c in df.columns}
        sym_col = cols.get("ticker") or cols.get("symbol")
        if sym_col is None or ("company" not in cols and "security" not in cols):
            continue
        syms = {_norm_symbol(v) for v in df[sym_col].dropna()}
        if len(syms) >= 80:  # tamaño plausible de la lista
            return syms
    return None


def _ensure_benchmark(session: Session, existing: dict[str, Ticker]) -> None:
    """Garantiza el ticker del benchmark (inactivo, solo para precios)."""
    sym = settings.benchmark_symbol
    if sym not in existing:
        session.add(Ticker(symbol=sym, name="S&P 500 Index", sector="Index", is_active=False))


def _create_system_alert(session: Session, n_rows: int) -> None:
    """Alerta de sistema (dedupe por día) cuando el scrape viene incompleto."""
    key = f"system:universe:{date.today().isoformat()}"
    if session.scalar(select(Alert.id).where(Alert.dedup_key == key)) is None:
        session.add(
            Alert(
                kind="system",
                severity="alta",
                title=(
                    f"Refresco de universo incompleto: el scrape del S&P 500 devolvió "
                    f"{n_rows} filas (mínimo {settings.min_universe_rows}); "
                    "no se modificó is_active de ningún ticker"
                ),
                dedup_key=key,
                status="new",
            )
        )
        session.commit()


def refresh_universe(session: Session) -> dict:
    """Scrapea Wikipedia y sincroniza la tabla tickers.

    Devuelve {"total": int, "added": [str], "removed": [str]}.
    """
    rows = _sp500_rows()
    if len(rows) < settings.min_universe_rows:
        logger.warning(
            "Scrape del S&P 500 devolvió %d filas (< %d); universo sin cambios",
            len(rows),
            settings.min_universe_rows,
        )
        _create_system_alert(session, len(rows))
        return {"total": len(rows), "added": [], "removed": []}

    nasdaq = _nasdaq100_symbols()
    if nasdaq is None:
        logger.warning("No se pudo leer Nasdaq-100; se conservan los flags actuales")

    existing = {t.symbol: t for t in session.scalars(select(Ticker))}
    added: list[str] = []
    for row in rows:
        sym = row["symbol"]
        t = existing.get(sym)
        if t is None:
            t = Ticker(symbol=sym)
            session.add(t)
            existing[sym] = t
            added.append(sym)
        elif not t.is_active:
            added.append(sym)
        t.name = row["name"] or t.name
        t.sector = row["sector"] or t.sector
        t.industry = row["industry"] or t.industry
        t.is_active = True
        if nasdaq is not None:
            t.is_nasdaq100 = sym in nasdaq

    current = {row["symbol"] for row in rows}
    removed: list[str] = []
    for sym, t in existing.items():
        if t.is_active and sym not in current and sym != settings.benchmark_symbol:
            t.is_active = False
            removed.append(sym)

    _ensure_benchmark(session, existing)
    session.commit()
    logger.info("Universo: %d filas, +%d, -%d", len(rows), len(added), len(removed))
    return {"total": len(rows), "added": added, "removed": removed}
