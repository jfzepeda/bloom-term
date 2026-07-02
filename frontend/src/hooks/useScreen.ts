import { useEffect, useState } from "react";
import { getScreen } from "../api";
import type { ScreenLevel, ScreenResponse } from "../types";

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
    getScreen(level)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [level]);

  return { data, loading: data === null && error === null, error };
}
