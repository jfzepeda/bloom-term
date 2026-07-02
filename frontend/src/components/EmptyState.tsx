const DEFAULT_MESSAGE =
  "Sin datos aún — el worker está cargando el universo. Puedes disparar la ingestión con POST /api/admin/refresh/prices_history";

export default function EmptyState({
  title = "Sin datos aún",
  message = DEFAULT_MESSAGE,
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="empty-state panel">
      <p className="empty-title">{title}</p>
      <p className="empty-msg">{message}</p>
    </div>
  );
}

export function Loading() {
  return <div className="loading muted">Cargando…</div>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="empty-state panel">
      <p className="empty-title">No se pudo cargar</p>
      <p className="empty-msg">{message}</p>
    </div>
  );
}
