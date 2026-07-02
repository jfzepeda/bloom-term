export default function ScoreBar({ value, max }: { value: number | null; max: number }) {
  if (value == null || !isFinite(value)) return <span className="muted">—</span>;
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="scorebar" title={`${value.toFixed(1)} / ${max.toFixed(1)}`}>
      <div className="scorebar-track">
        <div className="scorebar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="scorebar-value">{value.toFixed(1)}</span>
    </div>
  );
}
