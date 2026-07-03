const ACCENT_PALETTE = [
  "var(--blue)",
  "var(--green)",
  "var(--amber)",
  "var(--red)",
];

export function accentFor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++)
    hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

export function severityColor(severity: string): string {
  if (severity === "alta") return "var(--red)";
  if (severity === "media") return "var(--amber)";
  return "var(--blue)";
}

export const JOB_STATUS_CLASS: Record<string, string> = {
  done: "pos",
  error: "neg",
  running: "kiosk-status-running",
  pending: "muted",
  skipped: "muted",
};

export function toPoints(values: number[], w: number, h: number): string {
  if (values.length === 0) return "";
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
