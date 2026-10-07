"""Tests del runner de agent_jobs (sqlite in-memory, sin red)."""
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import models
from app.agents.runner import process_agent_jobs


@pytest.fixture()
def session():
    engine = create_engine("sqlite://")
    models.Base.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def test_sin_api_key_marca_jobs_y_alertas_skipped(session: Session, monkeypatch) -> None:
    monkeypatch.setattr("app.agents.runner.has_api_key", lambda: False)

    session.add(models.Ticker(symbol="MSFT", name="Microsoft", is_active=True))
    alert = models.Alert(symbol="MSFT", kind="hard_drop", severity="media", title="t")
    session.add(alert)
    session.flush()
    session.add(
        models.AgentJob(
            kind="research",
            payload={"alert_id": alert.id, "symbol": "MSFT"},
            status="pending",
        )
    )
    session.add(models.AgentJob(kind="observer", payload={}, status="pending"))
    session.commit()

    assert process_agent_jobs(session) == 0

    jobs = session.scalars(select(models.AgentJob)).all()
    assert len(jobs) == 2
    assert all(j.status == "skipped" for j in jobs)
    # La alerta del job de research también queda skipped para la UI
    assert session.get(models.Alert, alert.id).status == "skipped"
