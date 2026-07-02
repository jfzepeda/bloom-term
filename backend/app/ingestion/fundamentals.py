"""Ingesta de fundamentales con rotación diaria (yfinance). Ratios en FRACCIÓN."""
import logging
import math
import random
import time
from datetime import date
from typing import Any, Callable

import pandas as pd
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Fundamentals, Ticker

logger = logging.getLogger(__name__)

# Filas de yfinance por estado financiero (con nombres alternativos)
_INCOME_ROWS: dict[str, tuple[str, ...]] = {
    "revenue": ("Total Revenue",),
    "gross_profit": ("Gross Profit",),
    "operating_income": ("Operating Income",),
    "net_income": ("Net Income",),
    "interest_expense": ("Interest Expense",),
    "shares_diluted": ("Diluted Average Shares",),
}
_BALANCE_ROWS: dict[str, tuple[str, ...]] = {
    "total_equity": ("Stockholders Equity", "Total Stockholder Equity", "Common Stock Equity"),
    "total_debt": ("Total Debt",),
    "cash": ("Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments"),
}
_CASHFLOW_ROWS: dict[str, tuple[str, ...]] = {
    "operating_cash_flow": ("Operating Cash Flow",),
    "capex": ("Capital Expenditure",),
}
_ABS_FIELDS = ("capex", "interest_expense")


def _num(v: object) -> float | None:
    """float finito o None."""
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def _div(a: float | None, b: float | None) -> float | None:
    """a/b tolerante a None y división por cero."""
    if a is None or b is None or b == 0:
        return None
    return a / b


def _row(df: pd.DataFrame | None, *names: str) -> list[float | None]:
    """Valores de la primera fila presente entre `names`, alineados a df.columns."""
    if df is None or df.empty:
        return []
    for name in names:
        if name in df.index:
            serie = df.loc[name]
            if isinstance(serie, pd.DataFrame):
                serie = serie.iloc[0]
            return [_num(v) for v in serie]
    return [None] * len(df.columns)


def _by_year(df: pd.DataFrame | None, names: tuple[str, ...]) -> dict[int, float | None]:
    """Métrica por año fiscal (columna más reciente gana ante duplicados)."""
    if df is None or df.empty:
        return {}
    vals = _row(df, *names)
    out: dict[int, float | None] = {}
    for col, v in zip(df.columns, vals):
        year = getattr(col, "year", None)
        if year is not None and year not in out:
            out[year] = v
    return out


def _safe_df(getter: Callable[[], Any]) -> pd.DataFrame | None:
    """DataFrame no vacío o None ante error/ausencia."""
    try:
        df = getter()
    except Exception:
        return None
    return df if isinstance(df, pd.DataFrame) and not df.empty else None


def _annual_records(
    income: pd.DataFrame | None, balance: pd.DataFrame | None, cashflow: pd.DataFrame | None
) -> list[dict[str, Any]]:
    """Hasta 5 años fiscales, más reciente primero, según el esquema de raw."""
    maps: dict[str, dict[int, float | None]] = {}
    for key, names in _INCOME_ROWS.items():
        maps[key] = _by_year(income, names)
    for key, names in _BALANCE_ROWS.items():
        maps[key] = _by_year(balance, names)
    for key, names in _CASHFLOW_ROWS.items():
        maps[key] = _by_year(cashflow, names)
    years = sorted({y for m in maps.values() for y in m}, reverse=True)[:5]
    records: list[dict[str, Any]] = []
    for y in years:
        rec: dict[str, Any] = {"year": y}
        for key, m in maps.items():
            rec[key] = m.get(y)
        for key in _ABS_FIELDS:
            if rec[key] is not None:
                rec[key] = abs(rec[key])
        records.append(rec)
    return records


def _quarterly_revenue(qis: pd.DataFrame | None) -> list[dict[str, Any]]:
    """Hasta 8 trimestres de revenue, más reciente primero."""
    if qis is None or qis.empty:
        return []
    vals = _row(qis, "Total Revenue")
    out: list[dict[str, Any]] = []
    for col, v in zip(qis.columns, vals):
        if not hasattr(col, "date"):
            continue
        out.append({"period": col.date().isoformat(), "revenue": v})
    return out[:8]


def _fcf(rec: dict[str, Any]) -> float | None:
    """FCF anual = operating_cash_flow - capex."""
    ocf, capex = rec.get("operating_cash_flow"), rec.get("capex")
    if ocf is None or capex is None:
        return None
    return ocf - capex


