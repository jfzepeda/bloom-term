import ReactMarkdown, { type Components } from "react-markdown";
import { ApiError, getObserverLatest } from "../../api";
import type { ObserverReport } from "../../types";
import { usePoll } from "./hooks";
import { AiTag, Panel, Stamp, TermEmpty, TermLoading } from "./Panel";

const POLL_MS = 10 * 60 * 1000; // 10 min
const POLL_SECS = POLL_MS / 1000;

interface ObserverRec {
  nivel: "value" | "growth" | "event";
  symbol: string;
  accion: "comprar" | "vigilar" | "evitar";
  razon: string;
}

const NIVEL_TAG: Record<string, string> = {
  value: "N1",
  growth: "N2",
  event: "N3",
};

const ACCION_TEXT: Record<string, string> = {
  comprar: "text-up",
  vigilar: "text-amber",
  evitar: "text-down",
};

// Estilos de markdown inline: la prosa del agente va en font-prose/text-dim,
// las jerarquías vuelven al registro del terminal (glow + uppercase).
const MD_COMPONENTS: Components = {
  h1: ({ node, ...props }) => (
    <h1
      className="mb-1 mt-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-glow first:mt-0"
      {...props}
    />
  ),
  h2: ({ node, ...props }) => (
    <h2
      className="mb-1 mt-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-glow first:mt-0"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3
      className="mb-1 mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-glow first:mt-0"
      {...props}
    />
  ),
  p: ({ node, ...props }) => <p className="mb-1.5 last:mb-0" {...props} />,
  strong: ({ node, ...props }) => (
    <strong className="font-semibold text-glow" {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul className="mb-1.5 list-none space-y-0.5" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="mb-1.5 list-none space-y-0.5" {...props} />
  ),
  li: ({ node, children, ...props }) => (
    <li className="flex gap-1.5" {...props}>
      <span className="shrink-0 text-faint">·</span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="mb-1.5 border-l-2 border-l-amber-2 pl-2 italic text-faint"
      {...props}
    />
  ),
  a: ({ node, ...props }) => (
    <a className="text-amber underline hover:text-glow" {...props} />
  ),
  hr: ({ node, ...props }) => (
    <hr className="my-2 border-hair-soft" {...props} />
  ),
};

export function ObserverPanel({
  onSelect,
  className = "",
}: {
  onSelect: (symbol: string) => void;
  className?: string;
}) {
  // 404 (sin reporte) se mapea a null; undefined = cargando; error = red.
  const { data: report, error } = usePoll<ObserverReport | null>(
    () =>
      getObserverLatest().catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    POLL_MS,
  );

  const recs = ((report?.recommendations ?? []) as ObserverRec[]).filter(
    (r) => r && r.symbol,
  );
  const markdown = report?.markdown ?? null;

  return (
    <Panel
      code="OBS"
      title="Observer IA"
      className={className}
      right={
        <>
          {error && report !== undefined && (
            <span className="text-[8px] font-semibold tracking-[0.14em] text-down">
              SIN CONEXIÓN
            </span>
          )}
          <AiTag />
          {report && <Stamp>AL {report.report_date}</Stamp>}
        </>
      }
    >
      {report === undefined && !error && <TermLoading />}
      {report === undefined && error && (
        <TermEmpty>SIN CONEXIÓN — REINTENTANDO CADA {POLL_SECS}s</TermEmpty>
      )}
      {report === null && (
        <TermEmpty>SIN REPORTE DEL OBSERVER TODAVÍA</TermEmpty>
      )}
      {report && recs.length === 0 && !markdown && (
        <TermEmpty>SIN REPORTE DEL OBSERVER TODAVÍA</TermEmpty>
      )}
      {report && (recs.length > 0 || markdown) && (
        <>
          {recs.map((r, i) => (
            <div
              key={`${r.symbol}-${i}`}
              className="flex items-center gap-2 border-b border-hair-soft px-2 py-[3px] hover:bg-crt-2"
            >
              <span className="shrink-0 border border-hair px-1 text-[9px] text-faint">
                {NIVEL_TAG[r.nivel] ?? "N·"}
              </span>
              <button
                type="button"
                onClick={() => onSelect(r.symbol)}
                className="shrink-0 cursor-pointer text-[11px] font-semibold text-amber hover:text-glow"
              >
                {r.symbol}
              </button>
              <span
                className={`shrink-0 text-[10px] uppercase tracking-[0.12em] ${
                  ACCION_TEXT[r.accion] ?? "text-dim"
                }`}
              >
                {r.accion}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-prose text-[10px] text-dim"
                title={r.razon}
              >
                {r.razon}
              </span>
            </div>
          ))}
          {markdown && (
            <div
              className={recs.length > 0 ? "border-t border-hair" : undefined}
            >
              <div className="px-2 pb-1 pt-2 text-[9px] uppercase tracking-[0.16em] text-faint">
                Nota matinal
              </div>
              <div className="px-2 pb-2 font-prose text-[11px] leading-relaxed text-dim">
                <ReactMarkdown components={MD_COMPONENTS}>
                  {markdown}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
