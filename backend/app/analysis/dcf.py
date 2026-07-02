"""Valoración DCF conservadora con filtro de calidad previo.

Fundamentals en FRACCIÓN (0.15 = 15%); upside en PORCENTAJE (23.4 = +23.4%).
"""
import logging
import math
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import DcfValuation, Fundamentals, PriceDaily, Ticker

logger = logging.getLogger(__name__)


def dcf_intrinsic_value(
    fcf_base: float,
    growth_initial: float,
    discount_rate: float,
    terminal_growth: float,
    years: int,
    net_debt: float,
    shares_diluted: float,
) -> float | None:
    """Valor intrínseco por acción vía DCF.

    El crecimiento decae linealmente de growth_initial (año 1) a terminal_growth
    (año `years`). Proyecta FCF año a año, descuenta a discount_rate, añade valor
    terminal Gordon descontado al año final y resta net_debt. None si las
    acciones son inválidas o el resultado no es finito.
    """
    if shares_diluted is None or shares_diluted <= 0:
        return None
    if years < 1 or discount_rate <= terminal_growth:
        return None
    total = 0.0
    fcf = fcf_base
    for year in range(1, years + 1):
        if years == 1:
            growth = growth_initial
        else:
            growth = growth_initial + (terminal_growth - growth_initial) * (year - 1) / (years - 1)
        fcf *= 1.0 + growth
        total += fcf / (1.0 + discount_rate) ** year
    terminal = fcf * (1.0 + terminal_growth) / (discount_rate - terminal_growth)
    total += terminal / (1.0 + discount_rate) ** years
    value = (total - net_debt) / shares_diluted
    if not math.isfinite(value):
        return None
    return value


def _annual(f: Fundamentals) -> list[dict[str, Any]]:
    """Lista raw.annual (más reciente primero) o lista vacía."""
    return (f.raw or {}).get("annual") or []


def _quality_filters(f: Fundamentals) -> dict[str, bool | None]:
    """Evalúa los 5 criterios de calidad. None = dato insuficiente (cuenta como fallo)."""
    annual = _annual(f)
    filtros: dict[str, bool | None] = {}

    filtros["roe_avg_4y"] = f.roe_avg_4y > 0.15 if f.roe_avg_4y is not None else None

    if f.debt_to_equity is not None:
        filtros["debt_to_equity"] = f.debt_to_equity < 1.0
    elif f.net_debt is not None and f.net_debt <= 0:
        filtros["debt_to_equity"] = True  # sin deuda neta, D/E desconocido pasa
    else:
        filtros["debt_to_equity"] = None

    ultimos4 = annual[:4]
    anios_con_dato = sum(
        1
        for a in ultimos4
        if a.get("operating_cash_flow") is not None and a.get("capex") is not None
    )
    if f.fcf_positive_years_4y is None or anios_con_dato == 0:
        filtros["fcf_sostenido"] = None
    else:
        filtros["fcf_sostenido"] = anios_con_dato >= 3 and f.fcf_positive_years_4y == anios_con_dato

    filtros["operating_margin_trend"] = (
        f.operating_margin_trend >= -0.02 if f.operating_margin_trend is not None else None
    )

    if f.interest_coverage is not None:
        filtros["interest_coverage"] = f.interest_coverage > 5.0
    else:
        interest_expense = ultimos4[0].get("interest_expense") if ultimos4 else None
        sin_deuda = (
            (interest_expense is None or interest_expense == 0)
            and f.net_debt is not None
            and f.net_debt <= 0
        )
        filtros["interest_coverage"] = True if sin_deuda else None

    return filtros


def _no_valorable(motivo: str, assumptions: dict[str, Any], price: float | None = None) -> dict[str, Any]:
    """Campos de una valoración NO_VALORABLE."""
    assumptions = dict(assumptions)
    assumptions["motivo"] = motivo
    return {
        "intrinsic_value": None,
        "price_at_calc": price,
        "upside_pct": None,
        "verdict": "NO_VALORABLE",
        "assumptions": assumptions,
    }


