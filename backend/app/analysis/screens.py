"""Screens de inversión: value (por upside DCF) y growth (score compuesto 0-100)."""
import logging
from datetime import date
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import DcfValuation, Fundamentals, PriceDaily, ScreenResult, Ticker

logger = logging.getLogger(__name__)

_VALUE_VERDICTS = ("COMPRA", "VIGILAR", "CARA")


def run_value_screen(session: Session) -> int:
    """Ranking por upside_pct de la DcfValuation más reciente por símbolo.

    Idempotente para hoy: borra y reescribe screen='value'. Devuelve n filas.
    """
    today = date.today()
    # Primero la valoración más reciente por símbolo (sin filtrar por verdict):
    # una degradación de hoy a FILTRADA/NO_VALORABLE debe sacar al símbolo del screen.
    rows = session.scalars(
        select(DcfValuation)
        .join(Ticker, Ticker.symbol == DcfValuation.symbol)
        .where(Ticker.is_active.is_(True))
        .order_by(DcfValuation.symbol, DcfValuation.as_of.desc())
    ).all()

    latest: dict[str, DcfValuation] = {}
    for row in rows:
        if row.symbol not in latest:
            latest[row.symbol] = row

    ranked = sorted(
        (
            r
            for r in latest.values()
            if r.verdict in _VALUE_VERDICTS and r.upside_pct is not None
        ),
        key=lambda r: r.upside_pct,
        reverse=True,
    )

    session.execute(
        delete(ScreenResult).where(ScreenResult.screen == "value", ScreenResult.as_of == today)
    )
    for rank, row in enumerate(ranked, start=1):
        session.add(
            ScreenResult(
                screen="value",
                as_of=today,
                symbol=row.symbol,
                score=row.upside_pct,
                rank=rank,
                details={
                    "verdict": row.verdict,
                    "intrinsic_value": row.intrinsic_value,
                    "price_at_calc": row.price_at_calc,
                    "upside_pct": row.upside_pct,
                    "assumptions": row.assumptions,
                },
            )
        )
    session.commit()
    logger.info("screen value: %d filas", len(ranked))
    return len(ranked)


def _linear_points(value: float, lo: float, hi: float) -> float:
    """Interpolación lineal a 0-100 entre lo y hi, con clamp."""
    points = (value - lo) / (hi - lo) * 100.0
    return min(100.0, max(0.0, points))


def _return_126(session: Session, symbol: str) -> float | None:
    """Retorno en fracción de las últimas 126 sesiones; None si faltan datos."""
    closes = session.scalars(
        select(PriceDaily.close)
        .where(PriceDaily.symbol == symbol)
        .order_by(PriceDaily.date.desc())
        .limit(127)
    ).all()
    if len(closes) < 127 or closes[-1] is None or closes[-1] <= 0 or closes[0] is None:
        return None
    return closes[0] / closes[-1] - 1.0


def _acceleration_delta(raw: dict[str, Any] | None) -> float | None:
    """Delta de crecimiento interanual entre los 2 trimestres más recientes computables."""
    quarters = (raw or {}).get("quarterly_revenue") or []
    growths: list[float] = []
    for i in range(len(quarters) - 4):
        rev_t = quarters[i].get("revenue")
        rev_prev = quarters[i + 4].get("revenue")
        if rev_t is not None and rev_prev is not None and rev_prev > 0:
            growths.append(rev_t / rev_prev - 1.0)
        if len(growths) == 2:
            break
    if len(growths) < 2:
        return None
    return growths[0] - growths[1]


