function PipelineStep({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="kiosk-pipeline-step">
      <svg
        className="kiosk-pipeline-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
      >
        {children}
      </svg>
      <div className="kiosk-pipeline-label">{label}</div>
    </div>
  );
}

export function PipelinePhase() {
  return (
    <div className="kiosk-pipeline">
      <PipelineStep color="var(--blue)" label="Ingesta de Datos">
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <line x1="3" y1="12" x2="21" y2="12" />
      </PipelineStep>
      <span className="kiosk-pipeline-arrow" aria-hidden="true">
        →
      </span>
      <PipelineStep color="var(--green)" label="Análisis Value / Growth / DCF">
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <line x1="1" y1="9" x2="6" y2="9" />
        <line x1="1" y1="15" x2="6" y2="15" />
        <line x1="18" y1="9" x2="23" y2="9" />
        <line x1="18" y1="15" x2="23" y2="15" />
        <line x1="9" y1="1" x2="9" y2="6" />
        <line x1="15" y1="1" x2="15" y2="6" />
      </PipelineStep>
      <span className="kiosk-pipeline-arrow" aria-hidden="true">
        →
      </span>
      <PipelineStep color="var(--amber)" label="Motor de Alertas">
        <path d="M3 21V10l5-3 5 3v11" />
        <path d="M13 21V7l5-3 3 2v15" />
      </PipelineStep>
      <span className="kiosk-pipeline-arrow" aria-hidden="true">
        →
      </span>
      <PipelineStep
        color="var(--red)"
        label="Agentes IA (Research / Event Scout / Observer)"
      >
        <rect x="4" y="3" width="16" height="18" rx="1.5" />
        <line x1="8" y1="8" x2="16" y2="8" />
        <line x1="8" y1="12" x2="16" y2="12" />
        <line x1="8" y1="16" x2="13" y2="16" />
      </PipelineStep>
    </div>
  );
}