def _value_symbol(session: Session, f: Fundamentals) -> dict[str, Any]:
    """Filtro de calidad + DCF para un símbolo; devuelve los campos de DcfValuation."""
    filtros = _quality_filters(f)
    fallidos = [k for k, v in filtros.items() if v is not True]
    if fallidos:
        return {
            "intrinsic_value": None,
            "price_at_calc": None,
            "upside_pct": None,
            "verdict": "FILTRADA",
            "assumptions": {
                "filtros": filtros,
                "motivo": "no pasa filtro de calidad: " + ", ".join(fallidos),
            },
        }

    fcfs = [
        a["operating_cash_flow"] - a["capex"]
        for a in _annual(f)[:3]
        if a.get("operating_cash_flow") is not None and a.get("capex") is not None
    ]
    if len(fcfs) < 3:
        return _no_valorable("menos de 3 años de FCF en raw.annual", {"filtros": filtros})
    fcf_base = sum(fcfs) / 3.0
    if fcf_base <= 0:
        return _no_valorable("fcf_base promedio de 3 años <= 0", {"filtros": filtros, "fcf_base": fcf_base})

    growth_src = f.fcf_cagr_5y if f.fcf_cagr_5y is not None else f.revenue_growth_ttm
    if growth_src is None:
        growth_initial = settings.dcf_terminal_growth
    else:
        growth_initial = min(max(growth_src, settings.dcf_terminal_growth), settings.dcf_growth_cap)

    net_debt = f.net_debt if f.net_debt is not None else 0.0
    assumptions: dict[str, Any] = {
        "fcf_base": fcf_base,
        "growth_initial": growth_initial,
        "discount_rate": settings.dcf_discount_rate,
        "terminal_growth": settings.dcf_terminal_growth,
        "years": settings.dcf_horizon_years,
        "net_debt": net_debt,
        "shares_diluted": f.shares_diluted,
        "filtros": filtros,
    }

    price = session.scalars(
        select(PriceDaily.close)
        .where(PriceDaily.symbol == f.symbol)
        .order_by(PriceDaily.date.desc())
        .limit(1)
    ).first()
    if price is None or price <= 0:
        return _no_valorable("sin precio en prices_daily", assumptions)

    if f.shares_diluted is None or f.shares_diluted <= 0:
        intrinsic = None
    else:
        intrinsic = dcf_intrinsic_value(
            fcf_base,
            growth_initial,
            settings.dcf_discount_rate,
            settings.dcf_terminal_growth,
            settings.dcf_horizon_years,
            net_debt,
            f.shares_diluted,
        )
    if intrinsic is None:
        return _no_valorable("shares_diluted inválidas o DCF no finito", assumptions, price=float(price))

    upside_pct = (intrinsic / price - 1.0) * 100.0
    if price < intrinsic * (1.0 - settings.dcf_margin_of_safety):
        verdict = "COMPRA"
    elif price > intrinsic:
        verdict = "CARA"
    else:
        verdict = "VIGILAR"

    return {
        "intrinsic_value": intrinsic,
        "price_at_calc": float(price),
        "upside_pct": upside_pct,
        "verdict": verdict,
        "assumptions": assumptions,
    }


def _upsert_valuation(session: Session, symbol: str, as_of: date, fields: dict[str, Any]) -> None:
    """Upsert de DcfValuation por (symbol, as_of)."""
    row = session.scalars(
        select(DcfValuation).where(DcfValuation.symbol == symbol, DcfValuation.as_of == as_of)
    ).first()
    if row is None:
        row = DcfValuation(symbol=symbol, as_of=as_of)
        session.add(row)
    for key, value in fields.items():
        setattr(row, key, value)


def run_dcf(session: Session, symbols: list[str] | None = None) -> int:
    """Valora cada símbolo activo con Fundamentals (excluye benchmark).

    Upsert de DcfValuation por (symbol, as_of=hoy). Devuelve cuántas escribió.
    """
    stmt = (
        select(Fundamentals)
        .join(Ticker, Ticker.symbol == Fundamentals.symbol)
        .where(Ticker.is_active.is_(True), Fundamentals.symbol != settings.benchmark_symbol)
    )
    if symbols is not None:
        stmt = stmt.where(Fundamentals.symbol.in_(symbols))

    today = date.today()
    written = 0
    for f in session.scalars(stmt):
        fields = _value_symbol(session, f)
        _upsert_valuation(session, f.symbol, today, fields)
        written += 1

    session.commit()
    logger.info("dcf: %d valoraciones escritas", written)
    return written
