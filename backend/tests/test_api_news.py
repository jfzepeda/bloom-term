"""Tests del endpoint /api/news (lógica de consulta, sqlite in-memory)."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import models
from app.api import get_news


@pytest.fixture()
def session():
    engine = create_engine("sqlite://")
    models.Base.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


def _seed(s: Session) -> None:
    base = datetime(2026, 7, 2, 12, 0)
    s.add(models.Ticker(symbol="AAPL", name="Apple", is_active=True))
    s.add(
        models.NewsItem(
            symbol=None, title="Macro 1", url="http://m1", source="rss", published_at=base
        )
    )
    s.add(
        models.NewsItem(
            symbol="AAPL",
            title="Apple sube",
            url="http://a1",
            source="rss",
            published_at=base + timedelta(hours=1),
        )
    )
    s.add(
        models.NewsItem(
            symbol=None,
            title="Macro viejo",
            url="http://m0",
            source="rss",
            published_at=base - timedelta(days=1),
        )
    )
    s.commit()


def test_news_all_ordered_desc(session: Session) -> None:
    _seed(session)
    out = get_news(limit=80, session=session)
    titles = [i["title"] for i in out["items"]]
    assert titles == ["Apple sube", "Macro 1", "Macro viejo"]
    assert out["items"][0]["symbol"] == "AAPL"
    assert out["items"][0]["published_at"].startswith("2026-07-02T13:00")


def test_news_filters(session: Session) -> None:
    _seed(session)
    by_symbol = get_news(symbol="aapl", limit=80, session=session)["items"]
    assert [i["title"] for i in by_symbol] == ["Apple sube"]

    macro = get_news(macro_only=True, limit=80, session=session)["items"]
    assert {i["title"] for i in macro} == {"Macro 1", "Macro viejo"}
    assert all(i["symbol"] is None for i in macro)

    assert len(get_news(limit=1, session=session)["items"]) == 1
