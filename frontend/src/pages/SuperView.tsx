import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAgentJobsStatus, getAlerts, getTicker } from "../api";
import { VerdictBadge } from "../components/Badge";
import { Loading } from "../components/EmptyState";
import { severityLabel } from "../components/Severity";
import {
  fmtCap,
  fmtFrac,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtRelative,
  pctClass,
  todayISO,
} from "../format";
import { useScreen } from "../hooks/useScreen";
import { useUniverse } from "../hooks/useUniverse";
import type {
  AgentJobsStatusResponse,
  AlertItem,
  TickerDetailResponse,
} from "../types";

const ACCENT_PALETTE = [
  "var(--blue)",
  "var(--green)",
  "var(--amber)",
  "var(--red)",
];

function accentFor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++)
    hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

function severityColor(severity: string): string {
  if (severity === "alta") return "var(--red)";
  if (severity === "media") return "var(--amber)";
  return "var(--blue)";
}

const JOB_STATUS_CLASS: Record<string, string> = {
  done: "pos",
  error: "neg",
  running: "kiosk-status-running",
  pending: "muted",
  skipped: "muted",
};

function toPoints(values: number[], w: number, h: number): string {
  if (values.length === 0) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

interface TickerRowItem {
  symbol: string;
  priceDisplay: string;
  pctDisplay: string;
  pctCls: string;
}

interface SectorAgg {
  name: string;
  avgPct: number;
  count: number;
}

interface ModalRow {
  label: string;
  value: string;
}

interface ModalState {
  title: string;
  subtitle: string;
  rows: ModalRow[];
  note: string;
}

function TickerRow({
  label,
  items,
  variant,
}: {
  label: string;
  items: TickerRowItem[];
  variant: "a" | "b";
}) {
  if (items.length === 0) return null;
  const doubled = [...items, ...items];
  return (
    <div className={`kiosk-ticker kiosk-ticker-${variant}`}>
      <div className="kiosk-ticker-tag">{label}</div>
      <div className="kiosk-ticker-scroll">
        <div className="kiosk-ticker-track">
          {doubled.map((it, i) => (
            <div className="kiosk-ticker-item" key={`${it.symbol}-${i}`}>
              <span className="kiosk-ticker-symbol">{it.symbol}</span>
              <span>{it.priceDisplay}</span>
              <span className={it.pctCls}>{it.pctDisplay}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentsPhase({ status }: { status: AgentJobsStatusResponse | null }) {
  if (!status) return <Loading />;
  const { counts, recent } = status;
  return (
    <div className="kiosk-agents-wrap">
      <div className="kiosk-agents">
        <div className="kiosk-agent-row">
          <span
            className={`kiosk-agent-dot${counts.running > 0 ? " active" : ""}`}
          />
          <span>{counts.running} en ejecución</span>
        </div>
        <div className="kiosk-agent-row">
          <span
            className={`kiosk-agent-dot${counts.pending > 0 ? " active" : ""}`}
          />
          <span>{counts.pending} pendientes en cola</span>
        </div>
        <div className="kiosk-agent-row">
          <span className="kiosk-agent-dot" />
          <span className="pos">{counts.done} completados</span>
        </div>
        {counts.error > 0 && (
          <div className="kiosk-agent-row">
            <span
              className="kiosk-agent-dot"
              style={{ background: "var(--red)" }}
            />
            <span className="neg">{counts.error} con error</span>
          </div>
        )}
        {counts.skipped > 0 && (
          <div className="kiosk-agent-row">
            <span className="kiosk-agent-dot" />
            <span className="muted">
              {counts.skipped} omitidos (sin ANTHROPIC_API_KEY)
            </span>
          </div>
        )}
      </div>
      {recent.length > 0 && (
        <div className="kiosk-agent-recent">
          {recent.slice(0, 6).map((j) => (
            <div key={j.id} className="kiosk-agent-recent-row">
              <span className="muted">{j.kind}</span>
              {j.symbol && (
                <span className="kiosk-agent-recent-symbol">{j.symbol}</span>
              )}
              <span className={JOB_STATUS_CLASS[j.status] ?? "muted"}>
                {j.status}
              </span>
              <span className="muted kiosk-agent-recent-time">
                {fmtRelative(j.updated_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StockPhase({
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

function PipelineStep({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="kiosk-pipeline-step">
      <svg
        className="kiosk-pipeline-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
      >
        {children}
      </svg>
      <div className="kiosk-pipeline-label">{label}</div>
    </div>
  );
}

function PipelinePhase() {
  return (
    <div className="kiosk-pipeline">
      <PipelineStep color="var(--blue)" label="Ingesta de Datos">
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <line x1="3" y1="12" x2="21" y2="12" />
      </PipelineStep>
      <span className="kiosk-pipeline-arrow" aria-hidden="true">
        →
      </span>
      <PipelineStep color="var(--green)" label="Análisis Value / Growth / DCF">
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <line x1="1" y1="9" x2="6" y2="9" />
        <line x1="1" y1="15" x2="6" y2="15" />
        <line x1="18" y1="9" x2="23" y2="9" />
        <line x1="18" y1="15" x2="23" y2="15" />
        <line x1="9" y1="1" x2="9" y2="6" />
        <line x1="15" y1="1" x2="15" y2="6" />
      </PipelineStep>
      <span className="kiosk-pipeline-arrow" aria-hidden="true">
        →
      </span>
      <PipelineStep color="var(--amber)" label="Motor de Alertas">
        <path d="M3 21V10l5-3 5 3v11" />
        <path d="M13 21V7l5-3 3 2v15" />
      </PipelineStep>
      <span className="kiosk-pipeline-arrow" aria-hidden="true">
        →
      </span>
      <PipelineStep
        color="var(--red)"
        label="Agentes IA (Research / Event Scout / Observer)"
      >
        <rect x="4" y="3" width="16" height="18" rx="1.5" />
        <line x1="8" y1="8" x2="16" y2="8" />
        <line x1="8" y1="12" x2="16" y2="12" />
        <line x1="8" y1="16" x2="13" y2="16" />
      </PipelineStep>
    </div>
  );
}

function Modal({
  content,
  onClose,
}: {
  content: ModalState;
  onClose: () => void;
}) {
  return (
    <div className="kiosk-modal-overlay" onClick={onClose}>
      <div className="kiosk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kiosk-modal-head">
          <div className="kiosk-modal-title">{content.title}</div>
          <button
            type="button"
            className="kiosk-modal-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <p className="kiosk-modal-subtitle">{content.subtitle}</p>
        <div className="kiosk-modal-rows">
          {content.rows.map((r) => (
            <div key={r.label} className="kiosk-modal-row">
              <span className="kiosk-modal-row-label">{r.label}</span>
              <span className="kiosk-modal-row-value">{r.value}</span>
            </div>
          ))}
        </div>
        <p className="kiosk-modal-note">{content.note}</p>
      </div>
    </div>
  );
}

export default function SuperView() {
  const navigate = useNavigate();
  const { items, error: universeError } = useUniverse();
  const growth = useScreen("growth");

  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [agentStatus, setAgentStatus] =
    useState<AgentJobsStatusResponse | null>(null);
  const [tickerCache, setTickerCache] = useState<
    Record<string, TickerDetailResponse>
  >({});
  const [modal, setModal] = useState<ModalState | null>(null);
  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") navigate("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getAlerts({ since: todayISO(), limit: 20 })
        .then((r) => {
          if (alive) setAlerts(r.items);
        })
        .catch(() => {});
    load();
    const id = window.setInterval(load, 60000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getAgentJobsStatus()
        .then((r) => {
          if (alive) setAgentStatus(r);
        })
        .catch(() => {});
    load();
    const id = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFading(true);
      window.setTimeout(() => {
        setStep((s) => s + 1);
        setFading(false);
      }, 400);
    }, 10000);
    return () => window.clearInterval(id);
  }, []);

  const withChange = useMemo(
    () => (items ?? []).filter((it) => it.change_pct_1d != null),
    [items]
  );

  const nasdaqRow = useMemo<TickerRowItem[]>(
    () =>
      [...(items ?? [])]
        .filter((it) => it.is_nasdaq100 && it.last_close != null)
        .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
        .slice(0, 18)
        .map((it) => ({
          symbol: it.symbol,
          priceDisplay: fmtMoney(it.last_close),
          pctDisplay: fmtPct(it.change_pct_1d),
          pctCls: pctClass(it.change_pct_1d),
        })),
    [items]
  );

  const topMovers = useMemo(
    () =>
      [...withChange]
        .sort((a, b) => Math.abs(b.change_pct_1d!) - Math.abs(a.change_pct_1d!))
        .slice(0, 20),
    [withChange]
  );

  const moversRow = useMemo<TickerRowItem[]>(
    () =>
      topMovers.map((it) => ({
        symbol: it.symbol,
        priceDisplay: fmtMoney(it.last_close),
        pctDisplay: fmtPct(it.change_pct_1d),
        pctCls: pctClass(it.change_pct_1d),
      })),
    [topMovers]
  );

  const sectors = useMemo<SectorAgg[]>(() => {
    const map = new Map<string, { sum: number; count: number }>();
    for (const it of withChange) {
      const name = it.sector ?? "Sin sector";
      const cur = map.get(name) ?? { sum: 0, count: 0 };
      cur.sum += it.change_pct_1d!;
      cur.count += 1;
      map.set(name, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, avgPct: v.sum / v.count, count: v.count }))
      .sort((a, b) => b.avgPct - a.avgPct);
  }, [withChange]);

  const featuredSymbols = useMemo(() => {
    const screenItems = growth.data?.items ?? [];
    return [...screenItems]
      .filter((it) => it.symbol != null)
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9))
      .slice(0, 3)
      .map((it) => it.symbol as string);
  }, [growth.data]);

  const phase = step % 3;
  const stockIdx =
    featuredSymbols.length > 0
      ? Math.floor(step / 3) % featuredSymbols.length
      : 0;
  const activeSymbol = featuredSymbols[stockIdx];

  useEffect(() => {
    if (phase !== 1 || !activeSymbol || tickerCache[activeSymbol]) return;
    let alive = true;
    getTicker(activeSymbol)
      .then((r) => {
        if (alive) setTickerCache((c) => ({ ...c, [activeSymbol]: r }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [phase, activeSymbol, tickerCache]);

  const aiNotes = useMemo(
    () =>
      (alerts ?? [])
        .filter((a) => a.agent_analysis?.interpretation)
        .slice(0, 6),
    [alerts]
  );

  return (
    <div className="kiosk">
      <button
        type="button"
        className="kiosk-exit"
        onClick={() => navigate("/")}
      >
        ✕ Salir
      </button>

      <TickerRow label="NASDAQ-100" items={nasdaqRow} variant="a" />
      <TickerRow label="TOP MOVIMIENTOS" items={moversRow} variant="b" />

      <div className="kiosk-body">
        <div className="kiosk-main">
          {universeError && (
            <div className="kiosk-section-title neg">
              Error cargando universo: {universeError}
            </div>
          )}

          <div>
            <div className="kiosk-section-title">Sectores S&amp;P 500</div>
            <div className="kiosk-sectors">
              {sectors.slice(0, 8).map((s) => (
                <button
                  key={s.name}
                  type="button"
                  className="kiosk-sector-card"
                  onClick={() =>
                    setModal({
                      title: s.name,
                      subtitle: "Sector S&P 500 / Nasdaq-100",
                      rows: [
                        {
                          label: "Variación promedio del día",
                          value: fmtPct(s.avgPct),
                        },
                        {
                          label: "Tickers en universo",
                          value: String(s.count),
                        },
                      ],
                      note: "Promedio simple de la variación diaria de los tickers del universo en este sector.",
                    })
                  }
                >
                  <span className="kiosk-sector-name">{s.name}</span>
                  <span className={`kiosk-sector-pct ${pctClass(s.avgPct)}`}>
                    {fmtPct(s.avgPct)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="kiosk-section-title">Top Movimientos</div>
            <div className="kiosk-movers">
              {topMovers.slice(0, 14).map((it) => (
                <button
                  key={it.symbol}
                  type="button"
                  className="kiosk-mover-card"
                  onClick={() =>
                    // abrir selfdomain/ticker/${it.symbol} en nueva pestaña
                    window.open(`/ticker/${it.symbol}`, "_self")
                  }
                >
                  <span
                    className="kiosk-mover-badge"
                    style={{ background: accentFor(it.symbol) }}
                  >
                    <img
                      src={`https://img.logo.dev/ticker/${it.symbol}?token=pk_Vf100h2MQD2W_VHqG04VCQ`}
                      alt={it.symbol}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </span>
                  <span className="kiosk-mover-info">
                    <span className="kiosk-mover-symbol">{it.symbol}</span>
                    <span className="kiosk-mover-price">
                      {fmtMoney(it.last_close)}
                    </span>
                  </span>
                  <span
                    className={`kiosk-mover-pct ${pctClass(it.change_pct_1d)}`}
                  >
                    {fmtPct(it.change_pct_1d)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 grid-rows-2 gap-[10px] flex-1 min-h-0">
            <div
              className={`kiosk-center${fading ? " kiosk-center-fade" : ""}`}
            >
              {phase === 0 && (
                <>
                  <div className="kiosk-center-title">
                    Agentes IA — Cola de Trabajo
                  </div>
                  <AgentsPhase status={agentStatus} />
                </>
              )}
              {phase === 1 && (
                <>
                  <div className="kiosk-center-title">Stock Destacado</div>
                  <StockPhase
                    hasFeatured={featuredSymbols.length > 0}
                    symbol={activeSymbol}
                    detail={
                      activeSymbol ? tickerCache[activeSymbol] : undefined
                    }
                  />
                </>
              )}
              {phase === 2 && (
                <>
                  <div className="kiosk-center-title">
                    Pipeline de Investigación — Market Sentinel
                  </div>
                  <PipelinePhase />
                </>
              )}
            </div>
            <div
              className={`kiosk-center${fading ? " kiosk-center-fade" : ""}`}
            >
              {phase === 0 && (
                <>
                  <div className="kiosk-center-title">
                    Agentes IA — Cola de Trabajo
                  </div>
                  <AgentsPhase status={agentStatus} />
                </>
              )}
              {phase === 1 && (
                <>
                  <div className="kiosk-center-title">Stock Destacado</div>
                  <StockPhase
                    hasFeatured={featuredSymbols.length > 0}
                    symbol={activeSymbol}
                    detail={
                      activeSymbol ? tickerCache[activeSymbol] : undefined
                    }
                  />
                </>
              )}
              {phase === 2 && (
                <>
                  <div className="kiosk-center-title">
                    Pipeline de Investigación — Market Sentinel
                  </div>
                  <PipelinePhase />
                </>
              )}
            </div>
            <div
              className={`kiosk-center${fading ? " kiosk-center-fade" : ""}`}
            >
              {phase === 0 && (
                <>
                  <div className="kiosk-center-title">
                    Agentes IA — Cola de Trabajo
                  </div>
                  <AgentsPhase status={agentStatus} />
                </>
              )}
              {phase === 1 && (
                <>
                  <div className="kiosk-center-title">Stock Destacado</div>
                  <StockPhase
                    hasFeatured={featuredSymbols.length > 0}
                    symbol={activeSymbol}
                    detail={
                      activeSymbol ? tickerCache[activeSymbol] : undefined
                    }
                  />
                </>
              )}
              {phase === 2 && (
                <>
                  <div className="kiosk-center-title">
                    Pipeline de Investigación — Market Sentinel
                  </div>
                  <PipelinePhase />
                </>
              )}
            </div>
            <div
              className={`kiosk-center${fading ? " kiosk-center-fade" : ""}`}
            >
              {phase === 0 && (
                <>
                  <div className="kiosk-center-title">
                    Agentes IA — Cola de Trabajo
                  </div>
                  <AgentsPhase status={agentStatus} />
                </>
              )}
              {phase === 1 && (
                <>
                  <div className="kiosk-center-title">Stock Destacado</div>
                  <StockPhase
                    hasFeatured={featuredSymbols.length > 0}
                    symbol={activeSymbol}
                    detail={
                      activeSymbol ? tickerCache[activeSymbol] : undefined
                    }
                  />
                </>
              )}
              {phase === 2 && (
                <>
                  <div className="kiosk-center-title">
                    Pipeline de Investigación — Market Sentinel
                  </div>
                  <PipelinePhase />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="kiosk-sidebar">
          <div className="kiosk-side-block">
            <div className="kiosk-section-title">Noticias &amp; Alertas</div>
            <div className="kiosk-side-list">
              {alerts === null ? (
                <Loading />
              ) : alerts.length === 0 ? (
                <p className="muted">Sin alertas hoy.</p>
              ) : (
                alerts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="kiosk-news-item"
                    style={{ borderLeftColor: severityColor(a.severity) }}
                    onClick={() =>
                      setModal({
                        title: severityLabel(a.severity),
                        subtitle: `${a.symbol ?? "General"} · ${fmtRelative(
                          a.created_at
                        )}`,
                        rows: [
                          { label: "Alerta", value: a.title },
                          { label: "Símbolo", value: a.symbol ?? "—" },
                          { label: "Tipo", value: a.kind },
                        ],
                        note:
                          a.agent_analysis?.interpretation ??
                          "Interpretación del agente IA pendiente.",
                      })
                    }
                  >
                    <div className="kiosk-news-head">
                      <span
                        className="kiosk-news-tag"
                        style={{ color: severityColor(a.severity) }}
                      >
                        {severityLabel(a.severity)}
                      </span>
                      <span className="kiosk-news-time">
                        {fmtRelative(a.created_at)}
                      </span>
                    </div>
                    <div className="kiosk-news-text">
                      {a.symbol && <strong>{a.symbol} — </strong>}
                      {a.title}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="kiosk-side-block">
            <div className="kiosk-section-title kiosk-title-blue">
              Interpretación IA
            </div>
            <div className="kiosk-side-list">
              {aiNotes.length === 0 ? (
                <p className="muted">
                  Sin interpretaciones de agentes IA todavía.
                </p>
              ) : (
                aiNotes.map((a) => (
                  <div key={a.id} className="kiosk-ai-item">
                    <div className="kiosk-ai-title">{a.symbol ?? a.kind}</div>
                    <div className="kiosk-ai-text">
                      {a.agent_analysis?.interpretation}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {modal && <Modal content={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
