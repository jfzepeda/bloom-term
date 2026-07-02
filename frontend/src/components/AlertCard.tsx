import { Link } from "react-router-dom";
import type { AlertItem } from "../types";
import { fmtRelative } from "../format";
import { SeverityDot, severityLabel } from "./Severity";

const KIND_LABEL: Record<string, string> = {
  hard_drop: "Caída fuerte",
  hard_spike: "Subida fuerte",
  drawdown_cross: "Cruce de drawdown",
  rally_cross: "Cruce de rally",
  technical_break: "Ruptura técnica",
  breaking_news: "Noticia",
  system: "Sistema",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

function intactLabel(v: boolean | null): string {
  if (v === true) return "sí";
  if (v === false) return "no";
  return "?";
}

export default function AlertCard({ alert }: { alert: AlertItem }) {
  const a = alert.agent_analysis;
  return (
    <article className="alert-card panel">
      <header className="alert-head">
        <SeverityDot severity={alert.severity} />
        {alert.symbol && (
          <Link to={`/ticker/${alert.symbol}`} className="alert-symbol">
            {alert.symbol}
          </Link>
        )}
        <span className="alert-title">{alert.title}</span>
        <span className="chip chip-dim">{kindLabel(alert.kind)}</span>
        <time className="alert-time muted">{fmtRelative(alert.created_at)}</time>
      </header>
      {a ? (
        <div className="alert-body">
          {a.bullets && a.bullets.length > 0 && (
            <div className="alert-why">
              <h4>Por qué</h4>
              <ul>
                {a.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {a.interpretation && (
            <div className="interpretation">
              <h4>Interpretación</h4>
              <p>{a.interpretation}</p>
            </div>
          )}
          <footer className="alert-foot muted">
            Severidad: {severityLabel(a.severity ?? alert.severity)} · Fundamentales intactos:{" "}
            {intactLabel(a.fundamentals_intact)}
          </footer>
        </div>
      ) : (
        <p className="alert-pending muted">Análisis del agente pendiente…</p>
      )}
    </article>
  );
}

/** Mini-card para el panel lateral del Overview. */
export function MiniAlertCard({ alert }: { alert: AlertItem }) {
  return (
    <Link className="mini-card" to={alert.symbol ? `/ticker/${alert.symbol}` : "/alerts"}>
      <div className="mini-head">
        <SeverityDot severity={alert.severity} />
        <span className="mini-time muted">{fmtRelative(alert.created_at)}</span>
      </div>
      <span className="mini-title">{alert.title}</span>
    </Link>
  );
}
