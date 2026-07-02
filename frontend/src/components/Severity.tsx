const SEV: Record<string, { cls: string; label: string }> = {
  alta: { cls: "sev-alta", label: "ALTA" },
  media: { cls: "sev-media", label: "MEDIA" },
  info: { cls: "sev-info", label: "INFO" },
};

/** Punto de severidad SIEMPRE acompañado de etiqueta de texto. */
export function SeverityDot({ severity }: { severity: string }) {
  const s = SEV[severity] ?? { cls: "sev-info", label: severity.toUpperCase() };
  return (
    <span className="sev">
      <span className={`sev-dot ${s.cls}`} aria-hidden="true" />
      <span className="sev-label">{s.label}</span>
    </span>
  );
}

export function severityLabel(severity: string): string {
  return SEV[severity]?.label ?? severity.toUpperCase();
}
