// Disciplina de color del terminal: ámbar = acento/atención, verde/rojo =
// dirección de mercado y severidad alta, grises cálidos = información.

export const SEV_TEXT: Record<string, string> = {
  alta: "text-down",
  media: "text-amber",
  info: "text-dim",
};

export const SEV_BORDER: Record<string, string> = {
  alta: "border-l-down",
  media: "border-l-amber",
  info: "border-l-ghost",
};

export const SEV_LABEL: Record<string, string> = {
  alta: "ALTA",
  media: "MEDIA",
  info: "INFO",
};

export const KIND_LABEL: Record<string, string> = {
  hard_drop: "CAÍDA FUERTE",
  hard_spike: "REPUNTE",
  drawdown_cross: "DRAWDOWN",
  rally_cross: "RALLY",
  technical_break: "RUPTURA TÉCNICA",
  breaking_news: "NOTICIA",
  system: "SISTEMA",
};

export const VERDICT_TEXT: Record<string, string> = {
  COMPRA: "text-up",
  VIGILAR: "text-amber",
  CARA: "text-down",
  FILTRADA: "text-faint",
  NO_VALORABLE: "text-faint",
};

export function deltaClass(v: number | null | undefined): string {
  if (v == null) return "text-faint";
  if (v > 0) return "text-up";
  if (v < 0) return "text-down";
  return "text-faint";
}

export function deltaArrow(v: number | null | undefined): string {
  if (v == null || v === 0) return "";
  return v > 0 ? "▲" : "▼";
}

// Mapa de calor divergente rojo ↔ neutro ↔ verde sobre superficie CRT.
// Punto medio neutro (crt-2) y mezcla acotada para que el texto claro
// siga siendo legible encima.
const HEAT_NEUTRAL = [25, 23, 18]; // #191712
const HEAT_UP = [47, 213, 123]; // --color-up
const HEAT_DOWN = [244, 69, 63]; // --color-down
const HEAT_CLAMP_PCT = 3;
const HEAT_MAX_MIX = 0.5;

export function heatColor(changePct: number | null | undefined): string {
  if (changePct == null) return `rgb(${HEAT_NEUTRAL.join(",")})`;
  const t =
    Math.min(Math.abs(changePct), HEAT_CLAMP_PCT) / HEAT_CLAMP_PCT;
  const mix = t * HEAT_MAX_MIX;
  const pole = changePct >= 0 ? HEAT_UP : HEAT_DOWN;
  const rgb = HEAT_NEUTRAL.map((n, i) => Math.round(n + (pole[i] - n) * mix));
  return `rgb(${rgb.join(",")})`;
}
