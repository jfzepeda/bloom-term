import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiError, getTicker } from "../api";
import AlertCard from "../components/AlertCard";
import AssumptionsGrid from "../components/Assumptions";
import { VerdictBadge } from "../components/Badge";
import EmptyState, { ErrorState, Loading } from "../components/EmptyState";
import { fmtCap, fmtFrac, fmtMoney, fmtNum, fmtPct, fmtRelative, pctClass } from "../format";
import type { TickerDetailResponse } from "../types";

export default function TickerDetail() {
  const { symbol = "" } = useParams();
  const [data, setData] = useState<TickerDetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setNotFound(false);
    setError(null);
    getTicker(symbol)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [symbol]);

  if (notFound)
    return (
      <EmptyState
        title={`Ticker ${symbol} no encontrado`}
        message="Comprueba el símbolo (formato Yahoo, p. ej. BRK-B) o vuelve al Overview."
      />
    );
  if (error) return <ErrorState message={error} />;
  if (data === null) return <Loading />;

  const { ticker, prices, technicals: t, fundamentals: f, dcf, news, alerts } = data;
  const lastClose = t?.last_close ?? (prices.length > 0 ? prices[prices.length - 1].close : null);
  const change = t?.change_pct_1d;

  return (
    <div className="ticker-page">
      <header className="ticker-head panel">
        <div className="ticker-id">
          <h2 className="ticker-symbol">{ticker.symbol}</h2>
          <div>
            <div className="ticker-name">{ticker.name ?? "—"}</div>
            <div className="muted">
              {ticker.sector ?? "—"}
              {ticker.industry ? ` · ${ticker.industry}` : ""}
              {ticker.is_nasdaq100 ? " · Nasdaq-100" : ""}
            </div>
          </div>
        </div>
        <div className="ticker-stats">
          <div className="stat">
            <span className="stat-label">Market cap</span>
            <span className="stat-value">{ticker.market_cap != null ? `$${fmtCap(ticker.market_cap)}` : "—"}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Último cierre</span>
            <span className="stat-value">{fmtMoney(lastClose)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Cambio 1d</span>
            <span className={`stat-value ${pctClass(change)}`}>{fmtPct(change)}</span>
          </div>
        </div>
      </header>

      <div className="panel chart-panel">
        <h3 className="card-title">Último año</h3>
        {prices.length === 0 ? (
          <p className="muted">Sin histórico de precios aún.</p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={prices} margin={{ top: 8, right: 76, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="#1e2430" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#8b93a7"
                tick={{ fontSize: 11 }}
                tickFormatter={(d: string) =>
                  new Date(`${d}T00:00:00`).toLocaleDateString("es", { month: "short" })
                }
                minTickGap={40}
              />
              <YAxis
                stroke="#8b93a7"
                tick={{ fontSize: 11 }}
                width={58}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => `$${Math.round(v)}`}
              />
              <Tooltip
                contentStyle={{
                  background: "#11151f",
                  border: "1px solid #1e2430",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#e6e9f0",
                }}
                labelStyle={{ color: "#8b93a7" }}
                formatter={(value: number | string) => [
                  fmtMoney(typeof value === "number" ? value : Number(value)),
                  "Cierre",
                ]}
              />
              {t?.ath != null && (
                <ReferenceLine
                  y={t.ath}
                  stroke="#8b93a7"
                  ifOverflow="extendDomain"
                  label={{ value: "ATH", position: "right", fill: "#8b93a7", fontSize: 11 }}
                />
              )}
              {t?.ath != null && (
                <ReferenceLine
                  y={t.ath * 0.7}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: "ATH-30%", position: "right", fill: "#ef4444", fontSize: 11 }}
                />
              )}
              {t?.ath != null && (
                <ReferenceLine
                  y={t.ath * 0.5}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: "ATH-50%", position: "right", fill: "#ef4444", fontSize: 11 }}
                />
              )}
              {t?.support != null && (
                <ReferenceLine
                  y={t.support}
                  stroke="#3b82f6"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: "Soporte", position: "right", fill: "#3b82f6", fontSize: 11 }}
                />
              )}
              {t?.resistance != null && (
                <ReferenceLine
                  y={t.resistance}
                  stroke="#3b82f6"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                  label={{ value: "Resistencia", position: "right", fill: "#3b82f6", fontSize: 11 }}
                />
              )}
              <Line
                type="monotone"
                dataKey="close"
                stroke="#3b82f6"
                strokeWidth={1.6}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="cards-grid">
        <div className="panel card">
          <h3 className="card-title">DCF</h3>
          {dcf ? (
            <>
              <div className="kv-grid">
                <div className="kv">
                  <span className="kv-key">Valor intrínseco</span>
                  <span className="kv-val">{fmtMoney(dcf.intrinsic_value)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">Precio al cálculo</span>
                  <span className="kv-val">{fmtMoney(dcf.price_at_calc)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">Upside</span>
                  <span className={`kv-val ${pctClass(dcf.upside_pct)}`}>{fmtPct(dcf.upside_pct)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">Veredicto</span>
                  <span className="kv-val">
                    <VerdictBadge verdict={dcf.verdict} />
                  </span>
                </div>
              </div>
              <h4 className="card-subtitle">Supuestos</h4>
              <AssumptionsGrid assumptions={dcf.assumptions} />
              <p className="muted card-asof">A fecha {dcf.as_of}</p>
            </>
          ) : (
            <p className="muted">Sin valoración DCF aún.</p>
          )}
        </div>

        <div className="panel card">
          <h3 className="card-title">Técnicos</h3>
          {t ? (
            <>
              <div className="kv-grid">
                <div className="kv">
                  <span className="kv-key">Drawdown desde ATH</span>
                  <span className={`kv-val ${pctClass(t.drawdown_from_ath_pct)}`}>
                    {fmtPct(t.drawdown_from_ath_pct)}
                  </span>
                </div>
                <div className="kv">
                  <span className="kv-key">Rally desde mínimo 52s</span>
                  <span className={`kv-val ${pctClass(t.rally_from_low_pct)}`}>
                    {fmtPct(t.rally_from_low_pct)}
                  </span>
                </div>
                <div className="kv">
                  <span className="kv-key">RSI 14</span>
                  <span className="kv-val">{fmtNum(t.rsi14)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">Dist. a SMA200</span>
                  <span className={`kv-val ${pctClass(t.dist_sma200_pct)}`}>
                    {fmtPct(t.dist_sma200_pct)}
                  </span>
                </div>
                <div className="kv">
                  <span className="kv-key">Soporte</span>
                  <span className="kv-val">{fmtMoney(t.support)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">Resistencia</span>
                  <span className="kv-val">{fmtMoney(t.resistance)}</span>
                </div>
              </div>
              <p className="muted card-asof">A fecha {t.as_of}</p>
            </>
          ) : (
            <p className="muted">Sin snapshot técnico aún.</p>
          )}
        </div>

        <div className="panel card">
          <h3 className="card-title">Fundamentales</h3>
          {f ? (
            <>
              <div className="kv-grid">
                <div className="kv">
                  <span className="kv-key">ROE (TTM)</span>
                  <span className="kv-val">{fmtFrac(f.roe_ttm)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">Margen bruto</span>
                  <span className="kv-val">{fmtFrac(f.gross_margin)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">Margen operativo</span>
                  <span className="kv-val">{fmtFrac(f.operating_margin)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">Deuda / Equity</span>
                  <span className="kv-val">{fmtNum(f.debt_to_equity, 2)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">Crec. ingresos (TTM)</span>
                  <span className="kv-val">{fmtFrac(f.revenue_growth_ttm)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">FCF CAGR 5a</span>
                  <span className="kv-val">{fmtFrac(f.fcf_cagr_5y)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">PE</span>
                  <span className="kv-val">{fmtNum(f.pe)}</span>
                </div>
                <div className="kv">
                  <span className="kv-key">PEG</span>
                  <span className="kv-val">{fmtNum(f.peg, 2)}</span>
                </div>
              </div>
              <p className="muted card-asof">A fecha {f.as_of}</p>
            </>
          ) : (
            <p className="muted">Sin fundamentales aún.</p>
          )}
        </div>
      </div>

      <div className="ticker-lists">
        <div className="panel card">
          <h3 className="card-title">Noticias</h3>
          {news.length === 0 ? (
            <p className="muted">Sin noticias recientes.</p>
          ) : (
            <ul className="news-list">
              {news.map((n, i) => (
                <li key={i}>
                  <a href={n.url} target="_blank" rel="noopener noreferrer">
                    {n.title}
                  </a>
                  <span className="muted news-meta">
                    {n.source ?? "—"} · {fmtRelative(n.published_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="panel card">
          <h3 className="card-title">Alertas del ticker</h3>
          {alerts.length === 0 ? (
            <p className="muted">Sin alertas para este ticker.</p>
          ) : (
            <div className="alert-feed">
              {alerts.map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </div>
          )}
          <Link to="/alerts" className="side-link">
            Ver todas las alertas →
          </Link>
        </div>
      </div>
    </div>
  );
}
