"""Agente event scout (Nivel 3): detecta catalizadores en titulares macro."""
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.agents.client import run_agent_json
from app.models import NewsItem, ScreenResult, Ticker

logger = logging.getLogger(__name__)

_SYSTEM = (
    "Eres un scout de catalizadores de inversion (Nivel 3) sobre el S&P 500. "
    "Razona UNICAMENTE sobre los titulares proporcionados en el mensaje: NUNCA "
    "inventes titulares, cifras ni hechos. Si los titulares no sustentan ninguna "
    "idea con fundamento, devuelve una lista vacia; si algo no queda explicado por "
    "las fuentes, dilo ('causa no identificada en fuentes'). Responde en espanol."
)

_SCHEMA = {
    "type": "object",
    "properties": {
        "ideas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "thesis": {"type": "string"},
                    "category": {"type": "string"},
                    "tickers": {"type": "array", "items": {"type": "string"}},
                    "confidence": {"type": "string", "enum": ["baja", "media", "alta"]},
                    "horizon": {"type": "string"},
                    "invalidation": {"type": "string"},
                },
                "required": [
                    "thesis",
                    "category",
                    "tickers",
                    "confidence",
                    "horizon",
                    "invalidation",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["ideas"],
    "additionalProperties": False,
}

_SCORE = {"baja": 33, "media": 66, "alta": 100}

_TASK = """
TAREA: identifica de 0 a 5 catalizadores de inversion a partir de los titulares.
Categorias: contratos gobierno/defensa/cloud, ciclos de capex (memoria/semis/energia),
cuellos de botella en cadena de suministro, regulacion favorable, M&A, wins de producto.
Para cada idea: mapea la cadena de valor (quien provee, quien compra, quien sustituye)
y propone tickers del S&P 500 beneficiados (formato Yahoo, ej. BRK-B). Devuelve:
- thesis: tesis de 3-4 lineas anclada en los titulares dados.
- category: la categoria del catalizador.
- tickers: simbolos beneficiados.
- confidence: 'baja' | 'media' | 'alta'.
- horizon: horizonte temporal estimado.
- invalidation: que evento invalidaria la tesis.
""".strip()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _format_headlines(title: str, items: list[NewsItem]) -> list[str]:
    lines = [title]
    for n in items:
        ts = n.published_at.strftime("%Y-%m-%d %H:%M") if n.published_at else "s/f"
        prefix = f"[{n.symbol}] " if n.symbol else ""
        lines.append(f"- [{ts}] ({n.source or 'fuente desconocida'}) {prefix}{n.title}")
    return lines


def run_event_scout(session: Session) -> int:
    """Genera ideas de evento desde titulares de 24h y las guarda como ScreenResult."""
    cutoff = _utcnow() - timedelta(hours=24)
    macro = list(
        session.scalars(
            select(NewsItem)
            .where(NewsItem.symbol.is_(None), NewsItem.published_at >= cutoff)
            .order_by(NewsItem.published_at.desc())
            .limit(60)
        )
    )
    company: list[NewsItem] = []
    if len(macro) < 15:
        company = list(
            session.scalars(
                select(NewsItem)
                .join(Ticker, NewsItem.symbol == Ticker.symbol)
                .where(NewsItem.published_at >= cutoff)
                .order_by(Ticker.market_cap.desc().nulls_last(), NewsItem.published_at.desc())
                .limit(20)
            )
        )
    if not macro and not company:
        logger.info("Event scout: sin titulares en 24h, no se llama al modelo")
        return 0

    lines: list[str] = _format_headlines("TITULARES MACRO (ultimas 24h):", macro) if macro else [
        "TITULARES MACRO (ultimas 24h): ninguno."
    ]
    if company:
        lines.append("")
        lines += _format_headlines("TITULARES DE EMPRESAS (mayor market cap):", company)
    lines += ["", _TASK]

    result = run_agent_json(_SYSTEM, "\n".join(lines), _SCHEMA)
    ideas = [i for i in (result.get("ideas") or []) if isinstance(i, dict)][:5]

    today = date.today()
    session.execute(
        delete(ScreenResult).where(ScreenResult.screen == "event", ScreenResult.as_of == today)
    )
    for i, idea in enumerate(ideas):
        raw = [str(t) for t in (idea.get("tickers") or [])]
        normalized = [t.strip().upper().replace(".", "-") for t in raw if t.strip()]
        known: set[str] = set()
        if normalized:
            known = set(session.scalars(select(Ticker.symbol).where(Ticker.symbol.in_(normalized))))
        details = dict(idea)
        details["tickers"] = [t for t in normalized if t in known]
        details["raw_tickers"] = raw
        session.add(
            ScreenResult(
                screen="event",
                as_of=today,
                symbol=None,
                score=float(_SCORE.get(idea.get("confidence"), 33)),
                rank=i + 1,
                details=details,
            )
        )
    session.commit()
    return len(ideas)
