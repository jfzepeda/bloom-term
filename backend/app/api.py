"""Rutas REST de Market Sentinel (prefijo /api montado en main.py)."""
import logging
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import db
from app.config import settings
from app.models import (
    Alert,
    DcfValuation,
    Fundamentals,
    NewsItem,
    ObserverReport,
    PriceDaily,
    ScreenResult,
    TechnicalSnapshot,
    Ticker,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers de serialización
# ---------------------------------------------------------------------------

def _iso(x: date | datetime | None) -> str | None:
    """Serializa date/datetime a ISO 8601; None pasa tal cual."""
    return x.isoformat() if x is not None else None


def _row_dict(obj: Any, exclude: set[str] | None = None) -> dict[str, Any]:
    """Convierte una fila ORM a dict plano, serializando fechas."""
    exclude = exclude or set()
    out: dict[str, Any] = {}
    for col in obj.__table__.columns:
        if col.name in exclude:
            continue
        val = getattr(obj, col.name)
        out[col.name] = _iso(val) if isinstance(val, (date, datetime)) else val
    return out


def _alert_dict(a: Alert) -> dict[str, Any]:
    """Serializa una Alert al shape del contrato."""
    return {
        "id": a.id,
        "symbol": a.symbol,
        "kind": a.kind,
        "severity": a.severity,
        "title": a.title,
        "payload": a.payload,
        "status": a.status,
        "agent_analysis": a.agent_analysis,
        "created_at": _iso(a.created_at),
    }


def _observer_dict(r: ObserverReport) -> dict[str, Any]:
    return {
        "report_date": _iso(r.report_date),
        "markdown": r.markdown,
        "recommendations": r.recommendations,
    }


def _latest_by_symbol(session: Session, model: type[Any]) -> dict[str, Any]:
    """Fila más reciente (max as_of) por símbolo para modelos con symbol/as_of."""
    latest = (
        select(model.symbol, func.max(model.as_of).label("max_as_of"))
        .group_by(model.symbol)
        .subquery()
    )
    rows = session.scalars(
        select(model).join(
            latest,
            (model.symbol == latest.c.symbol) & (model.as_of == latest.c.max_as_of),
        )
    ).all()
    return {r.symbol: r for r in rows}


def _latest_growth_scores(session: Session) -> dict[str, float | None]:
    """Score del screen growth de la fecha más reciente, por símbolo."""
    max_date = session.scalar(
        select(func.max(ScreenResult.as_of)).where(ScreenResult.screen == "growth")
    )
    if max_date is None:
        return {}
    rows = session.execute(
        select(ScreenResult.symbol, ScreenResult.score).where(
            ScreenResult.screen == "growth", ScreenResult.as_of == max_date
        )
    ).all()
    return {sym: score for sym, score in rows if sym}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/health")
def health() -> dict[str, str]:
    """Chequeo de vida del servicio."""
    return {"status": "ok"}


@router.get("/universe")
def get_universe(
    sector: str | None = None,
    cap_min: float | None = None,
    cap_max: float | None = None,
    nasdaq100: bool | None = None,
    q: str | None = None,
    session: Session = Depends(db.get_db),
) -> dict[str, Any]:
    """Universo de tickers activos con último técnico, DCF y score growth."""
    stmt = select(Ticker).where(
        Ticker.is_active.is_(True), Ticker.symbol != settings.benchmark_symbol
    )
    if sector:
        stmt = stmt.where(Ticker.sector == sector)
    if cap_min is not None:
        stmt = stmt.where(Ticker.market_cap >= cap_min)
    if cap_max is not None:
        stmt = stmt.where(Ticker.market_cap <= cap_max)
    if nasdaq100:
        stmt = stmt.where(Ticker.is_nasdaq100.is_(True))
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(or_(Ticker.symbol.ilike(pattern), Ticker.name.ilike(pattern)))
    stmt = stmt.order_by(Ticker.market_cap.desc().nulls_last(), Ticker.symbol.asc())
    tickers = session.scalars(stmt).all()

    tech_by_symbol = _latest_by_symbol(session, TechnicalSnapshot)
    dcf_by_symbol = _latest_by_symbol(session, DcfValuation)
    growth_by_symbol = _latest_growth_scores(session)

    items: list[dict[str, Any]] = []
    for t in tickers:
        tech = tech_by_symbol.get(t.symbol)
        dcf = dcf_by_symbol.get(t.symbol)
        items.append(
            {
                "symbol": t.symbol,
                "name": t.name,
                "sector": t.sector,
                "industry": t.industry,
                "market_cap": t.market_cap,
                "is_nasdaq100": t.is_nasdaq100,
                "last_close": tech.last_close if tech else None,
                "change_pct_1d": tech.change_pct_1d if tech else None,
                "drawdown_from_ath_pct": tech.drawdown_from_ath_pct if tech else None,
                "rally_from_low_pct": tech.rally_from_low_pct if tech else None,
                "rsi14": tech.rsi14 if tech else None,
                "dist_sma200_pct": tech.dist_sma200_pct if tech else None,
                "dcf_verdict": dcf.verdict if dcf else None,
                "dcf_upside_pct": dcf.upside_pct if dcf else None,
                "growth_score": growth_by_symbol.get(t.symbol),
            }
        )
    return {"items": items, "total": len(items)}


_VALID_SCREENS = ("value", "growth", "event")


@router.get("/screens/{screen_name}")
def get_screen(screen_name: str, session: Session = Depends(db.get_db)) -> dict[str, Any]:
    """Resultados del screen en su fecha más reciente, ordenados por rank."""
    if screen_name not in _VALID_SCREENS:
        raise HTTPException(
            status_code=404,
            detail=f"Screen desconocido. Válidos: {', '.join(_VALID_SCREENS)}",
        )
    max_date = session.scalar(
        select(func.max(ScreenResult.as_of)).where(ScreenResult.screen == screen_name)
    )
    if max_date is None:
        return {"as_of": None, "items": []}

    results = session.scalars(
        select(ScreenResult)
        .where(ScreenResult.screen == screen_name, ScreenResult.as_of == max_date)
        .order_by(ScreenResult.rank.asc())
    ).all()

    symbols = [r.symbol for r in results if r.symbol]
    ticker_map: dict[str, Ticker] = {}
    if symbols:
        ticker_map = {
            t.symbol: t
            for t in session.scalars(select(Ticker).where(Ticker.symbol.in_(symbols)))
        }

    items: list[dict[str, Any]] = []
    for r in results:
        if r.symbol is not None:
            t = ticker_map.get(r.symbol)
            items.append(
                {
                    "symbol": r.symbol,
                    "name": t.name if t else None,
                    "sector": t.sector if t else None,
                    "score": r.score,
                    "rank": r.rank,
                    "details": r.details,
                }
            )
        else:
            items.append(
                {"symbol": None, "score": r.score, "rank": r.rank, "details": r.details}
            )
    return {"as_of": _iso(max_date), "items": items}


@router.get("/alerts")
def get_alerts(
    since: datetime | None = None,
    severity: str | None = None,
    status: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(db.get_db),
) -> dict[str, Any]:
    """Alertas más recientes con filtros opcionales."""
    stmt = select(Alert)
    if since is not None:
        stmt = stmt.where(Alert.created_at >= since)
    if severity:
        stmt = stmt.where(Alert.severity == severity)
    if status:
        stmt = stmt.where(Alert.status == status)
    stmt = stmt.order_by(Alert.created_at.desc()).limit(limit)
    alerts = session.scalars(stmt).all()
    return {"items": [_alert_dict(a) for a in alerts]}


@router.get("/tickers/{symbol}")
def get_ticker_detail(symbol: str, session: Session = Depends(db.get_db)) -> dict[str, Any]:
    """Ficha completa de un ticker: precios, técnicos, fundamentals, DCF, news y alertas."""
    sym = symbol.upper()
    ticker = session.get(Ticker, sym)
    if ticker is None:
        raise HTTPException(status_code=404, detail=f"Ticker {sym} no encontrado")

    year_ago = date.today() - timedelta(days=365)
    price_rows = session.execute(
        select(PriceDaily.date, PriceDaily.close, PriceDaily.volume)
        .where(PriceDaily.symbol == sym, PriceDaily.date >= year_ago)
        .order_by(PriceDaily.date.asc())
    ).all()

    tech = session.scalars(
        select(TechnicalSnapshot)
        .where(TechnicalSnapshot.symbol == sym)
        .order_by(TechnicalSnapshot.as_of.desc())
        .limit(1)
    ).first()
    fund = session.scalars(
        select(Fundamentals).where(Fundamentals.symbol == sym)
    ).first()
    dcf = session.scalars(
        select(DcfValuation)
        .where(DcfValuation.symbol == sym)
        .order_by(DcfValuation.as_of.desc())
        .limit(1)
    ).first()
    news = session.scalars(
        select(NewsItem)
        .where(NewsItem.symbol == sym)
        .order_by(NewsItem.published_at.desc().nulls_last())
        .limit(20)
    ).all()
    alerts = session.scalars(
        select(Alert)
        .where(Alert.symbol == sym)
        .order_by(Alert.created_at.desc())
        .limit(20)
    ).all()

    return {
        "ticker": {
            "symbol": ticker.symbol,
            "name": ticker.name,
            "sector": ticker.sector,
            "industry": ticker.industry,
            "market_cap": ticker.market_cap,
            "is_nasdaq100": ticker.is_nasdaq100,
        },
        "prices": [
            {"date": _iso(d), "close": c, "volume": v} for d, c, v in price_rows
        ],
        "technicals": _row_dict(tech) if tech else None,
        "fundamentals": _row_dict(fund, exclude={"raw"}) if fund else None,
        "dcf": {
            "as_of": _iso(dcf.as_of),
            "intrinsic_value": dcf.intrinsic_value,
            "price_at_calc": dcf.price_at_calc,
            "upside_pct": dcf.upside_pct,
            "verdict": dcf.verdict,
            "assumptions": dcf.assumptions,
        }
        if dcf
        else None,
        "news": [
            {
                "title": n.title,
                "url": n.url,
                "source": n.source,
                "published_at": _iso(n.published_at),
            }
            for n in news
        ],
        "alerts": [_alert_dict(a) for a in alerts],
    }


@router.get("/observer/latest")
def get_observer_latest(session: Session = Depends(db.get_db)) -> dict[str, Any]:
    """Último reporte del observador."""
    report = session.scalars(
        select(ObserverReport).order_by(ObserverReport.report_date.desc()).limit(1)
    ).first()
    if report is None:
        raise HTTPException(status_code=404, detail="No hay reportes del observador")
    return _observer_dict(report)


@router.get("/observer/{report_date}")
def get_observer_by_date(
    report_date: str, session: Session = Depends(db.get_db)
) -> dict[str, Any]:
    """Reporte del observador para una fecha YYYY-MM-DD."""
    try:
        parsed = datetime.strptime(report_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Fecha inválida, formato esperado YYYY-MM-DD"
        ) from None
    report = session.scalars(
        select(ObserverReport).where(ObserverReport.report_date == parsed)
    ).first()
    if report is None:
        raise HTTPException(
            status_code=404, detail=f"No hay reporte para {report_date}"
        )
    return _observer_dict(report)


# ---------------------------------------------------------------------------
# Admin: disparo manual de jobs (imports perezosos, sesión propia)
# ---------------------------------------------------------------------------

def _job_universe() -> None:
    from app.ingestion.universe import refresh_universe

    with db.session_scope() as session:
        refresh_universe(session)


def _job_prices_history() -> None:
    from app.ingestion.prices import fetch_price_history

    with db.session_scope() as session:
        fetch_price_history(session)


def _job_prices_latest() -> None:
    from app.ingestion.prices import fetch_latest_prices

    with db.session_scope() as session:
        fetch_latest_prices(session)


def _job_fundamentals() -> None:
    from app.ingestion.fundamentals import fetch_fundamentals_batch, next_rotation_batch

    with db.session_scope() as session:
        symbols = next_rotation_batch(session)
        fetch_fundamentals_batch(session, symbols)


def _job_technicals() -> None:
    from app.analysis.technicals import compute_technicals

    with db.session_scope() as session:
        compute_technicals(session)


def _job_dcf() -> None:
    from app.analysis.dcf import run_dcf

    with db.session_scope() as session:
        run_dcf(session)


def _job_screens() -> None:
    from app.analysis.screens import run_growth_screen, run_value_screen

    with db.session_scope() as session:
        run_value_screen(session)
        run_growth_screen(session)


def _job_news_macro() -> None:
    from app.ingestion.news import fetch_macro_news

    with db.session_scope() as session:
        fetch_macro_news(session)


def _job_news_alerts() -> None:
    from app.ingestion.news import prioritized_news_refresh

    with db.session_scope() as session:
        prioritized_news_refresh(session)


def _job_scan_alerts() -> None:
    from app.alerts.engine import scan_alerts

    with db.session_scope() as session:
        scan_alerts(session)


def _job_agent_jobs() -> None:
    from app.agents.runner import process_agent_jobs

    with db.session_scope() as session:
        process_agent_jobs(session)


def _job_event_scout() -> None:
    from app.agents.event_scout import run_event_scout

    with db.session_scope() as session:
        run_event_scout(session)


def _job_observer() -> None:
    from app.agents.observer import run_observer

    with db.session_scope() as session:
        run_observer(session)


JOBS: dict[str, Callable[[], None]] = {
    "universe": _job_universe,
    "prices_history": _job_prices_history,
    "prices_latest": _job_prices_latest,
    "fundamentals": _job_fundamentals,
    "technicals": _job_technicals,
    "dcf": _job_dcf,
    "screens": _job_screens,
    "news_macro": _job_news_macro,
    "news_alerts": _job_news_alerts,
    "scan_alerts": _job_scan_alerts,
    "agent_jobs": _job_agent_jobs,
    "event_scout": _job_event_scout,
    "observer": _job_observer,
}


def _run_job(name: str) -> None:
    """Ejecuta un job en background sin tumbar el proceso si falla."""
    logger.info("Iniciando job manual: %s", name)
    try:
        JOBS[name]()
        logger.info("Job %s terminado", name)
    except Exception:
        logger.exception("Falló el job %s", name)


@router.post("/admin/refresh/{job}")
def admin_refresh(job: str, background_tasks: BackgroundTasks) -> dict[str, str]:
    """Dispara un job de refresco en background."""
    if job not in JOBS:
        raise HTTPException(
            status_code=404,
            detail=f"Job desconocido. Válidos: {', '.join(JOBS)}",
        )
    background_tasks.add_task(_run_job, job)
    return {"status": "started", "job": job}
