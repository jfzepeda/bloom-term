import { Loading } from "../EmptyState";
import { fmtRelative } from "../../format";
import type { AgentJobsStatusResponse } from "../../types";
import { JOB_STATUS_CLASS } from "./utils";

export function AgentsPhase({ status }: { status: AgentJobsStatusResponse | null }) {
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
