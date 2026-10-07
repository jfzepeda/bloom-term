"""Procesador de la cola agent_jobs: despacha jobs a los agentes IA."""
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.client import has_api_key
from app.agents.event_scout import run_event_scout
from app.agents.observer import run_observer
from app.agents.research import analyze_alert
from app.models import AgentJob, Alert

logger = logging.getLogger(__name__)


def _run_job(session: Session, job: AgentJob) -> dict | None:
    payload = job.payload or {}
    if job.kind == "research":
        return analyze_alert(session, int(payload["alert_id"]))
    if job.kind == "event_scout":
        return {"count": run_event_scout(session)}
    if job.kind == "observer":
        report = run_observer(session)
        return {"report_id": report.id if report is not None else None}
    raise ValueError(f"kind desconocido: {job.kind}")


def process_agent_jobs(session: Session, limit: int = 5) -> int:
    """Procesa hasta `limit` jobs pendientes; devuelve cuantos terminaron con exito."""
    jobs = list(
        session.scalars(
            select(AgentJob)
            .where(AgentJob.status == "pending")
            .order_by(AgentJob.created_at.asc())
            .limit(limit)
        )
    )
    if not jobs:
        return 0

    if not has_api_key():
        for job in jobs:
            job.status = "skipped"
            job.error = "ANTHROPIC_API_KEY no configurada"
            # La alerta asociada tampoco tendrá análisis: se marca skipped
            # para que la UI no muestre "IA pendiente" a perpetuidad.
            payload = job.payload or {}
            if job.kind == "research" and payload.get("alert_id") is not None:
                alert = session.get(Alert, int(payload["alert_id"]))
                if alert is not None and alert.status != "analyzed":
                    alert.status = "skipped"
        session.commit()
        return 0

    done = 0
    for job in jobs:
        job.status = "running"
        session.commit()
        try:
            result = _run_job(session, job)
            job.result = result
            job.status = "done"
            job.error = None
            session.commit()
            done += 1
        except Exception as exc:  # el runner registra cualquier fallo del agente
            logger.exception("Fallo el job %s (kind=%s)", job.id, job.kind)
            session.rollback()
            job.attempts = (job.attempts or 0) + 1
            job.error = str(exc)[:2000]
            job.status = "error" if job.attempts >= 3 else "pending"
            session.commit()
    return done
