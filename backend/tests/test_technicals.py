"""Tests de los helpers puros de análisis técnico (sin red ni base de datos)."""
import pandas as pd
import pytest

from app.analysis.technicals import compute_rsi, find_pivots, pct_diff


def test_rsi_subida_constante_cercano_a_100() -> None:
    closes = pd.Series([float(x) for x in range(1, 41)])
    rsi = compute_rsi(closes)
    assert rsi is not None
    assert rsi > 95.0


def test_rsi_serie_alternada_cercano_a_50() -> None:
    closes = pd.Series([100.0, 101.0] * 20)
    rsi = compute_rsi(closes)
    assert rsi is not None
    assert 35.0 < rsi < 65.0


def test_rsi_pocos_datos_devuelve_none() -> None:
    assert compute_rsi(pd.Series([1.0, 2.0, 3.0]), period=14) is None
    assert compute_rsi(pd.Series([float(x) for x in range(14)]), period=14) is None


def test_find_pivots_serie_en_v() -> None:
    closes = pd.Series([10.0, 9.0, 8.0, 7.0, 6.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0])
    lows, highs = find_pivots(closes, window=5)
    assert lows == [5.0]
    assert highs == []


def test_find_pivots_pico_invertido() -> None:
    closes = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 5.0, 4.0, 3.0, 2.0, 1.0])
    lows, highs = find_pivots(closes, window=5)
    assert highs == [6.0]
    assert lows == []


def test_drawdown_y_rally_numeros_redondos() -> None:
    # drawdown desde ATH: último 80 con ATH 100 -> -20%
    assert pct_diff(80.0, 100.0) == pytest.approx(-20.0)
    # rally desde mínimo 52w: último 150 con mínimo 100 -> +50%
    assert pct_diff(150.0, 100.0) == pytest.approx(50.0)
    assert pct_diff(100.0, 100.0) == pytest.approx(0.0)


def test_pct_diff_datos_faltantes_devuelve_none() -> None:
    assert pct_diff(None, 100.0) is None
    assert pct_diff(100.0, None) is None
    assert pct_diff(100.0, 0.0) is None