def run_growth_screen(session: Session) -> int:
    """Score compuesto de crecimiento para símbolos activos con revenue_growth_ttm.

    Componentes 0-100 ponderados; detalles y etiquetas auditables en details.
    Idempotente para hoy: borra y reescribe screen='growth'. Devuelve n filas.
    """
    today = date.today()
    candidates = session.scalars(
        select(Fundamentals)
        .join(Ticker, Ticker.symbol == Fundamentals.symbol)
        .where(
            Ticker.is_active.is_(True),
            Fundamentals.symbol != settings.benchmark_symbol,
            Fundamentals.revenue_growth_ttm.is_not(None),
        )
    ).all()

    benchmark_return = _return_126(session, settings.benchmark_symbol)

    results: list[dict[str, Any]] = []
    for f in candidates:
        rev_growth = f.revenue_growth_ttm

        # crecimiento (0.25)
        pts_growth = _linear_points(rev_growth, 0.0, 0.30)

        # rule of 40 (0.20); fcf_margin None => solo growth
        r40 = (rev_growth + (f.fcf_margin_ttm or 0.0)) * 100.0 if f.fcf_margin_ttm is not None else rev_growth * 100.0
        pts_r40 = _linear_points(r40, 0.0, 60.0)

        # margen bruto (0.15)
        pts_gm = _linear_points(f.gross_margin, 0.20, 0.60) if f.gross_margin is not None else 0.0

        # PEG (0.15), inverso; None o <= 0 (beneficios en declive) -> 40 puntos y flag
        peg_valido = f.peg if f.peg is not None and f.peg > 0 else None
        peg_details: dict[str, Any] = {"valor": f.peg}
        if peg_valido is None:
            pts_peg = 40.0
            peg_details["flag"] = "sin_peg" if f.peg is None else "peg_invalido"
        else:
            pts_peg = 100.0 - _linear_points(peg_valido, 1.0, 2.5)
        peg_details["puntos"] = pts_peg

        # momentum 6m vs benchmark (0.15); sin datos -> 50 neutro
        symbol_return = _return_126(session, f.symbol)
        momentum = (
            symbol_return - benchmark_return
            if symbol_return is not None and benchmark_return is not None
            else None
        )
        pts_momentum = _linear_points(momentum, -0.30, 0.30) if momentum is not None else 50.0

        # aceleración (0.10); sin datos -> 50 neutro
        delta = _acceleration_delta(f.raw)
        pts_accel = _linear_points(delta, -0.10, 0.10) if delta is not None else 50.0

        score = round(
            0.25 * pts_growth
            + 0.20 * pts_r40
            + 0.15 * pts_gm
            + 0.15 * pts_peg
            + 0.15 * pts_momentum
            + 0.10 * pts_accel,
            1,
        )

        labels: list[str] = []
        if peg_valido is not None and peg_valido <= 1.5 and rev_growth >= 0.15:
            labels.append("GARP")
        if (peg_valido is None or peg_valido > 2.5) and delta is not None and delta > 0:
            labels.append("cara pero acelerando")
        if pts_momentum >= 80.0 and rev_growth < 0.10:
            labels.append("momentum puro")

        results.append(
            {
                "symbol": f.symbol,
                "score": score,
                "details": {
                    "crecimiento": {"valor": rev_growth, "puntos": pts_growth},
                    "rule_of_40": {"valor": r40, "puntos": pts_r40},
                    "margen_bruto": {"valor": f.gross_margin, "puntos": pts_gm},
                    "peg": peg_details,
                    "momentum": {"valor": momentum, "puntos": pts_momentum},
                    "aceleracion": {"valor": delta, "puntos": pts_accel},
                    "labels": labels,
                },
            }
        )

    results.sort(key=lambda r: r["score"], reverse=True)

    session.execute(
        delete(ScreenResult).where(ScreenResult.screen == "growth", ScreenResult.as_of == today)
    )
    for rank, item in enumerate(results, start=1):
        session.add(
            ScreenResult(
                screen="growth",
                as_of=today,
                symbol=item["symbol"],
                score=item["score"],
                rank=rank,
                details=item["details"],
            )
        )
    session.commit()
    logger.info("screen growth: %d filas", len(results))
    return len(results)
