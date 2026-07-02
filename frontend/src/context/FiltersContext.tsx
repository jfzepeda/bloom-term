import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { UniverseItem } from "../types";

export type CapRange = "all" | "mega" | "large" | "mid";

export interface Filters {
  sector: string | null;
  capRange: CapRange;
  nasdaqOnly: boolean;
}

const DEFAULT_FILTERS: Filters = { sector: null, capRange: "all", nasdaqOnly: false };
const STORAGE_KEY = "ms-filters";
const CAP_RANGES: CapRange[] = ["all", "mega", "large", "mid"];

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const p = JSON.parse(raw);
    return {
      sector: typeof p.sector === "string" && p.sector ? p.sector : null,
      capRange: CAP_RANGES.includes(p.capRange) ? p.capRange : "all",
      nasdaqOnly: p.nasdaqOnly === true,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

interface FiltersContextValue {
  filters: Filters;
  setFilters: (patch: Partial<Filters>) => void;
}

const FiltersCtx = createContext<FiltersContextValue>({
  filters: DEFAULT_FILTERS,
  setFilters: () => {},
});

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setState] = useState<Filters>(loadFilters);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // sin localStorage (modo privado): seguimos en memoria
    }
  }, [filters]);

  const setFilters = useCallback((patch: Partial<Filters>) => {
    setState((f) => ({ ...f, ...patch }));
  }, []);

  return <FiltersCtx.Provider value={{ filters, setFilters }}>{children}</FiltersCtx.Provider>;
}

export function useFilters(): FiltersContextValue {
  return useContext(FiltersCtx);
}

/** mega >= 200e9; large 10e9–200e9; mid < 10e9. */
export function capInRange(cap: number, range: CapRange): boolean {
  if (range === "mega") return cap >= 200e9;
  if (range === "large") return cap >= 10e9 && cap < 200e9;
  if (range === "mid") return cap < 10e9;
  return true;
}

export function matchesUniverseFilters(item: UniverseItem, f: Filters): boolean {
  if (f.sector && item.sector !== f.sector) return false;
  if (f.nasdaqOnly && !item.is_nasdaq100) return false;
  if (f.capRange !== "all") {
    if (item.market_cap == null) return false;
    if (!capInRange(item.market_cap, f.capRange)) return false;
  }
  return true;
}

/**
 * Filtro para filas de screens (que solo traen symbol/sector): cap y Nasdaq
 * se resuelven contra el universo. Si el universo aún no cargó (mapa vacío),
 * solo se aplica el filtro de sector para no vaciar la tabla mientras carga.
 */
export function symbolMatchesFilters(
  symbol: string | null,
  sector: string | null | undefined,
  f: Filters,
  universe: Map<string, UniverseItem>,
): boolean {
  const u = symbol ? universe.get(symbol) : undefined;
  if (f.sector) {
    const s = sector ?? u?.sector ?? null;
    if (s !== f.sector) return false;
  }
  if (universe.size === 0) return true;
  if (f.nasdaqOnly && !u?.is_nasdaq100) return false;
  if (f.capRange !== "all") {
    if (!u || u.market_cap == null) return false;
    if (!capInRange(u.market_cap, f.capRange)) return false;
  }
  return true;
}
