"""Tests del helper puro de valoración DCF (sin red ni base de datos)."""
from app.analysis.dcf import dcf_intrinsic_value


def test_caso_cerrado_crecimiento_plano() -> None:
    """growth_initial == terminal_growth: el decaimiento es plano y el valor
    se puede replicar con un bucle independiente."""
    fcf_base, growth, rate, years = 100.0, 0.025, 0.10, 10

    expected = 0.0
    fcf = fcf_base
    for year in range(1, years + 1):
        fcf *= 1.0 + growth
        expected += fcf / (1.0 + rate) ** year
    terminal = fcf * (1.0 + growth) / (rate - growth)
    expected += terminal / (1.0 + rate) ** years

    got = dcf_intrinsic_value(
        fcf_base=fcf_base,
        growth_initial=growth,
        discount_rate=rate,
        terminal_growth=growth,
        years=years,
        net_debt=0.0,
        shares_diluted=1.0,
    )
    assert got is not None
    assert abs(got - expected) / expected < 1e-6


def test_shares_invalidas_devuelve_none() -> None:
    assert dcf_intrinsic_value(100.0, 0.05, 0.10, 0.025, 10, 0.0, 0.0) is None
    assert dcf_intrinsic_value(100.0, 0.05, 0.10, 0.025, 10, 0.0, -5.0) is None


def test_mayor_discount_rate_da_menor_valor() -> None:
    low_rate = dcf_intrinsic_value(100.0, 0.10, 0.08, 0.025, 10, 0.0, 1.0)
    high_rate = dcf_intrinsic_value(100.0, 0.10, 0.12, 0.025, 10, 0.0, 1.0)
    assert low_rate is not None and high_rate is not None
    assert high_rate < low_rate


def test_net_debt_resta_del_equity() -> None:
    sin_deuda = dcf_intrinsic_value(100.0, 0.05, 0.10, 0.025, 10, 0.0, 1.0)
    con_deuda = dcf_intrinsic_value(100.0, 0.05, 0.10, 0.025, 10, 50.0, 1.0)
    assert sin_deuda is not None and con_deuda is not None
    assert abs((sin_deuda - con_deuda) - 50.0) < 1e-9
