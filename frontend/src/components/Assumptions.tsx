import { fmtCap, fmtFrac } from "../format";

const LABELS: Record<string, { label: string; kind: "money" | "rate" | "count" }> = {
  fcf_base: { label: "FCF base", kind: "money" },
  growth_initial: { label: "Crecimiento inicial", kind: "rate" },
  discount_rate: { label: "Tasa de descuento", kind: "rate" },
  terminal_growth: { label: "Crecimiento terminal", kind: "rate" },
  net_debt: { label: "Deuda neta", kind: "money" },
  shares_diluted: { label: "Acciones diluidas", kind: "count" },
};

function fmtAssumption(kind: "money" | "rate" | "count", v: unknown): string {
  if (typeof v !== "number" || !isFinite(v)) return v == null ? "—" : String(v);
  if (kind === "money") return `$${fmtCap(v)}`;
  if (kind === "rate") return fmtFrac(v);
  return fmtCap(v);
}

/** Grid de supuestos clave del DCF (fcf_base, growth_initial, …). */
export default function AssumptionsGrid({
  assumptions,
}: {
  assumptions: Record<string, any> | null | undefined;
}) {
  if (!assumptions) return <p className="muted">Sin supuestos registrados.</p>;
  return (
    <div className="kv-grid">
      {Object.entries(LABELS).map(([key, meta]) => (
        <div className="kv" key={key}>
          <span className="kv-key">{meta.label}</span>
          <span className="kv-val">{fmtAssumption(meta.kind, assumptions[key])}</span>
        </div>
      ))}
    </div>
  );
}

/** Filtros de calidad pasados, si el screen los reporta (shape flexible). */
export function FiltersPassed({ details }: { details: Record<string, any> | null }) {
  const raw =
    details?.assumptions?.filtros ??
    details?.filtros ??
    details?.filters ??
    details?.filters_passed ??
    details?.passed_filters ??
    null;
  if (raw == null) return null;
  let entries: [string, unknown][] = [];
  if (Array.isArray(raw)) entries = raw.map((f) => [String(f), true]);
  else if (typeof raw === "object") entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return null;
  return (
    <div className="filters-passed">
      <span className="kv-key">Filtros</span>
      <div className="chips">
        {entries.map(([name, val]) => (
          <span key={name} className={`chip ${val === false ? "chip-red" : "chip-green"}`}>
            {name}
            {typeof val === "boolean" ? (val ? " ✓" : " ✗") : `: ${String(val)}`}
          </span>
        ))}
      </div>
    </div>
  );
}
