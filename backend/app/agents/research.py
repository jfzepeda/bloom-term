"""Agente de research: analiza una alerta con el contexto disponible en la DB."""
import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.client import run_agent_json
from app.models import Alert, DcfValuation, Fundamentals, NewsItem, TechnicalSnapshot

logger = logging.getLogger(__name__)

_SYSTEM = (
    "Eres un analista de inversion del S&P 500. Analizas una alerta usando "
    "UNICAMENTE los datos proporcionados en el mensaje: NUNCA inventes cifras, "
    "titulares ni hechos que no esten en el mensaje. Si los datos no explican el "
    "movimiento, dilo explicitamente ('causa no identificada en fuentes') y marca "
    "cause_identified=false. Responde en espanol."
)

_SCHEMA = {
    "type": "object",
    "properties": {
        "bullets": {"type": "array", "items": {"type": "string"}},
        "interpretation": {"type": "string"},
        "severity": {"type": "string", "enum": ["baja", "media", "alta"]},
        "fundamentals_intact": {"type": ["boolean", "null"]},
        "cause_identified": {"type": "boolean"},
    },
    "required": [
        "bullets",
        "interpretation",
        "severity",
        "fundamentals_intact",
        "cause_identified",
    ],
    "additionalProperties": False,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _pct_frac(v: float | None) -> str:
    """Fraccion (0.15) -> '15.0%'."""
    return f"{v * 100:.1f}%" if v is not None else "N/D"


def _pct(v: float | None) -> str:
    """Ya en porcentaje (-35.2) -> '-35.2%'."""
    return f"{v:.1f}%" if v is not None else "N/D"


def _num(v: float | None) -> str:
    return f"{v:.2f}" if v is not None else "N/D"


def _build_user_message(
    alert: Alert,
    news: list[NewsItem],
    tech: TechnicalSnapshot | None,
    fund: Fundamentals | None,
    dcf: DcfValuation | None,
) -> str:
    lines = [
        f"ALERTA: {alert.title}",
        f"Tipo: {alert.kind} | Simbolo: {alert.symbol or 'N/D'} | Severidad inicial: {alert.severity}",
        f"Payload: {json.dumps(alert.payload, ensure_ascii=False) if alert.payload else 'N/D'}",
        "",
    ]

    if news:
        lines.append("NOTICIAS DEL SIMBOLO (ultimas 48h):")
        for n in news:
            ts = n.published_at.strftime("%Y-%m-%d %H:%M") if n.published_at else "s/f"
            lines.append(f"- [{ts}] ({n.source or 'fuente desconocida'}) {n.title}")
    else:
        lines.append(
            "NOTICIAS: no hay noticias del simbolo en las ultimas 48 horas. "
            "Marca cause_identified=false."
        )
    lines.append("")

    if tech is not None:
        lines.append(f"TECNICO (al {tech.as_of.isoformat()}):")
        lines.append(
            f"- Drawdown desde ATH: {_pct(tech.drawdown_from_ath_pct)} | "
            f"Rally desde minimo 52w: {_pct(tech.rally_from_low_pct)} | "
            f"RSI14: {_num(tech.rsi14)} | Distancia a SMA200: {_pct(tech.dist_sma200_pct)}"
        )
    else:
        lines.append("TECNICO: sin snapshot tecnico disponible.")
    lines.append("")

    if fund is not None:
        lines.append(f"FUNDAMENTALES (al {fund.as_of.isoformat()}, ratios en porcentaje):")
        lines.append(
            f"- ROE promedio 4y: {_pct_frac(fund.roe_avg_4y)} | "
            f"Margen bruto: {_pct_frac(fund.gross_margin)} | "
            f"Margen operativo: {_pct_frac(fund.operating_margin)}"
        )
        lines.append(
            f"- Deuda/Equity: {_num(fund.debt_to_equity)} | "
            f"Crecimiento ingresos TTM: {_pct_frac(fund.revenue_growth_ttm)} | "
            f"PE: {_num(fund.pe)} | PEG: {_num(fund.peg)}"
        )
    else:
        lines.append("FUNDAMENTALES: sin datos fundamentales disponibles.")
    lines.append("")

    if dcf is not None:
        lines.append(
            f"VALORACION DCF (al {dcf.as_of.isoformat()}): "
            f"veredicto={dcf.verdict} | upside={_pct(dcf.upside_pct)}"
        )
    else:
        lines.append("VALORACION DCF: sin valoracion disponible.")

    lines += [
        "",
        "TAREA: explica que paso y que significa para un inversor. Devuelve:",
        "- bullets: 3 a 5 puntos concretos sobre el 'por que' paso la alerta.",
        "- interpretation: hipotesis razonada de que significa esto para un inversor.",
        "- severity: 'baja' | 'media' | 'alta'.",
        "- fundamentals_intact: true/false segun los fundamentales dados; null si no hay datos fundamentales.",
        "- cause_identified: true solo si las noticias dadas explican el movimiento.",
    ]
    return "\n".join(lines)


def analyze_alert(session: Session, alert_id: int) -> dict | None:
    """Analiza la alerta con el agente y guarda el resultado en agent_analysis."""
    alert = session.get(Alert, alert_id)
    if alert is None:
        logger.warning("Alerta %s no existe", alert_id)
        return None

    news: list[NewsItem] = []
    tech: TechnicalSnapshot | None = None
    fund: Fundamentals | None = None
    dcf: DcfValuation | None = None
    if alert.symbol:
        cutoff = _utcnow() - timedelta(hours=48)
        news = list(
            session.scalars(
                select(NewsItem)
                .where(NewsItem.symbol == alert.symbol, NewsItem.published_at >= cutoff)
                .order_by(NewsItem.published_at.desc())
                .limit(10)
            )
        )
        tech = session.scalars(
            select(TechnicalSnapshot)
            .where(TechnicalSnapshot.symbol == alert.symbol)
            .order_by(TechnicalSnapshot.as_of.desc())
            .limit(1)
        ).first()
        fund = session.scalars(
            select(Fundamentals).where(Fundamentals.symbol == alert.symbol)
        ).first()
        dcf = session.scalars(
            select(DcfValuation)
            .where(DcfValuation.symbol == alert.symbol)
            .order_by(DcfValuation.as_of.desc())
            .limit(1)
        ).first()

    user = _build_user_message(alert, news, tech, fund, dcf)
    result = run_agent_json(_SYSTEM, user, _SCHEMA)

    alert.agent_analysis = result
    alert.status = "analyzed"
    session.commit()
    return result
