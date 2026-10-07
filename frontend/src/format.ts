// Helpers de formateo. Convención: "—" para valores nulos.

/** Market cap / importes grandes: 1.2T, 340B, 15B, 850M. */
export function fmtCap(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e10) return `${sign}${Math.round(abs / 1e9)}B`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${Math.round(abs / 1e6)}M`;
  return `${sign}${abs.toLocaleString("es")}`;
}

/** Porcentaje ya expresado en puntos (-35.2 -> "-35.2%"), con signo. */
export function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null || !isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(decimals)}%`;
}

/** Clase CSS de color para un porcentaje. */
export function pctClass(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "muted";
  if (v > 0) return "pos";
  if (v < 0) return "neg";
  return "muted";
}

/** Fracción (0.15) -> "15.0%". El contrato garantiza fracción; siempre ×100. */
export function fmtFrac(v: number | null | undefined, decimals = 1): string {
  if (v == null || !isFinite(v)) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
}

export function fmtMoney(v: number | null | undefined, decimals = 2): string {
  if (v == null || !isFinite(v)) return "—";
  return `$${v.toFixed(decimals)}`;
}

export function fmtNum(v: number | null | undefined, decimals = 1): string {
  if (v == null || !isFinite(v)) return "—";
  return v.toFixed(decimals);
}

/** El backend serializa datetimes naive en UTC (sin sufijo de zona); si el
 * ISO no trae zona horaria se interpreta como UTC para no desplazar tiempos. */
export function parseApiDate(iso: string): Date {
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasTz || !iso.includes("T") ? iso : `${iso}Z`);
}

/** Fecha relativa simple: "hace 2 h", "hace 5 min", "hace 3 d". */
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseApiDate(iso);
  if (isNaN(d.getTime())) return "—";
  const secs = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (secs < 60) return "hace un momento";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

/** Fecha local de hoy en "YYYY-MM-DD". */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
