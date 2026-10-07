import type { ReactNode } from "react";

// Chrome compartido de todos los paneles del terminal: cabecera con código
// ámbar + título + zona derecha (tabs/sello), cuerpo con scroll fino.
export function Panel({
  code,
  title,
  right,
  children,
  className = "",
  bodyClassName = "",
}: {
  code: string;
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col border border-hair bg-crt-1 ${className}`}
    >
      <header className="flex h-7 shrink-0 items-center gap-2 border-b border-hair bg-crt-2 px-2">
        <span className="shrink-0 text-[11px] font-semibold tracking-[0.18em] text-amber">
          {code}
        </span>
        {title && (
          <span className="truncate text-[10px] uppercase tracking-[0.14em] text-dim">
            {title}
          </span>
        )}
        {right != null && (
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {right}
          </span>
        )}
      </header>
      <div
        className={`term-scroll min-h-0 flex-1 overflow-y-auto ${bodyClassName}`}
      >
        {children}
      </div>
    </section>
  );
}

export function PanelTab({
  active,
  hotkey,
  children,
  onClick,
}: {
  active: boolean;
  hotkey?: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-1.5 py-0.5 text-[10px] font-medium tracking-[0.12em] transition-colors ${
        active ? "bg-amber text-crt" : "text-faint hover:text-glow"
      }`}
    >
      {hotkey && (
        <span className={active ? "opacity-60" : "text-ghost"}>{hotkey} </span>
      )}
      {children}
    </button>
  );
}

// Sello de fecha/hora en cabeceras: "AL 2026-07-02"
export function Stamp({ children }: { children: ReactNode }) {
  return (
    <span className="text-[9px] tracking-[0.14em] text-faint">{children}</span>
  );
}

export function TermEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-16 items-center justify-center px-3 py-4 text-center text-[11px] tracking-wider text-faint">
      {children}
    </div>
  );
}

export function TermLoading() {
  return (
    <div className="flex h-full min-h-16 items-center justify-center px-3 py-4 text-[11px] tracking-[0.2em] text-faint">
      <span className="term-cursor">CARGANDO </span>
    </div>
  );
}

// Etiqueta IA: marca todo contenido generado por agentes.
export function AiTag() {
  return (
    <span className="inline-flex items-center gap-1 border border-amber-2/60 px-1 py-px text-[8px] font-semibold tracking-[0.2em] text-amber">
      ◮ IA
    </span>
  );
}
