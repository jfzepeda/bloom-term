import type { ReactNode } from "react";

// Bloques clave-valor densos de la columna derecha del QUOTE.

export function KvBlock({
  code,
  right,
  children,
}: {
  code: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="shrink-0 border border-hair bg-crt-1">
      <header className="flex h-6 shrink-0 items-center justify-between gap-2 border-b border-hair bg-crt-2 px-2">
        <span className="text-[10px] font-semibold tracking-[0.18em] text-amber">
          {code}
        </span>
        {right}
      </header>
      <div>{children}</div>
    </section>
  );
}

export function KvRow({
  label,
  value,
  valueClass = "text-glow",
}: {
  label: string;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-hair-soft px-2 py-[3px] last:border-b-0">
      <span className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-faint">
        {label}
      </span>
      <span className={`truncate text-right text-[11px] ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}

export function KvEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-3 text-center text-[10px] tracking-[0.14em] text-faint">
      {children}
    </div>
  );
}
