"""Motor de alertas con deduplicación persistida en AlertState.

Reglas (en orden): hard_drop, hard_spike, drawdown_cross, rally_cross,
technical_break y breaking_news. Cada alerta encola un AgentJob de research.
Unidades: cambios, drawdown y rally en PORCENTAJE (-35.2 = -35.2%).
"""
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AgentJob,
    Alert,
    AlertState,
    NewsItem,
    PriceDaily,
    TechnicalSnapshot,
    Ticker,
)

logger = logging.getLogger(__name__)

# Keywords de alto impacto para breaking_news (comparadas en minúsculas).
BREAKING_KEYWORDS: list[str] = [
    "guidance cut",
    "cuts guidance",
    "sec probe",
    "sec investigation",
    "doj probe",
    "ceo resigns",
    "ceo steps down",
    "ceo out",
    "cfo resigns",
    "contract win",
    "contract awarded",
    "wins contract",
    "layoffs",
    "bankruptcy",
    "chapter 11",
    "merger",
    "acquisition",
    "acquires",
    "to acquire",
    "downgrade",
    "fda approval",
    "fda rejects",
    "recall",
    "data breach",
    "short seller",
    "accounting irregularities",
    "delisting",
    "profit warning",
]


def _utcnow() -> datetime:
    """UTC naive, coherente con las columnas DateTime del modelo."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _get_or_create_state(session: Session, symbol: str, rule_key: str) -> AlertState:
    """Devuelve el AlertState de (symbol, rule_key), creándolo si no existe."""
    state = session.scalars(
        select(AlertState).where(
            AlertState.symbol == symbol, AlertState.rule_key == rule_key
        )
    ).first()
    if state is None:
        state = AlertState(symbol=symbol, rule_key=rule_key, state=None)
        session.add(state)
    return state


def _create_alert(
    session: Session,
    symbol: str,
    kind: str,
    severity: str,
    title: str,
    payload: dict,
    dedup_key: str,
) -> Alert:
    """Crea la Alert (status new) y encola su AgentJob de research."""
    alert = Alert(
        symbol=symbol,
        kind=kind,
        severity=severity,
        title=title[:300],
        payload=payload,
        dedup_key=dedup_key,
        status="new",
    )
    session.add(alert)
    session.flush()  # asegura alert.id para el job
    session.add(
        AgentJob(
            kind="research",
            payload={"alert_id": alert.id, "symbol": symbol},
            status="pending",
        )
    )
    return alert


def _last_two_closes(
    session: Session, symbols: list[str]
) -> dict[str, list[tuple[date, float]]]:
    """Dos últimos closes por símbolo, del más reciente al anterior."""
    if not symbols:
        return {}
    rn = (
        func.row_number()
        .over(partition_by=PriceDaily.symbol, order_by=PriceDaily.date.desc())
        .label("rn")
    )
    subq = (
        select(PriceDaily.symbol, PriceDaily.date, PriceDaily.close, rn)
        .where(PriceDaily.symbol.in_(symbols))
        .subquery()
    )
    stmt = (
        select(subq.c.symbol, subq.c.date, subq.c.close)
        .where(subq.c.rn <= 2)
        .order_by(subq.c.symbol, subq.c.date.desc())
    )
    out: dict[str, list[tuple[date, float]]] = {}
    for sym, day, close in session.execute(stmt):
        out.setdefault(sym, []).append((day, close))
    return out


def _latest_snapshots(
    session: Session, symbols: list[str]
) -> dict[str, TechnicalSnapshot]:
    """Snapshot técnico más reciente por símbolo."""
    if not symbols:
        return {}
    rn = (
        func.row_number()
        .over(
            partition_by=TechnicalSnapshot.symbol,
            order_by=(TechnicalSnapshot.as_of.desc(), TechnicalSnapshot.id.desc()),
        )
        .label("rn")
    )
    subq = (
        select(TechnicalSnapshot.id, rn)
        .where(TechnicalSnapshot.symbol.in_(symbols))
        .subquery()
    )
    ids = select(subq.c.id).where(subq.c.rn == 1)
    snaps = session.scalars(
        select(TechnicalSnapshot).where(TechnicalSnapshot.id.in_(ids))
    ).all()
    return {s.symbol: s for s in snaps}


def _rule_daily_move(
    session: Session, closes: dict[str, list[tuple[date, float]]]
) -> list[Alert]:
    """Reglas 1 y 2: hard_drop / hard_spike sobre los dos últimos closes."""
    alerts: list[Alert] = []
    for symbol, rows in closes.items():
        if len(rows) < 2:
            continue
        (last_date, last_close), (_, prev_close) = rows[0], rows[1]
        if last_close is None or not prev_close:
            continue
        change_1d = (last_close / prev_close - 1.0) * 100.0
        if change_1d <= settings.alert_drop_pct:
            kind, direction = "hard_drop", "down"
            severity = "alta" if change_1d <= -10 else "media"
        elif change_1d >= settings.alert_spike_pct:
            kind, direction, severity = "hard_spike", "up", "media"
        else:
            continue
        state = _get_or_create_state(session, symbol, "daily_move")
        prev = state.state or {}
        if prev.get("date") == last_date.isoformat() and prev.get("direction") == direction:
            continue  # ya disparó hoy en esta dirección
        alert = _create_alert(
            session,
            symbol=symbol,
            kind=kind,
            severity=severity,
            title=f"{symbol} {change_1d:+.1f}% hoy",
            payload={
                "change_1d_pct": round(change_1d, 2),
                "close": last_close,
                "prev_close": prev_close,
                "date": last_date.isoformat(),
            },
            dedup_key=f"daily_move:{symbol}:{last_date.isoformat()}:{direction}",
        )
        state.state = {"date": last_date.isoformat(), "direction": direction}
        state.last_fired_at = _utcnow()
        alerts.append(alert)
    return alerts


def _rule_drawdown(
    session: Session, snapshots: dict[str, TechnicalSnapshot]
) -> list[Alert]:
    """Regla 3: cruce de niveles de drawdown desde ATH, con histéresis."""
    alerts: list[Alert] = []
    levels = settings.drawdown_levels  # negativos, p.ej. [-30, -50, -70]
    buffer = settings.threshold_reset_buffer_pp
    for symbol, snap in snapshots.items():
        dd = snap.drawdown_from_ath_pct
        if dd is None:
            continue
        crossed = [lv for lv in levels if dd <= lv]
        deepest = min(crossed) if crossed else None
        state = _get_or_create_state(session, symbol, "drawdown")
        current = (state.state or {}).get("level")
        # Rearme: recuperó por encima de (nivel + buffer) -> nivel que siga cruzado
        if current is not None and dd > current + buffer:
            current = deepest
            state.state = {"level": current}
        if deepest is not None and (current is None or deepest < current):
            severity = "alta" if deepest <= -50 else "media"
            alert = _create_alert(
                session,
                symbol=symbol,
                kind="drawdown_cross",
                severity=severity,
                title=f"{symbol} cae {dd:.1f}% desde su maximo: cruza el nivel {deepest:.0f}%",
                payload={
                    "drawdown_from_ath_pct": dd,
                    "level": deepest,
                    "last_close": snap.last_close,
                    "as_of": snap.as_of.isoformat(),
                },
                dedup_key=f"drawdown:{symbol}:{deepest:.0f}:{snap.as_of.isoformat()}",
            )
            state.state = {"level": deepest}
            state.last_fired_at = _utcnow()
            alerts.append(alert)
    return alerts


def _rule_rally(
    session: Session, snapshots: dict[str, TechnicalSnapshot]
) -> list[Alert]:
    """Regla 4: cruce de niveles de rally desde mínimo 52w, con histéresis."""
    alerts: list[Alert] = []
    levels = settings.rally_levels  # positivos, p.ej. [50, 100, 150]
    buffer = settings.threshold_reset_buffer_pp
    for symbol, snap in snapshots.items():
        rally = snap.rally_from_low_pct
        if rally is None:
            continue
        crossed = [lv for lv in levels if rally >= lv]
        highest = max(crossed) if crossed else None
        state = _get_or_create_state(session, symbol, "rally")
        current = (state.state or {}).get("level")
        # Rearme: cayó por debajo de (nivel - buffer) -> nivel que siga cruzado
        if current is not None and rally < current - buffer:
            current = highest
            state.state = {"level": current}
        if highest is not None and (current is None or highest > current):
            alert = _create_alert(
                session,
                symbol=symbol,
                kind="rally_cross",
                severity="info",
                title=f"{symbol} sube {rally:.1f}% desde su minimo 52w: cruza el nivel +{highest:.0f}%",
                payload={
                    "rally_from_low_pct": rally,
                    "level": highest,
                    "last_close": snap.last_close,
                    "as_of": snap.as_of.isoformat(),
                },
                dedup_key=f"rally:{symbol}:{highest:.0f}:{snap.as_of.isoformat()}",
            )
            state.state = {"level": highest}
            state.last_fired_at = _utcnow()
            alerts.append(alert)
    return alerts


def _rule_tech_break(
    session: Session, snapshots: dict[str, TechnicalSnapshot]
) -> list[Alert]:
    """Regla 5: ruptura de soporte (-0.5%) o resistencia (+0.5%) del snapshot."""
    alerts: list[Alert] = []
    for symbol, snap in snapshots.items():
        close = snap.last_close
        if close is None:
            continue
        state = _get_or_create_state(session, symbol, "tech_break")
        current = dict(state.state or {"support_fired": None, "resistance_fired": None})
        fired = False
        if (
            snap.support is not None
            and close < snap.support * 0.995
            and current.get("support_fired") != snap.support
        ):
            alerts.append(
                _create_alert(
                    session,
                    symbol=symbol,
                    kind="technical_break",
                    severity="media",
                    title=f"{symbol} rompe soporte {snap.support:.2f} (cierre {close:.2f})",
                    payload={
                        "last_close": close,
                        "support": snap.support,
                        "direction": "bajista",
                        "as_of": snap.as_of.isoformat(),
                    },
                    dedup_key=f"tech_break:{symbol}:soporte:{snap.support}",
                )
            )
            current["support_fired"] = snap.support
            fired = True
        if (
            snap.resistance is not None
            and close > snap.resistance * 1.005
            and current.get("resistance_fired") != snap.resistance
        ):
            alerts.append(
                _create_alert(
                    session,
                    symbol=symbol,
                    kind="technical_break",
                    severity="media",
                    title=f"{symbol} rompe resistencia {snap.resistance:.2f} (cierre {close:.2f})",
                    payload={
                        "last_close": close,
                        "resistance": snap.resistance,
                        "direction": "alcista",
                        "as_of": snap.as_of.isoformat(),
                    },
                    dedup_key=f"tech_break:{symbol}:resistencia:{snap.resistance}",
                )
            )
            current["resistance_fired"] = snap.resistance
            fired = True
        if fired:
            current.setdefault("support_fired", None)
            current.setdefault("resistance_fired", None)
            state.state = current
            state.last_fired_at = _utcnow()
    return alerts


def _rule_breaking_news(session: Session, active_symbols: set[str]) -> list[Alert]:
    """Regla 6: titulares recientes (2h) con keywords de alto impacto."""
    alerts: list[Alert] = []
    cutoff = _utcnow() - timedelta(hours=2)
    items = session.scalars(
        select(NewsItem).where(
            NewsItem.symbol.is_not(None), NewsItem.fetched_at >= cutoff
        )
    ).all()
    for item in items:
        if item.symbol not in active_symbols:
            continue
        title_lower = item.title.lower()
        keyword = next((k for k in BREAKING_KEYWORDS if k in title_lower), None)
        if keyword is None:
            continue
        dedup_key = f"news:{item.id}"
        already = session.scalars(
            select(Alert.id).where(Alert.dedup_key == dedup_key)
        ).first()
        if already is not None:
            continue
        alerts.append(
            _create_alert(
                session,
                symbol=item.symbol,
                kind="breaking_news",
                severity="media",
                title=f"{item.symbol} noticia de alto impacto ({keyword}): {item.title}",
                payload={
                    "title": item.title,
                    "url": item.url,
                    "keyword": keyword,
                    "news_id": item.id,
                },
                dedup_key=dedup_key,
            )
        )
    return alerts


def scan_alerts(session: Session) -> list[Alert]:
    """Ejecuta las 6 reglas sobre tickers activos y devuelve las Alert nuevas."""
    active = list(
        session.scalars(select(Ticker.symbol).where(Ticker.is_active.is_(True)))
    )
    closes = _last_two_closes(session, active)
    snapshots = _latest_snapshots(session, active)

    alerts: list[Alert] = []
    alerts += _rule_daily_move(session, closes)  # reglas 1 y 2
    alerts += _rule_drawdown(session, snapshots)
    alerts += _rule_rally(session, snapshots)
    alerts += _rule_tech_break(session, snapshots)
    alerts += _rule_breaking_news(session, set(active))

    session.commit()
    logger.info("scan_alerts: %d alertas nuevas", len(alerts))
    return alerts
