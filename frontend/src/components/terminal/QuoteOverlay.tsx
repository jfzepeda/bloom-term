import { useEffect, useState } from "react";
import { ApiError, getTicker } from "../../api";
import {
  fmtCap,
  fmtFrac,
  fmtMoney,
  fmtNum,
  fmtPct,
  fmtRelative,
} from "../../format";
import type { TickerDetailResponse } from "../../types";
import { AiTag, Stamp, TermEmpty, TermLoading } from "./Panel";
import { KvBlock, KvEmpty, KvRow } from "./quote/KvGrid";
import { PriceChart } from "./quote/PriceChart";
import {
  KIND_LABEL,
  SEV_BORDER,
  SEV_LABEL,
  SEV_TEXT,
  VERDICT_TEXT,
  deltaArrow,
  deltaClass,
} from "./utils";

type Status = "cargando" | "listo" | "no_encontrado" | "error";

// Supuestos DCF: llegan en fracción (0.10 = 10%); si algún día llega un
// número ya escalado (>1) lo mostramos tal cual.
function fmtSupuesto(v: unknown): string {
  if (typeof v !== "number" || !isFinite(v)) return "—";
  return Math.abs(v) < 1 ? fmtFrac(v) : fmtNum(v);
}

/**
 * QUOTE — workup completo de un ticker en overlay (la vista más profunda).
 *
 * Contrato:
 * - Datos: getTicker(symbol) al montar / al cambiar symbol; 404 → estado vacío.
 * - Overlay fijo (z-60) sobre el terminal, marco border-hair-strong, fondo
 *   crt-3/95; clic fuera cierra (onClose). ESC lo maneja SuperView.
 * - Cabecera: símbolo grande + nombre + sector·industria + precio + Δ1D
 *   coloreado + veredicto DCF.
 * - Cuerpo: gráfico de precios 365d (Recharts, con líneas de referencia ATH /
 *   soporte / resistencia y tooltip crosshair), columnas DCF / técnicos /
 *   fundamentales (kv en mono), noticias del ticker y alertas con análisis IA.
 */
