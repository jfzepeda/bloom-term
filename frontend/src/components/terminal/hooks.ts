import { useEffect, useRef, useState } from "react";

/**
 * Polling con guard de desmontaje. `data` empieza undefined (cargando);
 * un poll fallido activa `error` sin descartar los datos previos.
 * `deps` reinicia el ciclo (refetch inmediato), p.ej. al cambiar un filtro.
 */
export function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  deps: unknown[] = [],
): { data: T | undefined; error: boolean } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetcherRef
        .current()
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError(false);
        })
        .catch(() => {
          if (alive) setError(true);
        });
    void load();
    const id = window.setInterval(load, intervalMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);

  return { data, error };
}

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export type MarketPhase = "pre" | "open" | "post" | "closed";

export interface NyClock {
  hhmmss: string;
  phase: MarketPhase;
  phaseLabel: string;
  dateLabel: string;
}

const NY_TZ = "America/New_York";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("es-ES", {
  timeZone: NY_TZ,
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const weekdayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  weekday: "short",
});

const PHASE_LABEL: Record<MarketPhase, string> = {
  pre: "PRE-MARKET",
  open: "ABIERTO",
  post: "POST-MARKET",
  closed: "CERRADO",
};

export function nyClock(now: Date): NyClock {
  const hhmmss = timeFmt.format(now).replace(/^24/, "00");
  const [h, m] = hhmmss.split(":").map(Number);
  const minutes = h * 60 + m;
  const weekday = weekdayFmt.format(now);
  const isWeekend = weekday === "Sat" || weekday === "Sun";

  let phase: MarketPhase = "closed";
  if (!isWeekend) {
    if (minutes >= 240 && minutes < 570) phase = "pre";
    else if (minutes >= 570 && minutes < 960) phase = "open";
    else if (minutes >= 960 && minutes < 1200) phase = "post";
  }

  return {
    hhmmss,
    phase,
    phaseLabel: PHASE_LABEL[phase],
    dateLabel: dateFmt.format(now).replace(/[.,]/g, "").toUpperCase(),
  };
}
