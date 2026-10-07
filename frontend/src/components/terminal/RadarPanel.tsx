import { useScreen } from "../../hooks/useScreen";
import type { EventDetails } from "../../types";
import { AiTag, Panel, Stamp, TermEmpty, TermLoading } from "./Panel";

// Escala neutra: la confianza no es dirección de mercado (verde/rojo
// reservados) ni severidad; ámbar = máxima atención.
const CONF_TEXT: Record<string, string> = {
  alta: "text-amber",
  media: "text-dim",
  baja: "text-faint",
};

const CONF_FILL: Record<string, string> = {
  alta: "bg-amber",
  media: "bg-dim",
  baja: "bg-faint",
};

const CONF_SEGMENTS: Record<string, number> = {
  alta: 3,
  media: 2,
  baja: 1,
};

// Barra de confianza: 3 segmentos, rellenos según nivel.
function ConfBar({ confidence }: { confidence: string }) {
  const filled = CONF_SEGMENTS[confidence] ?? 0;
  const fill = CONF_FILL[confidence] ?? "bg-faint";
  return (
    <span className="flex items-center gap-px">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-[3px] w-2 ${i < filled ? fill : "bg-crt-3"}`}
        />
      ))}
    </span>
  );
}

export function RadarPanel({
  onSelect,
  className = "",
}: {
  onSelect: (symbol: string) => void;
  className?: string;
}) {
  const { data, loading, error } = useScreen("event");

  const ideas = (data?.items ?? [])
    .map((it) => ({
      rank: it.rank ?? 999,
      details: it.details as EventDetails | null,
    }))
    .filter((it): it is { rank: number; details: EventDetails } =>
      Boolean(it.details?.thesis),
    )
    .sort((a, b) => a.rank - b.rank);

  return (
    <Panel
      code="RAD"
      title="Radar de eventos"
      className={className}
      right={
        <>
          <AiTag />
          {data?.as_of && <Stamp>AL {data.as_of}</Stamp>}
        </>
      }
    >
      {loading && <TermLoading />}
      {error && <TermEmpty>SIN CONEXIÓN CON LA API</TermEmpty>}
      {data && ideas.length === 0 && (
        <TermEmpty>SIN IDEAS DEL EVENT SCOUT HOY</TermEmpty>
      )}
      {ideas.map(({ details: d }, i) => {
        const conf = (d.confidence ?? "").toLowerCase();
        return (
          <article key={i} className="border-b border-hair-soft px-2 py-2">
            <div className="flex items-center gap-2">
              <span className="truncate text-[9px] uppercase tracking-[0.14em] text-faint">
                {d.category}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <ConfBar confidence={conf} />
                <span
                  className={`text-[9px] uppercase tracking-[0.12em] ${
                    CONF_TEXT[conf] ?? "text-faint"
                  }`}
                >
                  {conf || "—"}
                </span>
              </span>
              {d.horizon && (
                <span className="ml-auto shrink-0 text-[9px] uppercase tracking-[0.12em] text-ghost">
                  {d.horizon}
                </span>
              )}
            </div>
            <p className="mt-1 font-prose text-[11px] leading-snug text-dim">
              {d.thesis}
            </p>
            {d.tickers && d.tickers.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {d.tickers.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onSelect(t)}
                    className="cursor-pointer border border-hair px-1 py-px text-[10px] text-amber hover:border-hair-strong hover:bg-crt-2"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            {d.invalidation && (
              <div className="mt-1.5">
                <span className="text-[9px] uppercase tracking-[0.14em] text-ghost">
                  Invalida si:{" "}
                </span>
                <span className="text-[10px] text-faint">{d.invalidation}</span>
              </div>
            )}
          </article>
        );
      })}
    </Panel>
  );
}
