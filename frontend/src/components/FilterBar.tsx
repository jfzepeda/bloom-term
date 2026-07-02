import { useMemo } from "react";
import { useFilters } from "../context/FiltersContext";
import type { CapRange } from "../context/FiltersContext";
import { useUniverse } from "../hooks/useUniverse";

export default function FilterBar() {
  const { filters, setFilters } = useFilters();
  const { items } = useUniverse();

  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const it of items ?? []) {
      if (it.sector) set.add(it.sector);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [items]);

  return (
    <div className="filter-bar">
      <select
        value={filters.sector ?? ""}
        onChange={(e) => setFilters({ sector: e.target.value || null })}
        aria-label="Filtrar por sector"
      >
        <option value="">Todos los sectores</option>
        {sectors.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={filters.capRange}
        onChange={(e) => setFilters({ capRange: e.target.value as CapRange })}
        aria-label="Filtrar por capitalización"
      >
        <option value="all">Toda capitalización</option>
        <option value="mega">Mega (≥ 200B)</option>
        <option value="large">Large (10B – 200B)</option>
        <option value="mid">Mid (&lt; 10B)</option>
      </select>
      <label className="toggle">
        <input
          type="checkbox"
          checked={filters.nasdaqOnly}
          onChange={(e) => setFilters({ nasdaqOnly: e.target.checked })}
        />
        <span>Solo Nasdaq-100</span>
      </label>
    </div>
  );
}
