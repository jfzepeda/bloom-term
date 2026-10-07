import { useEffect, useMemo, useState } from "react";
import { getUniverse } from "../api";
import type { UniverseItem, UniverseResponse } from "../types";

// Caché a nivel de módulo compartida por todas las vistas; mientras haya
// suscriptores se refresca cada POLL_MS y notifica a todos (precios del día
// pueden actualizarse durante la sesión vía prices_latest).
const POLL_MS = 120_000;

let cache: UniverseResponse | null = null;
let pending: Promise<UniverseResponse> | null = null;
let timer: number | null = null;
const listeners = new Set<(items: UniverseItem[]) => void>();

function fetchUniverse(): Promise<UniverseResponse> {
  if (!pending) {
    pending = getUniverse()
      .then((r) => {
        cache = r;
        for (const l of listeners) l(r.items);
        return r;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

function syncTimer() {
  if (listeners.size > 0 && timer == null) {
    timer = window.setInterval(() => {
      fetchUniverse().catch(() => {}); // el poll fallido conserva la caché
    }, POLL_MS);
  } else if (listeners.size === 0 && timer != null) {
    window.clearInterval(timer);
    timer = null;
  }
}

export function useUniverse(): {
  items: UniverseItem[] | null;
  loading: boolean;
  error: string | null;
} {
  const [items, setItems] = useState<UniverseItem[] | null>(
    cache ? cache.items : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const listener = (next: UniverseItem[]) => {
      setItems(next);
      setError(null);
    };
    listeners.add(listener);
    syncTimer();
    if (cache) setItems(cache.items);
    else
      fetchUniverse().catch((e) => {
        if (listeners.has(listener))
          setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      listeners.delete(listener);
      syncTimer();
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
