"""Ingesta de noticias RSS: Google News por símbolo y feeds macro."""
import logging
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import feedparser
import requests
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Alert, NewsItem, Ticker

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}
SYMBOL_FEED = "https://news.google.com/rss/search?q={query}+stock&hl=en-US&gl=US&ceid=US:en"
MACRO_FEEDS = [
    "https://feeds.content.dowjones.io/public/rss/mw_topstories",
    "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "https://finance.yahoo.com/news/rssindex",
]
_MAX_NEW_PER_FEED = 15
_STALE_SYMBOLS_LIMIT = 30


def _fetch_feed(url: str) -> feedparser.FeedParserDict | None:
    """Descarga y parsea un feed con reintentos; None si falla."""
    for intento in range(3):
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=20)
            resp.raise_for_status()
            return feedparser.parse(resp.content)
        except Exception as exc:
            if intento == 2:
                logger.warning("Feed %s falló: %s", url, exc)
                return None
            time.sleep(2 ** (intento + 1))
    return None


def _published(entry: dict) -> datetime | None:
    """published_parsed (struct_time UTC) -> datetime naive."""
    pp = entry.get("published_parsed") or entry.get("updated_parsed")
    return datetime(*pp[:6]) if pp else None


def _source(entry: dict) -> str | None:
    src = entry.get("source")
    if src and src.get("title"):
        return str(src["title"])[:100]
    return None


def _insert_entries(session: Session, symbol: str | None, entries: list) -> int:
    """Inserta hasta 15 entradas nuevas (dedupe por symbol+url). Devuelve insertadas."""
    inserted = 0
    seen_urls: set[str] = set()
    for entry in entries:
        if inserted >= _MAX_NEW_PER_FEED:
            break
        title = (entry.get("title") or "").strip()
        url = entry.get("link")
        if not title or not url or url in seen_urls:
            continue
        seen_urls.add(url)
        sym_cond = NewsItem.symbol.is_(None) if symbol is None else NewsItem.symbol == symbol
        if session.scalar(select(NewsItem.id).where(sym_cond, NewsItem.url == url)) is not None:
            continue
        session.add(
            NewsItem(
                symbol=symbol,
                title=title[:500],
                url=url,
                source=_source(entry),
                published_at=_published(entry),
            )
        )
        inserted += 1
    return inserted


def fetch_news_for_symbols(session: Session, symbols: list[str]) -> int:
    """Google News RSS por símbolo. Devuelve total de titulares insertados."""
    total = 0
    for symbol in symbols:
        feed = _fetch_feed(SYMBOL_FEED.format(query=quote(symbol)))
        if feed is None:
            continue
        total += _insert_entries(session, symbol, feed.entries)
        session.commit()
    logger.info("Noticias por símbolo: %d insertadas (%d símbolos)", total, len(symbols))
    return total


def fetch_macro_news(session: Session) -> int:
    """Feeds macro (symbol=None). Devuelve total de titulares insertados."""
    total = 0
    for url in MACRO_FEEDS:
        feed = _fetch_feed(url)
        if feed is None:
            continue
        total += _insert_entries(session, None, feed.entries)
        session.commit()
    logger.info("Noticias macro: %d insertadas", total)
    return total


def prioritized_news_refresh(session: Session) -> int:
    """Refresco priorizado: símbolos con alertas recientes y luego los más desactualizados."""
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=48)
    alert_syms = list(
        session.scalars(
            select(Alert.symbol)
            .where(Alert.created_at >= since, Alert.kind != "system", Alert.symbol.is_not(None))
            .distinct()
        )
    )
    last_pub = (
        select(NewsItem.symbol, func.max(NewsItem.published_at).label("last_pub"))
        .where(NewsItem.symbol.is_not(None))
        .group_by(NewsItem.symbol)
        .subquery()
    )
    stale_stmt = (
        select(Ticker.symbol)
        .outerjoin(last_pub, last_pub.c.symbol == Ticker.symbol)
        .where(Ticker.is_active.is_(True))
        .order_by(last_pub.c.last_pub.asc().nulls_first(), Ticker.symbol.asc())
        .limit(_STALE_SYMBOLS_LIMIT)
    )
    if alert_syms:
        stale_stmt = stale_stmt.where(Ticker.symbol.notin_(alert_syms))
    stale = list(session.scalars(stale_stmt))
    return fetch_news_for_symbols(session, alert_syms + stale)
