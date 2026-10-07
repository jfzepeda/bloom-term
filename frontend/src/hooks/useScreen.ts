import { useEffect, useState } from "react";
import { getScreen } from "../api";
import type { ScreenLevel, ScreenResponse } from "../types";

// Los screens se recalculan en batch (a lo sumo unas veces al día); un poll
// lento recoge refrescos manuales sin coste apreciable.
const POLL_MS = 300_000;

export function useScreen(level: ScreenLevel): {
  data: ScreenResponse | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<ScreenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    const load = () =>
      getScreen(level)
        .then((r) => {
          if (alive) {
            setData(r);
            setError(null);
          }
        })
        .catch((e) => {
          if (alive) setError(e instanceof Error ? e.message : String(e));
        });
    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [level]);

  return { data, loading: data === null && error === null, error };
}
