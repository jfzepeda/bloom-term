import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { UniverseItem } from "../types";
import { fmtPct } from "../format";

const NEUTRAL: [number, number, number] = [30, 36, 48]; // #1e2430
const GREEN: [number, number, number] = [34, 197, 94]; // #22c55e
const RED: [number, number, number] = [239, 68, 68]; // #ef4444
const CLAMP = 3; // +/-3%

/** Interpolación propia rojo -> neutro -> verde con clamp en +/-3%. */
export function heatColor(changePct: number | null): string {
  if (changePct == null || !isFinite(changePct)) return `rgb(${NEUTRAL.join(",")})`;
  const t = Math.max(-CLAMP, Math.min(CLAMP, changePct)) / CLAMP; // -1..1
  const target = t >= 0 ? GREEN : RED;
  const k = Math.abs(t) * 0.8; // tope de saturación para mantener el texto legible
  const mix = NEUTRAL.map((n, i) => Math.round(n + (target[i] - n) * k));
  return `rgb(${mix.join(",")})`;
}

export default function Heatmap({ items }: { items: UniverseItem[] }) {
  const navigate = useNavigate();

  // Agrupar por sector; sectores ordenados por market cap total desc.
  const groups = useMemo(() => {
    const map = new Map<string, UniverseItem[]>();
    for (const it of items) {
      const sector = it.sector ?? "Sin sector";
      const list = map.get(sector);
      if (list) list.push(it);
      else map.set(sector, [it]);
    }
    const totalCap = (list: UniverseItem[]) =>
      list.reduce((acc, it) => acc + (it.market_cap ?? 0), 0);
    return [...map.entries()].sort((a, b) => totalCap(b[1]) - totalCap(a[1]));
  }, [items]);

  return (
    <div className="heatmap">
      {groups.map(([sector, list]) => (
        <section key={sector} className="sector-group">
          <h3 className="sector-title">
            {sector} <span className="muted">({list.length})</span>
          </h3>
          <div className="heatmap-grid">
            {list.map((it) => (
              <button
                key={it.symbol}
                type="button"
                className="tile"
                style={{ background: heatColor(it.change_pct_1d) }}
                onClick={() => navigate(`/ticker/${it.symbol}`)}
                title={it.name ?? it.symbol}
              >
                <span className="tile-symbol">{it.symbol}</span>
                <span className="tile-chg">{fmtPct(it.change_pct_1d)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
