import { useState } from "react";
import { getAlerts } from "../../api";
import { fmtRelative, parseApiDate } from "../../format";
import { usePoll } from "./hooks";
import { AiTag, Panel, PanelTab, Stamp, TermEmpty, TermLoading } from "./Panel";
import { KIND_LABEL, SEV_BORDER, SEV_LABEL, SEV_TEXT } from "./utils";

const POLL_MS = 60_000;
const FRESH_MS = 10 * 60_000; // alertas de < 10 min llevan dot ámbar

type SevFilter = "todas" | "alta" | "media" | "info";

const FILTERS: SevFilter[] = ["todas", "alta", "media", "info"];

const FILTER_LABEL: Record<SevFilter, string> = {
  todas: "TODAS",
  alta: "ALTA",
  media: "MEDIA",
  info: "INFO",
};

function intactLabel(v: boolean | null): string {
  if (v == null) return "—";
  return v ? "SÍ" : "NO";
}

/**
 * Panel SEÑALES — feed de alertas del motor con interpretación IA inline.
 *
 * Contrato:
 * - Datos: getAlerts({ severity, limit: 60 }) con polling cada 60s;
 *   el filtro de severidad refetchea en el servidor.
 * - Filtro de severidad (TODAS/ALTA/MEDIA/INFO) en la cabecera del panel.
 * - Cada alerta: riel izquierdo por severidad, símbolo clicable → onSelect,
 *   tipo (KIND_LABEL), tiempo relativo, e interpretación IA expandible
 *   marcada con AiTag (prosa en font-prose).
 */
export function SignalsPanel({
  onSelect,
  className = "",
}: {
  onSelect: (symbol: string) => void;
  className?: string;
}) {
  const [filter, setFilter] = useState<SevFilter>("todas");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data, error } = usePoll(
    () =>
      getAlerts({
        severity: filter === "todas" ? undefined : filter,
        limit: 60,
      }),
    POLL_MS,
    [filter],
  );
  const items = data?.items ?? null;

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visible = items ?? [];

  const right = (
    <>
      {error && items != null && (
        <span className="text-[8px] font-semibold tracking-[0.14em] text-down">
          SIN CONEXIÓN
        </span>
      )}
      {FILTERS.map((f) => (
        <PanelTab key={f} active={filter === f} onClick={() => setFilter(f)}>
          {FILTER_LABEL[f]}
        </PanelTab>
      ))}
      <Stamp>{visible.length} VISIBLES</Stamp>
    </>
  );

  let body;
  if (items == null && !error) {
    body = <TermLoading />;
  } else if (items == null) {
    body = <TermEmpty>SIN CONEXIÓN — REINTENTANDO CADA 60s</TermEmpty>;
  } else if (visible.length === 0) {
    body = (
      <TermEmpty>
        {filter === "todas"
          ? "SIN SEÑALES DEL MOTOR"
          : `SIN ALERTAS ${FILTER_LABEL[filter]}`}
      </TermEmpty>
    );
  } else {
    const now = Date.now();
    body = visible.map((a) => {
      const analysis = a.agent_analysis;
      const isOpen = analysis != null && expanded.has(a.id);
      const fresh =
        a.created_at != null &&
        now - parseApiDate(a.created_at).getTime() < FRESH_MS;
      const iaLabel =
        analysis != null
          ? null
          : a.status === "skipped"
            ? "IA NO DISPONIBLE"
            : a.status !== "analyzed"
              ? "IA PENDIENTE"
              : null;
      return (
        <div
          key={a.id}
          onClick={analysis ? () => toggle(a.id) : undefined}
          role={analysis ? "button" : undefined}
          tabIndex={analysis ? 0 : undefined}
          onKeyDown={
            analysis
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    toggle(a.id);
                  }
                }
              : undefined
          }
          className={`border-b border-hair-soft border-l-2 ${
            SEV_BORDER[a.severity] ?? "border-l-ghost"
          } ${analysis ? "cursor-pointer hover:bg-crt-2" : ""}`}
        >
          <div className="flex items-baseline gap-1.5 px-2 pt-[3px]">
            <span
              className={`shrink-0 text-[9px] font-semibold tracking-[0.14em] ${
                SEV_TEXT[a.severity] ?? "text-dim"
              }`}
            >
              {SEV_LABEL[a.severity] ?? a.severity.toUpperCase()}
            </span>
            {a.symbol && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(a.symbol!);
                }}
                className="shrink-0 cursor-pointer text-[11px] font-semibold text-amber hover:text-glow"
              >
                {a.symbol}
              </button>
            )}
            <span className="truncate text-[9px] uppercase tracking-[0.12em] text-faint">
              {KIND_LABEL[a.kind] ?? a.kind.toUpperCase()}
            </span>
            {fresh && (
              <span className="h-1.5 w-1.5 shrink-0 animate-pulse self-center rounded-full bg-amber" />
            )}
            <span className="ml-auto flex shrink-0 items-baseline gap-1 text-[9px] text-faint">
              {fmtRelative(a.created_at)}
              {analysis && (
                <span className="text-ghost">{isOpen ? "▾" : "▸"}</span>
              )}
            </span>
          </div>
          <div className="px-2 pb-[3px]">
            <span className="text-[11px] leading-snug text-glow">
              {a.title}
            </span>
            {iaLabel && (
              <span className="ml-1.5 text-[9px] tracking-[0.12em] text-ghost">
                {iaLabel}
              </span>
            )}
          </div>
          {isOpen && analysis && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="cursor-auto border-t border-hair-soft bg-crt px-2 py-1.5"
            >
              <AiTag />
              <p className="mt-1 font-prose text-[11px] leading-snug text-dim">
                {analysis.interpretation}
              </p>
              {analysis.bullets.length > 0 && (
                <ul className="mt-1">
                  {analysis.bullets.map((b, i) => (
                    <li
                      key={i}
                      className="font-prose text-[11px] leading-snug text-dim"
                    >
                      · {b}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-[9px] uppercase tracking-[0.12em] text-faint">
                <span>
                  SEVERIDAD IA:{" "}
                  <span className={SEV_TEXT[analysis.severity] ?? "text-dim"}>
                    {SEV_LABEL[analysis.severity] ??
                      analysis.severity.toUpperCase()}
                  </span>
                </span>
                <span>
                  FUNDAMENTALES INTACTOS:{" "}
                  {intactLabel(analysis.fundamentals_intact)}
                </span>
              </div>
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <Panel code="SEÑ" title="Señales del motor" right={right} className={className}>
      {body}
    </Panel>
  );
}
