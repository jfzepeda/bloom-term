"""Proceso worker: bootstrap inicial (si la DB está vacía) + scheduler."""
import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import db
from app.models import Ticker
from app.scheduler import build_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def _db_is_empty() -> bool:
    """True si no hay tickers en la DB."""
    with db.session_scope() as session:
        total = session.execute(select(func.count()).select_from(Ticker)).scalar_one()
    return total == 0


def _bootstrap() -> None:
    """Carga inicial: universo, histórico de precios, técnicos y alertas."""
    logger.info("Bootstrap inicial...")

    def _universe(session: Session) -> object:
        from app.ingestion.universe import refresh_universe

        return refresh_universe(session)

    def _prices(session: Session) -> object:
        from app.ingestion.prices import fetch_price_history

        return fetch_price_history(session)

    def _technicals(session: Session) -> object:
        from app.analysis.technicals import compute_technicals

        return compute_technicals(session)

    def _alerts(session: Session) -> object:
        from app.alerts.engine import scan_alerts

        return len(scan_alerts(session))

    steps = [
        ("refresh_universe", _universe),
        ("fetch_price_history (todo el universo, puede tardar varios minutos)", _prices),
        ("compute_technicals", _technicals),
        ("scan_alerts", _alerts),
    ]
    for name, fn in steps:
        logger.info("Bootstrap: iniciando %s", name)
        try:
            with db.session_scope() as session:
                result = fn(session)
            logger.info("Bootstrap: %s OK: %s", name, result)
        except Exception:
            logger.exception("Bootstrap: %s falló; se continúa", name)


def main() -> None:
    """Punto de entrada del worker."""
    db.init_db()
    if _db_is_empty():
        _bootstrap()
    scheduler = build_scheduler()
    logger.info("Iniciando scheduler...")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Worker detenido.")


if __name__ == "__main__":
    main()
