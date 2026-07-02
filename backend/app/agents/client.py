"""Cliente Anthropic para los agentes IA: llamadas con salida JSON estructurada."""
import json
import logging

import anthropic
from anthropic.types import Message

from app.config import settings

logger = logging.getLogger(__name__)


class AgentUnavailable(Exception):
    """No hay API key de Anthropic configurada."""


def has_api_key() -> bool:
    """True si hay ANTHROPIC_API_KEY configurada."""
    return bool(settings.anthropic_api_key)


def _extract_text(resp: Message) -> str:
    """Primer bloque de texto de la respuesta (puede venir precedido de thinking)."""
    return next((b.text for b in resp.content if b.type == "text"), "")


def _parse_json_lenient(text: str) -> dict:
    """Parsea JSON recortando fences ```...``` o texto alrededor del objeto."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
        t = t.rstrip()
        if t.endswith("```"):
            t = t[:-3]
    t = t.strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        start, end = t.find("{"), t.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(t[start : end + 1])


def run_agent_json(system: str, user: str, schema: dict, max_tokens: int | None = None) -> dict:
    """Llama al modelo con salida JSON estructurada y devuelve el dict parseado.

    Lanza AgentUnavailable si no hay API key. Ante 400 por output_config
    (modelo antiguo) reintenta sin formato estructurado. Otros errores
    (RateLimitError, APIStatusError, APIConnectionError) se propagan; el SDK
    ya reintenta 429/5xx por su cuenta.
    """
    if not has_api_key():
        raise AgentUnavailable("ANTHROPIC_API_KEY no configurada")
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    tokens = max_tokens or settings.agent_max_tokens
    try:
        resp = client.messages.create(
            model=settings.agent_model,
            max_tokens=tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"format": {"type": "json_schema", "schema": schema}},
        )
        return json.loads(_extract_text(resp))
    except anthropic.BadRequestError as exc:
        if "output_config" not in str(exc):
            raise
        logger.warning("output_config no soportado por %s; reintento sin formato", settings.agent_model)
    resp = client.messages.create(
        model=settings.agent_model,
        max_tokens=tokens,
        system=system,
        messages=[
            {
                "role": "user",
                "content": user + "\n\nResponde UNICAMENTE con un objeto JSON valido.",
            }
        ],
    )
    return _parse_json_lenient(_extract_text(resp))
