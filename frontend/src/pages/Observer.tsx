import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getObserverLatest } from "../api";
import EmptyState, { Loading } from "../components/EmptyState";
import type { ObserverReport } from "../types";

export default function ObserverPage() {
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

  if (report === undefined) return <Loading />;
  if (report === null)
    return (
      <EmptyState
        title="Aún no hay reporte del observer"
        message="El observer genera un reporte diario. Puedes dispararlo con POST /api/admin/refresh/observer"
      />
    );

  return (
    <div className="screen-page">
      <div className="screen-head">
        <h2>Observer</h2>
        <span className="muted">Reporte del {report.report_date}</span>
      </div>
      <div className="panel observer-report">
        <div className="markdown">
          <ReactMarkdown>{report.markdown}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