def _metrics(
    annual: list[dict[str, Any]], quarters: list[dict[str, Any]], info: dict[str, Any]
) -> dict[str, Any]:
    """Columnas derivadas de Fundamentals (ratios en fracción)."""
    a0: dict[str, Any] = annual[0] if annual else {}

    roes = [x for x in (_div(r.get("net_income"), r.get("total_equity")) for r in annual[:4]) if x is not None]
    operating_margin = _div(a0.get("operating_income"), a0.get("revenue"))
    margins = [x for x in (_div(r.get("operating_income"), r.get("revenue")) for r in annual[:4]) if x is not None]
    margin_trend = (
        operating_margin - sum(margins) / len(margins)
        if operating_margin is not None and len(margins) >= 2
        else None
    )

    fcf_ttm = _fcf(a0) if annual else None
    fcf_4y = [f for f in (_fcf(r) for r in annual[:4]) if f is not None]
    fcf_series = [(r["year"], _fcf(r)) for r in annual if _fcf(r) is not None]
    fcf_cagr: float | None = None
    if len(fcf_series) >= 2:
        (y_new, f_new), (y_old, f_old) = fcf_series[0], fcf_series[-1]
        n = y_new - y_old
        if n >= 3 and f_new > 0 and f_old > 0:
            fcf_cagr = (f_new / f_old) ** (1 / n) - 1

    qrev = [q["revenue"] for q in quarters]
    if len(qrev) >= 4 and all(v is not None for v in qrev[:4]):
        revenue_ttm: float | None = sum(qrev[:4])
    else:
        revenue_ttm = a0.get("revenue")
    revenue_growth: float | None = None
    if len(qrev) >= 8 and all(v is not None for v in qrev[:8]):
        prev4 = sum(qrev[4:8])
        revenue_growth = sum(qrev[:4]) / prev4 - 1 if prev4 > 0 else None
    elif len(annual) >= 2:
        r0, r1 = a0.get("revenue"), annual[1].get("revenue")
        revenue_growth = r0 / r1 - 1 if r0 is not None and r1 is not None and r1 > 0 else None

    interest_expense = a0.get("interest_expense")
    net_debt = (
        a0["total_debt"] - a0["cash"]
        if a0.get("total_debt") is not None and a0.get("cash") is not None
        else None
    )
    peg = _num(info.get("trailingPegRatio"))
    if peg is None:
        peg = _num(info.get("pegRatio"))

    return {
        "pe": _num(info.get("trailingPE")),
        "peg": peg,
        "roe_ttm": _div(a0.get("net_income"), a0.get("total_equity")),
        "roe_avg_4y": sum(roes) / len(roes) if roes else None,
        "debt_to_equity": _div(a0.get("total_debt"), a0.get("total_equity")),
        "gross_margin": _div(a0.get("gross_profit"), a0.get("revenue")),
        "operating_margin": operating_margin,
        "operating_margin_trend": margin_trend,
        "interest_coverage": _div(a0.get("operating_income"), interest_expense),
        "fcf_ttm": fcf_ttm,
        "fcf_margin_ttm": _div(fcf_ttm, a0.get("revenue")),
        "fcf_positive_years_4y": sum(1 for f in fcf_4y if f > 0) if fcf_4y else None,
        "fcf_cagr_5y": fcf_cagr,
        "revenue_ttm": revenue_ttm,
        "revenue_growth_ttm": revenue_growth,
        "net_debt": net_debt,
        "shares_diluted": a0.get("shares_diluted"),
    }


def next_rotation_batch(session: Session, batch_size: int | None = None) -> list[str]:
    """Símbolos activos más desactualizados (sin registro Fundamentals primero)."""
    size = batch_size or settings.fundamentals_batch_per_day
    stmt = (
        select(Ticker.symbol)
        .outerjoin(Fundamentals, Fundamentals.symbol == Ticker.symbol)
        .where(Ticker.is_active.is_(True), Ticker.symbol != settings.benchmark_symbol)
        .order_by(Fundamentals.updated_at.asc().nulls_first(), Ticker.symbol.asc())
        .limit(size)
    )
    return list(session.scalars(stmt))


def _fetch_one(session: Session, symbol: str) -> bool:
    """Descarga y upserta los fundamentales de un símbolo. False si no hubo datos."""
    t = yf.Ticker(symbol)
    try:
        info: dict[str, Any] = t.info or {}
    except Exception:
        info = {}
    income = _safe_df(lambda: t.income_stmt)
    balance = _safe_df(lambda: t.balance_sheet)
    cashflow = _safe_df(lambda: t.cashflow)
    qis = _safe_df(lambda: t.quarterly_income_stmt)

    annual = _annual_records(income, balance, cashflow)
    quarters = _quarterly_revenue(qis)
    if not annual and not quarters and not info:
        return False

    fund = session.scalar(select(Fundamentals).where(Fundamentals.symbol == symbol))
    if fund is None:
        fund = Fundamentals(symbol=symbol)
        session.add(fund)
    fund.as_of = date.today()
    fund.raw = {"annual": annual, "quarterly_revenue": quarters}
    for key, value in _metrics(annual, quarters, info).items():
        setattr(fund, key, value)

    market_cap = _num(info.get("marketCap"))
    if market_cap is not None:
        ticker = session.get(Ticker, symbol)
        if ticker is not None:
            ticker.market_cap = int(market_cap)
    return True


def fetch_fundamentals_batch(session: Session, symbols: list[str]) -> int:
    """Actualiza fundamentales de los símbolos dados. Devuelve cuántos actualizó."""
    updated = 0
    for symbol in symbols:
        time.sleep(random.uniform(0.5, 1.5))
        try:
            if _fetch_one(session, symbol):
                session.commit()
                updated += 1
            else:
                logger.warning("Sin datos fundamentales para %s", symbol)
        except Exception as exc:
            session.rollback()
            logger.warning("Fundamentales de %s fallaron: %s", symbol, exc)
    logger.info("Fundamentales actualizados: %d/%d", updated, len(symbols))
    return updated
