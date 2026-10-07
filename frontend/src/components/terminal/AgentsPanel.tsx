import { getAgentJobsStatus } from "../../api";
import { fmtRelative } from "../../format";
import { usePoll } from "./hooks";
import { Panel, TermEmpty, TermLoading } from "./Panel";

const POLL_MS = 15_000;
const POLL_SECS = POLL_MS / 1000;

const JOB_KIND_LABEL: Record<string, string> = {
  research: "RESEARCH",
  event_scout: "EVENT SCOUT",
  observer: "OBSERVER",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "EN COLA",
  running: "ACTIVO",
  done: "OK",
  error: "ERROR",
  skipped: "OMITIDO",
};

const STATUS_TEXT: Record<string, string> = {
  pending: "text-dim",
  running: "text-amber animate-pulse",
  done: "text-up",
  error: "text-down",
  skipped: "text-ghost",
};

function CountCell({
  value,
  label,
  valueClass,
  dot = false,
}: {
  value: number;
  label: string;
  valueClass: string;
  dot?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-px px-1 py-1.5">
      <span
        className={`flex items-center gap-1 text-[14px] leading-none ${valueClass}`}
      >
        {dot && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" />
        )}
        {value}
      </span>
      <span className="text-[8px] uppercase tracking-[0.14em] text-faint">
        {label}
      </span>
    </div>
  );
}

export function AgentsPanel({
  onSelect,
  className = "",
}: {
  onSelect: (symbol: string) => void;
  className?: string;
}) {
  const { data, error } = usePoll(() => getAgentJobsStatus(), POLL_MS);

  const c = data?.counts;

  return (
    <Panel
      code="AGN"
      title="Agentes IA"
      className={className}
      right={
        error && data ? (
          <span className="text-[8px] font-semibold tracking-[0.14em] text-down">
            SIN CONEXIÓN
          </span>
        ) : undefined
      }
    >
      {!data && !error && <TermLoading />}
      {!data && error && (
        <TermEmpty>SIN CONEXIÓN — REINTENTANDO CADA {POLL_SECS}s</TermEmpty>
      )}
      {data && c && (
        <>
          <div className="border-b border-hair-soft px-2 py-[5px] text-[9px] tracking-[0.14em] text-faint">
            INGESTA <span className="text-ghost">▸</span> ANÁLISIS{" "}
            <span className="text-ghost">▸</span> ALERTAS{" "}
            <span className="text-ghost">▸</span>{" "}
            <span className="text-amber">AGENTES IA</span>
          </div>
          <div className="grid grid-cols-5 border-b border-hair-soft">
            <CountCell
              value={c.pending}
              label="En cola"
              valueClass={c.pending > 0 ? "text-amber" : "text-dim"}
            />
            <CountCell
              value={c.running}
              label="Activos"
              valueClass={c.running > 0 ? "text-up" : "text-dim"}
              dot={c.running > 0}
            />
            <CountCell value={c.done} label="OK" valueClass="text-dim" />
            <CountCell
              value={c.error}
              label="Error"
              valueClass={c.error > 0 ? "text-down" : "text-dim"}
            />
            <CountCell
              value={c.skipped}
              label="Omitidos"
              valueClass="text-faint"
            />
          </div>
          <div className="px-2 pb-1 pt-1.5 text-[9px] uppercase tracking-[0.16em] text-faint">
            Últimos jobs
          </div>
          {data.recent.length === 0 && (
            <div className="px-2 py-3 text-center text-[10px] tracking-wider text-faint">
              SIN JOBS RECIENTES
            </div>
          )}
          {data.recent.map((j) => (
            <div
              key={j.id}
              className="flex items-center gap-2 border-b border-hair-soft px-2 py-[3px] hover:bg-crt-2"
            >
              <span className="w-[84px] shrink-0 truncate text-[9px] uppercase tracking-[0.12em] text-faint">
                {JOB_KIND_LABEL[j.kind] ?? j.kind.replace(/_/g, " ")}
              </span>
              {j.symbol ? (
                <button
                  type="button"
                  onClick={() => onSelect(j.symbol!)}
                  className="shrink-0 cursor-pointer text-[10px] font-semibold text-amber hover:text-glow"
                >
                  {j.symbol}
                </button>
              ) : (
                <span className="shrink-0 text-[10px] text-ghost">—</span>
              )}
              <span
                className={`ml-auto shrink-0 text-[9px] uppercase tracking-[0.12em] ${
                  STATUS_TEXT[j.status] ?? "text-dim"
                }`}
              >
                {STATUS_LABEL[j.status] ?? j.status}
              </span>
              <span className="shrink-0 text-[9px] text-ghost">
                {fmtRelative(j.updated_at)}
              </span>
            </div>
          ))}
        </>
      )}
    </Panel>
  );
}
