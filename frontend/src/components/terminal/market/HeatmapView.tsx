import { useMemo } from "react";
import { fmtPct } from "../../../format";
import type { UniverseItem } from "../../../types";
import { TermEmpty, TermLoading } from "../Panel";
import { deltaArrow, deltaClass, heatColor } from "../utils";

// MAPA: heatmap sectorial. Grupos por sector (cap total desc), tiles
// coloreados por Δ1D con heatColor y ordenados por cap dentro del grupo.

export function HeatmapView({
  items,
  loading,
  error,
  onSelect,
}: {
  items: UniverseItem[] | null;
  loading: boolean;
  error: string | null;
  onSelect: (symbol: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, UniverseItem[]>();
    for (const it of items ?? []) {
      const key = it.sector ?? "SIN SECTOR";
      const list = map.get(key);
      if (list) list.push(it);
      else map.set(key, [it]);
    }
    return [...map.entries()]
      .map(([sector, list]) => {
        const cap = list.reduce((s, it) => s + (it.market_cap ?? 0), 0);
        const withChg = list.filter((it) => it.change_pct_1d != null);
        const avg = withChg.length
          ? withChg.reduce((s, it) => s + it.change_pct_1d!, 0) / withChg.length
          : null;
        return {
          sector,
          cap,
          avg,
          list: [...list].sort(
            (a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0),
          ),
        };
      })
      .sort((a, b) => b.cap - a.cap);
  }, [items]);

  if (loading) return <TermLoading />;
  if (error) return <TermEmpty>SIN CONEXIÓN — UNIVERSO NO DISPONIBLE</TermEmpty>;
  if (!groups.length)
    return <TermEmpty>UNIVERSO VACÍO — EJECUTA EL JOB «universe»</TermEmpty>;

  return (
    <div className="px-1 pb-1">
      {groups.map((g) => (
        <div key={g.sector}>
          <div className="flex items-baseline justify-between gap-2 px-1 pb-[2px] pt-1.5">
            <span className="truncate text-[9px] uppercase tracking-[0.14em] text-faint">
              {g.sector}
            </span>
            <span className={`shrink-0 text-[9px] ${deltaClass(g.avg)}`}>
              {deltaArrow(g.avg)}
              {fmtPct(g.avg)}
            </span>
          </div>
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: "repeat(auto-fill,minmax(52px,1fr))" }}
          >
            {g.list.map((it) => (
              <button
                key={it.symbol}
                type="button"
                title={`${it.symbol} · ${it.name ?? "—"} · ${fmtPct(it.change_pct_1d)}`}
                onClick={() => onSelect(it.symbol)}
                style={{ backgroundColor: heatColor(it.change_pct_1d) }}
                className="flex cursor-pointer flex-col items-center justify-center py-[3px] hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-amber-2"
              >
                <span className="text-[9px] font-medium leading-tight text-glow">
                  {it.symbol}
                </span>
                <span className="text-[8px] leading-tight text-glow/70">
                  {fmtPct(it.change_pct_1d)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
