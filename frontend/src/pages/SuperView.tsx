import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAgentJobsStatus, getAlerts, getTicker } from "../api";
import { AgentsPhase } from "../components/superview/AgentsPhase";
import { PipelinePhase } from "../components/superview/PipelinePhase";
import { StockPhase } from "../components/superview/StockPhase";
import { Modal } from "../components/superview/SuperViewModal";
import { TickerRow } from "../components/superview/TickerRow";
import type {
  ModalState,
  SectorAgg,
  TickerRowItem,
} from "../components/superview/types";
import { accentFor, severityColor } from "../components/superview/utils";
import { Loading } from "../components/EmptyState";
import { severityLabel } from "../components/Severity";
import { fmtMoney, fmtPct, fmtRelative, pctClass, todayISO } from "../format";
import { useScreen } from "../hooks/useScreen";
import { useUniverse } from "../hooks/useUniverse";
import type {
  AgentJobsStatusResponse,
  AlertItem,
  TickerDetailResponse,
} from "../types";

function PhaseContent({
  phase,
  agentStatus,
  featuredSymbols,
  activeSymbol,
  tickerCache,
}: {
  phase: number;
  agentStatus: AgentJobsStatusResponse | null;
  featuredSymbols: string[];
  activeSymbol: string | undefined;
  tickerCache: Record<string, TickerDetailResponse>;
}) {
  if (phase === 0) {
    return (
      <>
        <div className="kiosk-center-title">Agentes IA — Cola de Trabajo</div>
        <AgentsPhase status={agentStatus} />
      </>
    );
  }
  if (phase === 1) {
    return (
      <>
        <div className="kiosk-center-title">Stock Destacado</div>
        <StockPhase
          hasFeatured={featuredSymbols.length > 0}
          symbol={activeSymbol}
          detail={activeSymbol ? tickerCache[activeSymbol] : undefined}
        />
      </>
    );
  }
  return (
    <>
      <div className="kiosk-center-title">
        Pipeline de Investigación — Market Sentinel
      </div>
      <PipelinePhase />
    </>
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
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`kiosk-center${fading ? " kiosk-center-fade" : ""}`}
              >
                <PhaseContent
                  phase={phase}
                  agentStatus={agentStatus}
                  featuredSymbols={featuredSymbols}
                  activeSymbol={activeSymbol}
                  tickerCache={tickerCache}
                />
              </div>
            ))}
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
