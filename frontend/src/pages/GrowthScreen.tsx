import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import EmptyState, { ErrorState, Loading } from "../components/EmptyState";
import ScoreBar from "../components/ScoreBar";
import { symbolMatchesFilters, useFilters } from "../context/FiltersContext";
import { fmtFrac, fmtNum } from "../format";
import { useScreen } from "../hooks/useScreen";
import { useUniverseMap } from "../hooks/useUniverse";

/** Componentes que emite el backend en details (claves en español, shape {valor, puntos}). */
const COMPONENT_META: Record<string, { label: string; format: (v: number) => string }> = {
  crecimiento: { label: "Crecimiento ingresos TTM", format: (v) => fmtFrac(v) },
  rule_of_40: { label: "Rule of 40", format: (v) => fmtNum(v) },
  margen_bruto: { label: "Margen bruto", format: (v) => fmtFrac(v) },
  peg: { label: "PEG", format: (v) => fmtNum(v, 2) },
  momentum: { label: "Momentum 6m vs S&P", format: (v) => fmtFrac(v) },
  aceleracion: { label: "Aceleración", format: (v) => fmtFrac(v) },
};

function componentsOf(details: Record<string, any> | null): [string, unknown][] {
  if (!details) return [];
  return Object.entries(COMPONENT_META)
    .filter(([key]) => details[key] != null)
    .map(([key, meta]) => [meta.label, { ...details[key], _key: key }]);
}

function renderComponentValue(v: unknown): string {
  if (typeof v === "number") return fmtNum(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const key = typeof o._key === "string" ? o._key : "";
    const valor = o.valor ?? o.value;
    const puntos = o.puntos ?? o.points ?? o.score;
    const parts: string[] = [];
    if (typeof valor === "number") {
      const fmt = COMPONENT_META[key]?.format ?? ((x: number) => fmtNum(x));
      parts.push(fmt(valor));
    } else if (valor != null) {
      parts.push(String(valor));
    }
    if (typeof puntos === "number") parts.push(`${fmtNum(puntos)} pts`);
    if (typeof o.flag === "string") parts.push(o.flag);
    if (parts.length > 0) return parts.join(" · ");
    return JSON.stringify(v);
  }
  return v == null ? "—" : String(v);
}

function labelsOf(details: Record<string, any> | null): string[] {
  const l = details?.labels ?? details?.tags ?? null;
  if (Array.isArray(l)) return l.map(String);
  return [];
}

export default function GrowthScreen() {
  const { data, loading, error } = useScreen("growth");
  const { filters } = useFilters();
  const universeMap = useUniverseMap();
  const [open, setOpen] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const items = (data?.items ?? []).filter((it) =>
      symbolMatchesFilters(it.symbol, it.sector, filters, universeMap),
    );
    return [...items].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  }, [data, filters, universeMap]);

  const maxScore = useMemo(
    () => Math.max(...rows.map((r) => r.score ?? 0), 1),
    [rows],
  );

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (rows.length === 0)
    return (
      <EmptyState
        title="Nivel 2 · Growth sin resultados"
        message={
          (data?.items.length ?? 0) > 0
            ? "Ningún resultado coincide con los filtros globales seleccionados."
            : "Sin datos aún — el worker está cargando el universo. Puedes disparar la ingestión con POST /api/admin/refresh/screens"
        }
      />
    );

  const toggle = (symbol: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  return (
    <div className="screen-page">
      <div className="screen-head">
        <h2>Nivel 2 · Growth (ranking por score)</h2>
        {data?.as_of && <span className="muted">Datos a {data.as_of}</span>}
      </div>
      <div className="table-wrap panel">
        <table className="table">
          <thead>
            <tr>
              <th className="th-caret" aria-label="Expandir" />
              <th className="num">#</th>
              <th>Símbolo</th>
              <th>Nombre</th>
              <th className="th-score">Score</th>
              <th>Etiquetas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => {
              const symbol = it.symbol ?? "";
              const expanded = open.has(symbol);
              const breakdown = componentsOf(it.details);
              const labels = labelsOf(it.details);
              return (
                <Fragment key={symbol || it.rank}>
                  <tr>
                    <td className="th-caret">
                      <button
                        type="button"
                        className="caret"
                        onClick={() => toggle(symbol)}
                        aria-expanded={expanded}
                        aria-label={expanded ? "Contraer fila" : "Expandir fila"}
                      >
                        {expanded ? "▾" : "▸"}
                      </button>
                    </td>
                    <td className="num muted">{it.rank ?? "—"}</td>
                    <td>
                      <Link to={`/ticker/${symbol}`} className="sym-link">
                        {symbol}
                      </Link>
                    </td>
                    <td className="cell-name">{it.name ?? "—"}</td>
                    <td>
                      <ScoreBar value={it.score} max={maxScore} />
                    </td>
                    <td>
                      <div className="chips">
                        {labels.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          labels.map((l) => (
                            <span key={l} className="chip chip-dim">
                              {l}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="expand-row">
                      <td colSpan={6}>
                        <div className="expand-body">
                          <h4>Desglose por componente</h4>
                          {breakdown.length === 0 ? (
                            <p className="muted">Sin desglose disponible.</p>
                          ) : (
                            <div className="kv-grid">
                              {breakdown.map(([name, value]) => (
                                <div className="kv" key={name}>
                                  <span className="kv-key">{name}</span>
                                  <span className="kv-val">{renderComponentValue(value)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
