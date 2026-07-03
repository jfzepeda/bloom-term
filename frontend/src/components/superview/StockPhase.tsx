import { VerdictBadge } from "../Badge";
import { Loading } from "../EmptyState";
import {
  fmtCap,
  fmtFrac,
  fmtMoney,
  fmtNum,
  fmtPct,
  pctClass,
} from "../../format";
import type { TickerDetailResponse } from "../../types";
import { accentFor, toPoints } from "./utils";

export function StockPhase({
  hasFeatured,
  symbol,
  detail,
}: {
  hasFeatured: boolean;
  symbol: string | undefined;
  detail: TickerDetailResponse | undefined;
}) {
  if (!hasFeatured) {
    return (
      <p className="muted">
        Aún no hay resultados del screen growth (fundamentals en rotación).
      </p>
    );
  }
  if (!symbol || !detail) return <Loading />;
  const { ticker, fundamentals, dcf, technicals, prices } = detail;
  const closes = prices.map((p) => p.close);
  const points = toPoints(closes, 480, 150);
  const trendColor =
    closes.length >= 2 && closes[closes.length - 1] >= closes[0]
      ? "var(--green)"
      : "var(--red)";

  return (
    <div className="kiosk-stock">
      <div className="kiosk-stock-side">
        <div className="kiosk-stock-head">
          <div
            className="kiosk-stock-badge"
            style={{ background: accentFor(ticker.symbol) }}
          >
            <img
              src={`https://img.logo.dev/ticker/${ticker.symbol}?token=pk_Vf100h2MQD2W_VHqG04VCQ`}
              alt={ticker.symbol}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div>
            <div className="kiosk-stock-symbol">{ticker.symbol}</div>
            <div className="kiosk-stock-name">{ticker.name ?? "—"}</div>
          </div>
        </div>
        <div className="kiosk-stock-price">
          {fmtMoney(technicals?.last_close)}
        </div>
        <div className="kiosk-stock-stats">
          <div className="kiosk-stock-stat">
            <div className="kiosk-stock-stat-label">P/E</div>
            <div className="kiosk-stock-stat-value">
              {fundamentals?.pe != null
                ? `${fmtNum(fundamentals.pe, 1)}x`
                : "—"}
            </div>
          </div>
          <div className="kiosk-stock-stat">
            <div className="kiosk-stock-stat-label">FCF (TTM)</div>
            <div className="kiosk-stock-stat-value">
              {fmtCap(fundamentals?.fcf_ttm)}
            </div>
          </div>
        </div>
        <div className="kiosk-stock-note">
          <VerdictBadge verdict={dcf?.verdict} />
          {dcf?.upside_pct != null && (
            <span className={pctClass(dcf.upside_pct)}>
              {fmtPct(dcf.upside_pct)} vs. precio actual
            </span>
          )}
        </div>
        <div className="kiosk-stock-extra">
          Crecimiento ingresos TTM: {fmtFrac(fundamentals?.revenue_growth_ttm)}
        </div>
      </div>
      <div className="kiosk-stock-chart">
        <div className="kiosk-stock-chart-title">Precio — último año</div>
        <svg
          width="100%"
          height="150"
          viewBox="0 0 480 150"
          preserveAspectRatio="none"
          style={{ flex: 1 }}
        >
          <polyline
            points={points}
            fill="none"
            stroke={trendColor}
            strokeWidth={2.5}
          />
        </svg>
        <div className="kiosk-stock-chart-labels">
          <span>{prices[0]?.date ?? "—"}</span>
          <span>{prices[Math.floor(prices.length / 2)]?.date ?? ""}</span>
          <span>HOY</span>
        </div>
      </div>
    </div>
  );
}
