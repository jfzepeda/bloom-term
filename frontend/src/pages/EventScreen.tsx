import { Link } from "react-router-dom";
import { Badge } from "../components/Badge";
import EmptyState, { ErrorState, Loading } from "../components/EmptyState";
import { useScreen } from "../hooks/useScreen";
import type { EventDetails } from "../types";

const CONF_TONE: Record<string, "green" | "amber" | "gray"> = {
  alta: "green",
  high: "green",
  media: "amber",
  medium: "amber",
  baja: "gray",
  low: "gray",
};

export default function EventScreen() {
  const { data, loading, error } = useScreen("event");

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;

  const items = data?.items ?? [];
  if (items.length === 0)
    return <EmptyState title="Nivel 3 · Event" message="Aún no hay ideas del scout." />;

  return (
    <div className="screen-page">
      <div className="screen-head">
        <h2>Nivel 3 · Event (ideas del scout)</h2>
        {data?.as_of && <span className="muted">Datos a {data.as_of}</span>}
      </div>
      <div className="event-feed">
        {items.map((it, idx) => {
          const d = (it.details ?? {}) as Partial<EventDetails>;
          const confidence = (d.confidence ?? "").toLowerCase();
          return (
            <article key={idx} className="event-card panel">
              <header className="event-head">
                {d.category && <span className="chip chip-blue">{d.category}</span>}
                {d.confidence && (
                  <Badge tone={CONF_TONE[confidence] ?? "gray"}>
                    Confianza: {d.confidence}
                  </Badge>
                )}
                {d.horizon && <span className="muted event-horizon">Horizonte: {d.horizon}</span>}
              </header>
              <p className="event-thesis">{d.thesis ?? "—"}</p>
              {d.tickers && d.tickers.length > 0 && (
                <div className="chips event-tickers">
                  {d.tickers.map((t) => (
                    <Link key={t} to={`/ticker/${t}`} className="chip chip-link">
                      {t}
                    </Link>
                  ))}
                </div>
              )}
              {d.invalidation && (
                <p className="event-invalidation">
                  <em>Qué invalidaría la tesis: {d.invalidation}</em>
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
