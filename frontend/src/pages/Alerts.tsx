import { useEffect, useMemo, useState } from "react";
import { getAlerts } from "../api";
import AlertCard, { kindLabel } from "../components/AlertCard";
import EmptyState, { ErrorState, Loading } from "../components/EmptyState";
import type { AlertItem } from "../types";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState("");
  const [kind, setKind] = useState("");

  useEffect(() => {
    let alive = true;
    getAlerts({ limit: 100 })
      .then((r) => {
        if (alive) setAlerts(r.items);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const kinds = useMemo(() => {
    const set = new Set<string>();
    for (const a of alerts ?? []) set.add(a.kind);
    return [...set].sort();
  }, [alerts]);

  const filtered = useMemo(
    () =>
      (alerts ?? []).filter(
        (a) => (!severity || a.severity === severity) && (!kind || a.kind === kind),
      ),
    [alerts, severity, kind],
  );

  if (error) return <ErrorState message={error} />;
  if (alerts === null) return <Loading />;

  return (
    <div className="screen-page">
      <div className="screen-head">
        <h2>Alertas</h2>
        <div className="local-filters">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            aria-label="Filtrar por severidad"
          >
            <option value="">Toda severidad</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="info">Info</option>
          </select>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos los tipos</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="Sin alertas"
          message={
            alerts.length === 0
              ? "Sin datos aún — el worker está cargando el universo. Puedes disparar el escaneo con POST /api/admin/refresh/scan_alerts"
              : "Ninguna alerta coincide con los filtros seleccionados."
          }
        />
      ) : (
        <div className="alert-feed">
          {filtered.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}
    </div>
  );
}
