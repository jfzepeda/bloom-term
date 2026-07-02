"""Scheduler de jobs periódicos de Market Sentinel (APScheduler)."""
import functools
import logging
from collections.abc import Callable
from datetime import datetime, time
from zoneinfo import ZoneInfo

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from app import db
from app.config import settings

logger = logging.getLogger(__name__)

MARKET_TZ = ZoneInfo(settings.market_timezone)

JOB_DEFAULTS = {"coalesce": True, "max_instances": 1, "misfire_grace_time": 300}


def _run(name: str, fn: Callable[[Session], object]) -> None:
    """Ejecuta fn(session) dentro de session_scope y logea el resultado.

    Captura cualquier excepción para que un job que falla no tumbe el scheduler.
    """
    try:
        with db.session_scope() as session:
            result = fn(session)
        logger.info("Job %s OK: %s", name, result)
    except Exception:
        logger.exception("Job %s falló", name)


def _guard(job: Callable[[], None]) -> Callable[[], None]:
    """Aísla el job completo (incluidos imports perezosos): un fallo se logea y no tumba el scheduler."""

    @functools.wraps(job)
    def wrapper() -> None:
        try:
            job()
        except Exception:
            logger.exception("Job %s falló", job.__name__)

    return wrapper


def _in_market_hours() -> bool:
    """True si la hora local de mercado está entre 09:30 y 16:10."""
    now = datetime.now(MARKET_TZ).time()
    return time(9, 30) <= now <= time(16, 10)


@_guard
def job_universe_weekly() -> None:
    """Refresca el universo S&P 500 (domingos 08:00)."""
    from app.ingestion.universe import refresh_universe

    _run("universe_weekly.refresh_universe", refresh_universe)


@_guard
def job_intraday() -> None:
    """Precios recientes + alertas cada 15 min en horario de mercado."""
    if not _in_market_hours():
        return
    from app.alerts.engine import scan_alerts
    from app.ingestion.prices import fetch_latest_prices

    _run("intraday.fetch_latest_prices", fetch_latest_prices)
    _run("intraday.scan_alerts", lambda s: len(scan_alerts(s)))


@_guard
def job_close_pass() -> None:
    """Pasada de cierre: precios, técnicos y alertas (16:20 lun-vie)."""
    from app.alerts.engine import scan_alerts
    from app.analysis.technicals import compute_technicals
    from app.ingestion.prices import fetch_latest_prices

    _run("close_pass.fetch_latest_prices", fetch_latest_prices)
    _run("close_pass.compute_technicals", compute_technicals)
    _run("close_pass.scan_alerts", lambda s: len(scan_alerts(s)))


@_guard
def job_fundamentals_nightly() -> None:
    """Lote rotatorio de fundamentales (00:30)."""
    from app.ingestion.fundamentals import fetch_fundamentals_batch, next_rotation_batch

    def _batch(session: Session) -> int:
        batch = next_rotation_batch(session)
        if not batch:
            return 0
        return fetch_fundamentals_batch(session, batch)

    _run("fundamentals_nightly", _batch)


@_guard
def job_analysis_nightly() -> None:
    """Análisis nocturno: técnicos, DCF y screens (01:30)."""
    from app.analysis.dcf import run_dcf
    from app.analysis.screens import run_growth_screen, run_value_screen
    from app.analysis.technicals import compute_technicals

    _run("analysis_nightly.compute_technicals", compute_technicals)
    _run("analysis_nightly.run_dcf", run_dcf)
    _run("analysis_nightly.run_value_screen", run_value_screen)
    _run("analysis_nightly.run_growth_screen", run_growth_screen)


@_guard
def job_news_refresh() -> None:
    """Refresco de noticias priorizado + macro (cada 30 min)."""
    from app.ingestion.news import fetch_macro_news, prioritized_news_refresh

    _run("news_refresh.prioritized_news_refresh", prioritized_news_refresh)
    _run("news_refresh.fetch_macro_news", fetch_macro_news)


@_guard
def job_agent_queue() -> None:
    """Procesa la cola de trabajos de agentes (cada minuto)."""
    from app.agents.runner import process_agent_jobs

    _run("agent_queue.process_agent_jobs", process_agent_jobs)


@_guard
def job_event_scout_daily() -> None:
    """Agente event scout (21:00)."""
    from app.agents.event_scout import run_event_scout

    _run("event_scout_daily.run_event_scout", run_event_scout)


@_guard
def job_observer_daily() -> None:
    """Agente observer (17:00 lun-vie)."""
    from app.agents.observer import run_observer

    _run("observer_daily.run_observer", run_observer)


def build_scheduler() -> BlockingScheduler:
    """Construye el BlockingScheduler con todos los jobs en tz de mercado."""
    scheduler = BlockingScheduler(timezone=MARKET_TZ, job_defaults=JOB_DEFAULTS)
    scheduler.add_job(
        job_universe_weekly,
        CronTrigger(day_of_week="sun", hour=8, minute=0, timezone=MARKET_TZ),
        id="universe_weekly",
    )
    scheduler.add_job(
        job_intraday,
        CronTrigger(minute="*/15", hour="9-16", day_of_week="mon-fri", timezone=MARKET_TZ),
        id="intraday",
    )
    scheduler.add_job(
        job_close_pass,
        CronTrigger(hour=16, minute=20, day_of_week="mon-fri", timezone=MARKET_TZ),
        id="close_pass",
    )
    scheduler.add_job(
        job_fundamentals_nightly,
        CronTrigger(hour=0, minute=30, timezone=MARKET_TZ),
        id="fundamentals_nightly",
    )
    scheduler.add_job(
        job_analysis_nightly,
        CronTrigger(hour=1, minute=30, timezone=MARKET_TZ),
        id="analysis_nightly",
    )
    scheduler.add_job(
        job_news_refresh,
        CronTrigger(minute="*/30", timezone=MARKET_TZ),
        id="news_refresh",
    )
    scheduler.add_job(
        job_agent_queue,
        IntervalTrigger(minutes=1, timezone=MARKET_TZ),
        id="agent_queue",
    )
    scheduler.add_job(
        job_event_scout_daily,
        CronTrigger(hour=21, minute=0, timezone=MARKET_TZ),
        id="event_scout_daily",
    )
    scheduler.add_job(
        job_observer_daily,
        CronTrigger(hour=17, minute=0, day_of_week="mon-fri", timezone=MARKET_TZ),
        id="observer_daily",
    )
    return scheduler
