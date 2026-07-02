"""Agente observer: lectura diaria del mercado y recomendaciones por nivel."""
import logging
from datetime import date, datetime, time

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.agents.client import run_agent_json
from app.config import settings
from app.models import Alert, NewsItem, ObserverReport, ScreenResult

logger = logging.getLogger(__name__)

_SYSTEM = (
    "Eres el Observer, un estratega de inversion que resume el dia del mercado "
    "para el S&P 500. Razona UNICAMENTE sobre los datos proporcionados en el "
    "mensaje: NUNCA inventes cifras, titulares ni tickers. Justifica cada "
    "recomendacion SOLO con los datos dados; si los datos no explican algo, dilo "
    "('causa no identificada en fuentes'). Responde en espanol."
)

_SCHEMA = {
    "type": "object",
    "properties": {
        "market_summary": {"type": "string"},
        "recommendations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "nivel": {"type": "string", "enum": ["value", "growth", "event"]},
                    "symbol": {"type": "string"},
                    "accion": {"type": "string", "enum": ["comprar", "vigilar", "evitar"]},
                    "razon": {"type": "string"},
                },
                "required": ["nivel", "symbol", "accion", "razon"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["market_summary", "recommendations"],
    "additionalProperties": False,
}

_DISCLAIMER = (
    "> *Esto no es asesoria financiera. Generado por IA sobre fuentes publicas; "
    "verifica antes de operar.*"
)

_LEVEL_TITLES = {"value": "Nivel 1 — Value", "growth": "Nivel 2 — Growth", "event": "Nivel 3 — Event"}


def _latest_screen_top10(session: Session, screen: str) -> list[ScreenResult]:
    last = session.scalar(
        select(func.max(ScreenResult.as_of)).where(ScreenResult.screen == screen)
    )
    if last is None:
        return []
    return list(
        session.scalars(
            select(ScreenResult)
            .where(ScreenResult.screen == screen, ScreenResult.as_of == last)
            .order_by(ScreenResult.rank.asc().nulls_last())
            .limit(10)
        )
    )


def _build_user_message(
    alerts: list[Alert],
    value: list[ScreenResult],
    growth: list[ScreenResult],
    events: list[ScreenResult],
    headlines: list[NewsItem],
) -> str:
    lines: list[str] = ["DATOS DEL DIA", ""]

    lines.append("ALERTAS DE HOY:")
    if alerts:
        for a in alerts:
            interp = (a.agent_analysis or {}).get("interpretation")
            extra = f" | analisis: {interp}" if interp else ""
            lines.append(f"- [{a.severity}] {a.title}{extra}")
    else:
        lines.append("- ninguna.")
    lines.append("")

    lines.append("TOP 10 SCREEN VALUE (mas reciente):")
    if value:
        for r in value:
            d = r.details or {}
            upside = d.get("upside_pct", d.get("upside"))
            upside_s = f"{upside:.1f}%" if isinstance(upside, (int, float)) else "N/D"
            lines.append(f"- {r.symbol}: upside={upside_s} | veredicto={d.get('verdict', 'N/D')}")
    else:
        lines.append("- sin resultados.")
    lines.append("")

    lines.append("TOP 10 SCREEN GROWTH (mas reciente):")
    if growth:
        for r in growth:
            d = r.details or {}
            labels = d.get("labels")
            labels_s = ", ".join(str(x) for x in labels) if isinstance(labels, list) else "N/D"
            score_s = f"{r.score:.0f}" if r.score is not None else "N/D"
            lines.append(f"- {r.symbol}: score={score_s} | labels={labels_s}")
    else:
        lines.append("- sin resultados.")
    lines.append("")

    lines.append("IDEAS EVENT DE HOY (Nivel 3):")
    if events:
        for r in events:
            d = r.details or {}
            tickers = ", ".join(d.get("tickers") or []) or "sin tickers validados"
            lines.append(
                f"- [{d.get('category', 'N/D')}] {d.get('thesis', '')} "
                f"(tickers: {tickers} | confianza: {d.get('confidence', 'N/D')})"
            )
    else:
        lines.append("- ninguna.")
    lines.append("")

    lines.append("TITULARES MACRO DEL DIA:")
    if headlines:
        for n in headlines:
            lines.append(f"- ({n.source or 'fuente desconocida'}) {n.title}")
    else:
        lines.append("- ninguno.")

    lines += [
        "",
        "TAREA: escribe market_summary (lectura del dia del mercado, en markdown) y",
        "de 3 a 5 recomendaciones POR NIVEL de riesgo ('value', 'growth', 'event'),",
        "accionables (accion: comprar | vigilar | evitar) y justificadas SOLO con los",
        "datos dados. Usa unicamente simbolos que aparezcan en los datos.",
    ]
    return "\n".join(lines)


def _build_markdown(today: date, result: dict) -> str:
    parts = [f"# Observer — {today.isoformat()}", "", str(result.get("market_summary", "")).strip(), ""]
    recs = result.get("recommendations") or []
    parts.append("## Recomendaciones por nivel")
    for nivel in ("value", "growth", "event"):
        level_recs = [r for r in recs if isinstance(r, dict) and r.get("nivel") == nivel]
        if not level_recs:
            continue
        parts += ["", f"### {_LEVEL_TITLES[nivel]}"]
        for r in level_recs:
            parts.append(f"- **{r.get('symbol', 'N/D')}** — {r.get('accion', 'N/D')}: {r.get('razon', '')}")
    parts += ["", _DISCLAIMER]
    return "\n".join(parts)


def run_observer(session: Session) -> ObserverReport | None:
    """Genera (o actualiza) el reporte Observer del dia. None si no hay datos."""
    today = date.today()
    day_start = datetime.combine(today, time.min)

    alerts = list(
        session.scalars(
            select(Alert).where(Alert.created_at >= day_start).order_by(Alert.created_at.desc())
        )
    )
    value = _latest_screen_top10(session, "value")
    growth = _latest_screen_top10(session, "growth")
    events = list(
        session.scalars(
            select(ScreenResult)
            .where(ScreenResult.screen == "event", ScreenResult.as_of == today)
            .order_by(ScreenResult.rank.asc().nulls_last())
        )
    )
    if not alerts and not value and not growth and not events:
        logger.info("Observer: sin alertas ni screens, no se genera reporte")
        return None

    headlines = list(
        session.scalars(
            select(NewsItem)
            .where(NewsItem.symbol.is_(None), NewsItem.published_at >= day_start)
            .order_by(NewsItem.published_at.desc())
            .limit(15)
        )
    )

    user = _build_user_message(alerts, value, growth, events, headlines)
    result = run_agent_json(
        _SYSTEM, user, _SCHEMA, max_tokens=max(settings.agent_max_tokens, 3000)
    )
    markdown = _build_markdown(today, result)
    recommendations = result.get("recommendations") or []

    report = session.scalar(select(ObserverReport).where(ObserverReport.report_date == today))
    if report is None:
        report = ObserverReport(report_date=today, markdown=markdown, recommendations=recommendations)
        session.add(report)
    else:
        report.markdown = markdown
        report.recommendations = recommendations
    session.commit()
    return report
