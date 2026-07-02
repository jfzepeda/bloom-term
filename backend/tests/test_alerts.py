"""Tests del motor de alertas (sqlite in-memory, sin red).

Usa los defaults reales de settings: alert_drop_pct=-7, niveles de drawdown
-30/-50/-70 y threshold_reset_buffer_pp=5.
"""
from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import models
from app.alerts.engine import scan_alerts


@pytest.fixture()
def session():
    engine = create_engine("sqlite://")
    models.Base.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _seed(s: Session) -> None:
    """Ticker activo, 2 días de precios con caída de -8% y drawdown de -55%."""
    d1, d2 = date(2026, 6, 30), date(2026, 7, 1)
    s.add(models.Ticker(symbol="MSFT", name="Microsoft", is_active=True))
    s.add(models.PriceDaily(symbol="MSFT", date=d1, close=100.0))
    s.add(models.PriceDaily(symbol="MSFT", date=d2, close=92.0))  # -8.0%
    s.add(
        models.TechnicalSnapshot(
            symbol="MSFT",
            as_of=d2,
            last_close=92.0,
            drawdown_from_ath_pct=-55.0,
        )
    )
    s.commit()


def test_first_scan_fires_and_second_scan_dedups(session: Session) -> None:
    _seed(session)

    alerts = scan_alerts(session)
    by_kind = {a.kind: a for a in alerts}
    assert set(by_kind) == {"hard_drop", "drawdown_cross"}

    drop = by_kind["hard_drop"]
    assert drop.severity == "media"  # -8% no llega a -10
    assert drop.status == "new"
    assert drop.payload["change_1d_pct"] == pytest.approx(-8.0)
    assert "-8.0%" in drop.title

    dd = by_kind["drawdown_cross"]
    assert dd.severity == "alta"
    assert dd.payload["level"] == -50.0

    # Cada alerta encoló su AgentJob de research con el alert_id correcto
    jobs = session.scalars(select(models.AgentJob)).all()
    assert len(jobs) == 2
    assert all(j.kind == "research" and j.status == "pending" for j in jobs)
    assert {j.payload["alert_id"] for j in jobs} == {a.id for a in alerts}
    assert all(j.payload["symbol"] == "MSFT" for j in jobs)

    # Segundo scan: nada nuevo (dedup por AlertState)
    assert scan_alerts(session) == []
    assert len(session.scalars(select(models.Alert)).all()) == 2


def test_drawdown_rearms_and_refires(session: Session) -> None:
    _seed(session)
    scan_alerts(session)  # dispara drawdown_cross(-50), state.level = -50

    # Recuperación por encima de -50 + 5 -> rearma (state.level = None), sin alertas
    snap = session.scalars(select(models.TechnicalSnapshot)).one()
    snap.drawdown_from_ath_pct = -20.0
    session.commit()
    assert scan_alerts(session) == []

    # Vuelve a caer a -52 -> drawdown_cross(-50) dispara de nuevo
    snap = session.scalars(select(models.TechnicalSnapshot)).one()
    snap.drawdown_from_ath_pct = -52.0
    session.commit()
    alerts = scan_alerts(session)
    assert [a.kind for a in alerts] == ["drawdown_cross"]
    assert alerts[0].payload["level"] == -50.0
    assert alerts[0].payload["drawdown_from_ath_pct"] == pytest.approx(-52.0)