export function QuoteOverlay({
  symbol,
  onClose,
}: {
  symbol: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<TickerDetailResponse | null>(null);
  const [status, setStatus] = useState<Status>("cargando");

  useEffect(() => {
    let alive = true;
    setStatus("cargando");
    setData(null);
    getTicker(symbol)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setStatus("listo");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setStatus(
          e instanceof ApiError && e.status === 404 ? "no_encontrado" : "error",
        );
      });
    return () => {
      alive = false;
    };
  }, [symbol]);

  const t = data?.ticker ?? null;
  const tech = data?.technicals ?? null;
  const dcf = data?.dcf ?? null;
  const fund = data?.fundamentals ?? null;
  const rsi = tech?.rsi14 ?? null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center bg-crt/80 p-6"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-6xl flex-col border border-hair-strong bg-crt-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Cabecera ─────────────────────────────────────────────── */}
        <header className="flex h-9 shrink-0 items-center gap-3 border-b border-hair bg-crt-2 px-3">
          <span className="shrink-0 text-[11px] font-semibold tracking-[0.18em] text-amber">
            QUOTE
          </span>
          <span className="shrink-0 text-[16px] font-bold leading-none text-glow">
            {symbol}
          </span>
          {t?.name && (
            <span className="min-w-0 truncate text-[11px] text-dim">
              {t.name}
            </span>
          )}
          {(t?.sector || t?.industry) && (
            <span className="hidden min-w-0 truncate text-[10px] text-faint md:inline">
              {[t?.sector, t?.industry].filter(Boolean).join(" · ")}
            </span>
          )}

          <span className="ml-auto flex shrink-0 items-center gap-3">
            {tech && (
              <>
                <span className="text-[16px] font-semibold leading-none text-glow">
                  {fmtMoney(tech.last_close)}
                </span>
                <span
                  className={`text-[11px] ${deltaClass(tech.change_pct_1d)}`}
                >
                  {deltaArrow(tech.change_pct_1d)} {fmtPct(tech.change_pct_1d)}
                </span>
              </>
            )}
            {dcf && (
              <span
                className={`text-[10px] font-semibold tracking-[0.14em] ${
                  VERDICT_TEXT[dcf.verdict] ?? "text-faint"
                }`}
              >
                {dcf.verdict.replace(/_/g, " ")}
              </span>
            )}
            {t && (
              <span className="text-[10px] tracking-[0.12em] text-faint">
                CAP {fmtCap(t.market_cap)}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer border border-hair px-1.5 py-0.5 text-[9px] tracking-[0.14em] text-faint hover:bg-crt-2 hover:text-glow"
            >
              ESC ✕
            </button>
          </span>
        </header>

        {/* ── Cuerpo ───────────────────────────────────────────────── */}
        {status === "cargando" && (
          <div className="min-h-0 flex-1">
            <TermLoading />
          </div>
        )}

        {status === "no_encontrado" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="text-[12px] tracking-[0.2em] text-faint">
              TICKER NO ENCONTRADO
            </div>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer border border-hair-strong px-3 py-1 text-[10px] tracking-[0.14em] text-dim hover:bg-crt-2 hover:text-glow"
            >
              CERRAR
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="text-[12px] tracking-[0.2em] text-faint">
              SIN CONEXIÓN — NO SE PUDO CARGAR {symbol}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer border border-hair-strong px-3 py-1 text-[10px] tracking-[0.14em] text-dim hover:bg-crt-2 hover:text-glow"
            >
              CERRAR
            </button>
          </div>
        )}

        {status === "listo" && data && (
          <div className="flex min-h-0 flex-1 flex-col gap-1 p-1">
            {/* Gráfico + columna derecha */}
            <div className="grid min-h-0 flex-[7] grid-cols-[minmax(0,62fr)_minmax(0,38fr)] gap-1">
              <PriceChart prices={data.prices} technicals={tech} />

              <div className="term-scroll flex min-h-0 flex-col gap-1 overflow-y-auto">
                {/* DCF */}
                <KvBlock
                  code="DCF"
                  right={dcf ? <Stamp>AL {dcf.as_of}</Stamp> : undefined}
                >
                  {dcf ? (
                    <>
                      <KvRow
                        label="V.INTRÍNSECO"
                        value={fmtMoney(dcf.intrinsic_value)}
                      />
                      <KvRow
                        label="PRECIO CÁLC"
                        value={fmtMoney(dcf.price_at_calc)}
                      />
                      <KvRow
                        label="UPSIDE"
                        value={fmtPct(dcf.upside_pct)}
                        valueClass={deltaClass(dcf.upside_pct)}
                      />
                      <KvRow
                        label="VEREDICTO"
                        value={dcf.verdict.replace(/_/g, " ")}
                        valueClass={`font-semibold ${
                          VERDICT_TEXT[dcf.verdict] ?? "text-faint"
                        }`}
                      />
                      {dcf.assumptions && (
                        <>
                          <KvRow
                            label="CRECIMIENTO"
                            value={fmtSupuesto(dcf.assumptions.growth_initial)}
                            valueClass="text-dim"
                          />
                          <KvRow
                            label="DESCUENTO"
                            value={fmtSupuesto(dcf.assumptions.discount_rate)}
                            valueClass="text-dim"
                          />
                          <KvRow
                            label="TERMINAL"
                            value={fmtSupuesto(
                              dcf.assumptions.terminal_growth,
                            )}
                            valueClass="text-dim"
                          />
                        </>
                      )}
                    </>
                  ) : (
                    <KvEmpty>SIN DATOS DCF</KvEmpty>
                  )}
                </KvBlock>

                {/* Técnicos */}
                <KvBlock
                  code="TÉCNICOS"
                  right={tech ? <Stamp>AL {tech.as_of}</Stamp> : undefined}
                >
                  {tech ? (
                    <>
                      <KvRow
                        label="VS ATH"
                        value={fmtPct(tech.drawdown_from_ath_pct)}
                      />
                      <KvRow
                        label="DESDE MÍN 52S"
                        value={fmtPct(tech.rally_from_low_pct)}
                      />
                      <KvRow
                        label="RSI(14)"
                        value={
                          <>
                            {fmtNum(rsi)}
                            {rsi != null && rsi > 70 && (
                              <span className="ml-1 text-[9px] font-semibold text-amber">
                                SC
                              </span>
                            )}
                            {rsi != null && rsi < 30 && (
                              <span className="ml-1 text-[9px] font-semibold text-amber">
                                SV
                              </span>
                            )}
                          </>
                        }
                      />
                      <KvRow
                        label="ΔSMA200"
                        value={fmtPct(tech.dist_sma200_pct)}
                        valueClass={deltaClass(tech.dist_sma200_pct)}
                      />
                      <KvRow label="SOPORTE" value={fmtMoney(tech.support)} />
                      <KvRow
                        label="RESISTENCIA"
                        value={fmtMoney(tech.resistance)}
                      />
                      <KvRow
                        label="RANGO 52S"
                        value={`${fmtMoney(tech.low_52w)} — ${fmtMoney(
                          tech.high_52w,
                        )}`}
                      />
                    </>
                  ) : (
                    <KvEmpty>SIN DATOS TÉCNICOS</KvEmpty>
                  )}
                </KvBlock>

                {/* Fundamentales (¡fracciones!) */}
                <KvBlock
                  code="FUNDAMENTALES"
                  right={fund ? <Stamp>AL {fund.as_of}</Stamp> : undefined}
                >
                  {fund ? (
                    <>
                      <KvRow label="PE" value={fmtNum(fund.pe)} />
                      <KvRow label="PEG" value={fmtNum(fund.peg)} />
                      <KvRow label="ROE TTM" value={fmtFrac(fund.roe_ttm)} />
                      <KvRow
                        label="MARGEN BRUTO"
                        value={fmtFrac(fund.gross_margin)}
                      />
                      <KvRow
                        label="MARGEN OPERATIVO"
                        value={fmtFrac(fund.operating_margin)}
                      />
                      <KvRow
                        label="CREC. INGRESOS"
                        value={fmtFrac(fund.revenue_growth_ttm)}
                      />
                      <KvRow
                        label="FCF CAGR 5A"
                        value={fmtFrac(fund.fcf_cagr_5y)}
                      />
                      <KvRow
                        label="DEUDA/EQUITY"
                        value={fmtNum(fund.debt_to_equity)}
                      />
                      <KvRow
                        label="COBERTURA INTERESES"
                        value={
                          fund.interest_coverage != null
                            ? `${fmtNum(fund.interest_coverage)}x`
                            : "—"
                        }
                      />
                    </>
                  ) : (
                    <KvEmpty>SIN DATOS FUNDAMENTALES</KvEmpty>
                  )}
                </KvBlock>
              </div>
            </div>

            {/* Fila inferior: noticias + señales */}
            <div className="grid min-h-0 flex-[3] grid-cols-2 gap-1">
              <section className="flex min-h-0 min-w-0 flex-col border border-hair bg-crt-1">
                <header className="flex h-6 shrink-0 items-center justify-between border-b border-hair bg-crt-2 px-2">
                  <span className="text-[10px] font-semibold tracking-[0.18em] text-amber">
                    NOTICIAS DEL TICKER
                  </span>
                  <span className="text-[9px] text-faint">
                    {data.news.length}
                  </span>
                </header>
                <div className="term-scroll min-h-0 flex-1 overflow-y-auto">
                  {data.news.length === 0 ? (
                    <TermEmpty>SIN NOTICIAS PARA {symbol}</TermEmpty>
                  ) : (
                    data.news.map((n) => (
                      <a
                        key={n.url}
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex cursor-pointer items-baseline gap-2 border-b border-hair-soft px-2 py-[3px] no-underline hover:bg-crt-2"
                      >
                        <span className="w-16 shrink-0 text-[10px] text-faint">
                          {fmtRelative(n.published_at)}
                        </span>
                        <span className="w-16 shrink-0 truncate text-[9px] uppercase tracking-[0.12em] text-ghost">
                          {n.source ?? "—"}
                        </span>
                        <span className="truncate text-[11px] text-dim group-hover:text-glow">
                          {n.title}
                        </span>
                      </a>
                    ))
                  )}
                </div>
              </section>

              <section className="flex min-h-0 min-w-0 flex-col border border-hair bg-crt-1">
                <header className="flex h-6 shrink-0 items-center justify-between border-b border-hair bg-crt-2 px-2">
                  <span className="text-[10px] font-semibold tracking-[0.18em] text-amber">
                    SEÑALES DEL TICKER
                  </span>
                  <span className="text-[9px] text-faint">
                    {data.alerts.length}
                  </span>
                </header>
                <div className="term-scroll min-h-0 flex-1 overflow-y-auto">
                  {data.alerts.length === 0 ? (
                    <TermEmpty>SIN SEÑALES PARA {symbol}</TermEmpty>
                  ) : (
                    data.alerts.map((a) => (
                      <div
                        key={a.id}
                        className={`border-b border-hair-soft border-l-2 px-2 py-[3px] ${
                          SEV_BORDER[a.severity] ?? "border-l-ghost"
                        }`}
                      >
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`shrink-0 text-[9px] font-semibold tracking-[0.12em] ${
                              SEV_TEXT[a.severity] ?? "text-dim"
                            }`}
                          >
                            {SEV_LABEL[a.severity] ?? a.severity.toUpperCase()}
                          </span>
                          <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-faint">
                            {KIND_LABEL[a.kind] ?? a.kind}
                          </span>
                          <span className="min-w-0 truncate text-[11px] text-dim">
                            {a.title}
                          </span>
                          <span className="ml-auto shrink-0 text-[9px] text-faint">
                            {fmtRelative(a.created_at)}
                          </span>
                        </div>
                        {a.agent_analysis?.interpretation && (
                          <div className="mt-0.5 flex items-start gap-1.5">
                            <AiTag />
                            <p className="line-clamp-3 font-prose text-[10px] leading-snug text-dim">
                              {a.agent_analysis.interpretation}
                            </p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
