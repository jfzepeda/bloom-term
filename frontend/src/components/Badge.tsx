const VERDICT_CLASS: Record<string, string> = {
  COMPRA: "badge badge-green",
  VIGILAR: "badge badge-amber",
  CARA: "badge badge-red",
  FILTRADA: "badge badge-gray",
  NO_VALORABLE: "badge badge-gray",
};

export function VerdictBadge({ verdict }: { verdict: string | null | undefined }) {
  if (!verdict) return <span className="muted">—</span>;
  const cls = VERDICT_CLASS[verdict] ?? "badge badge-gray";
  return <span className={cls}>{verdict.replace("_", " ")}</span>;
}

export function Badge({
  tone,
  children,
}: {
  tone: "green" | "amber" | "red" | "blue" | "gray";
  children: React.ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
