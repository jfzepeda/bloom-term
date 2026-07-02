import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAlerts, getObserverLatest } from "../api";
import { MiniAlertCard } from "../components/AlertCard";
import EmptyState, { ErrorState, Loading } from "../components/EmptyState";
import Heatmap from "../components/Heatmap";
import { matchesUniverseFilters, useFilters } from "../context/FiltersContext";
import { todayISO } from "../format";
import { useUniverse } from "../hooks/useUniverse";
import type { AlertItem, ObserverReport } from "../types";

export default function Overview() {
  const { items, loading, error } = useUniverse();
  const { filters } = useFilters();

  const filtered = useMemo(
    () => (items ?? []).filter((i) => matchesUniverseFilters(i, filters)),
    [items, filters],
  );

  return (
    <div className="overview">
      <section className="overview-main">
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <Heatmap items={filtered} />
        )}
      </section>
      <aside className="side-panel">
        <TodayAlerts />
        <ObserverSummary />
      </aside>
    </div>
  );
}

function TodayAlerts() {
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getAlerts({ since: todayISO(), limit: 10 })
      .then((r) => {
        if (alive) setAlerts(r.items);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="panel side-block">
      <h3 className="side-title">Alertas de hoy</h3>
      {failed ? (
        <p className="muted">No se pudieron cargar las alertas.</p>
      ) : alerts === null ? (
        <Loading />
      ) : alerts.length === 0 ? (
        <p className="muted">Sin alertas hoy.</p>
      ) : (
        <div className="mini-list">
          {alerts.slice(0, 10).map((a) => (
            <MiniAlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}
      <Link to="/alerts" className="side-link">
        Ver todas las alertas →
      </Link>
    </div>
  );
}

function firstLines(markdown: string, maxChars = 300): string {
  const lines = markdown
    .split("\n")
    .map((l) =>
      l
        .replace(/^#+\s*/, "")
        .replace(/[*_`>]/g, "")
        .trim(),
    )
    .filter(Boolean);
  const text = lines.slice(0, 4).join(" · ");
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function ObserverSummary() {
  // undefined = cargando, null = sin reporte
  const [report, setReport] = useState<ObserverReport | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getObserverLatest()
      .then((r) => {
        if (alive) setReport(r);
      })
      .catch(() => {
        if (alive) setReport(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="panel side-block">
      <h3 className="side-title">Observer</h3>
      {report === undefined ? (
        <Loading />
      ) : report === null ? (
        <p className="muted">Aún no hay reporte del observer.</p>
      ) : (
        <>
          <p className="muted side-date">Reporte del {report.report_date}</p>
          <p className="observer-summary">{firstLines(report.markdown)}</p>
        </>
      )}
      <Link to="/observer" className="side-link">
        Ver reporte completo →
      </Link>
    </div>
  );
}
