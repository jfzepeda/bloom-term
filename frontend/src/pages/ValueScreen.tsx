import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AssumptionsGrid, { FiltersPassed } from "../components/Assumptions";
import { VerdictBadge } from "../components/Badge";
import EmptyState, { ErrorState, Loading } from "../components/EmptyState";
import { symbolMatchesFilters, useFilters } from "../context/FiltersContext";
import { fmtMoney, fmtPct, pctClass } from "../format";
import { useScreen } from "../hooks/useScreen";
import { useUniverseMap } from "../hooks/useUniverse";
import type { ScreenItem } from "../types";

function upsideOf(it: ScreenItem): number | null {
  const u = it.details?.upside_pct;
  if (typeof u === "number") return u;
  return typeof it.score === "number" ? it.score : null;
}

export default function ValueScreen() {
  const { data, loading, error } = useScreen("value");
  const { filters } = useFilters();
  const universeMap = useUniverseMap();
  const [open, setOpen] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const items = (data?.items ?? []).filter((it) =>
      symbolMatchesFilters(it.symbol, it.sector, filters, universeMap),
    );
    return [...items].sort((a, b) => (upsideOf(b) ?? -1e12) - (upsideOf(a) ?? -1e12));
  }, [data, filters, universeMap]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (rows.length === 0)
    return (
      <EmptyState
        title="Nivel 1 · Value sin resultados"
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
        <h2>Nivel 1 · Value (DCF conservador)</h2>
        {data?.as_of && <span className="muted">Datos a {data.as_of}</span>}
      </div>
      <div className="table-wrap panel">
        <table className="table">
          <thead>
            <tr>
              <th className="th-caret" aria-label="Expandir" />
              <th>Símbolo</th>
              <th>Nombre</th>
              <th>Sector</th>
              <th className="num">Precio</th>
              <th className="num">Valor intrínseco</th>
              <th className="num">Upside</th>
              <th>Veredicto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => {
              const d = it.details ?? {};
              const symbol = it.symbol ?? "";
              const upside = upsideOf(it);
              const expanded = open.has(symbol);
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
                    <td>
                      <Link to={`/ticker/${symbol}`} className="sym-link">
                        {symbol}
                      </Link>
                    </td>
                    <td className="cell-name">{it.name ?? "—"}</td>
                    <td className="muted">{it.sector ?? "—"}</td>
                    <td className="num">{fmtMoney(d.price_at_calc)}</td>
                    <td className="num">{fmtMoney(d.intrinsic_value)}</td>
                    <td className={`num ${pctClass(upside)}`}>{fmtPct(upside)}</td>
                    <td>
                      <VerdictBadge verdict={d.verdict} />
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="expand-row">
                      <td colSpan={8}>
                        <div className="expand-body">
                          <h4>Supuestos del DCF</h4>
                          <AssumptionsGrid assumptions={d.assumptions ?? d} />
                          <FiltersPassed details={d} />
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
