import type { ModalState } from "./types";

export function Modal({
  content,
  onClose,
}: {
  content: ModalState;
  onClose: () => void;
}) {
  return (
    <div className="kiosk-modal-overlay" onClick={onClose}>
      <div className="kiosk-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kiosk-modal-head">
          <div className="kiosk-modal-title">{content.title}</div>
          <button
            type="button"
            className="kiosk-modal-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <p className="kiosk-modal-subtitle">{content.subtitle}</p>
        <div className="kiosk-modal-rows">
          {content.rows.map((r) => (
            <div key={r.label} className="kiosk-modal-row">
              <span className="kiosk-modal-row-label">{r.label}</span>
              <span className="kiosk-modal-row-value">{r.value}</span>
            </div>
          ))}
        </div>
        <p className="kiosk-modal-note">{content.note}</p>
      </div>
    </div>
  );
}
