import { useEffect, useMemo, useState } from "react";
import { getUniverse } from "../api";
import type { UniverseItem, UniverseResponse } from "../types";

// Caché a nivel de módulo: el universo completo se carga UNA sola vez
// y todas las vistas filtran en memoria.
let cache: UniverseResponse | null = null;
let pending: Promise<UniverseResponse> | null = null;

function loadUniverse(): Promise<UniverseResponse> {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = getUniverse()
      .then((r) => {
        cache = r;
        return r;
      })
      .catch((e) => {
        pending = null; // permite reintentar en la próxima montada
        throw e;
      });
  }
  return pending;
}

export function useUniverse(): {
  items: UniverseItem[] | null;
  loading: boolean;
  error: string | null;
} {
  const [items, setItems] = useState<UniverseItem[] | null>(cache ? cache.items : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadUniverse()
      .then((r) => {
        if (alive) setItems(r.items);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  return { items, loading: items === null && error === null, error };
}

/** Mapa symbol -> item del universo, para resolver cap/Nasdaq en los screens. */
export function useUniverseMap(): Map<string, UniverseItem> {
  const { items } = useUniverse();
  return useMemo(() => {
    const map = new Map<string, UniverseItem>();
    for (const it of items ?? []) map.set(it.symbol, it);
    return map;
  }, [items]);
}
