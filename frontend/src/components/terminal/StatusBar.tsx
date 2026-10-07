import type { ReactNode } from "react";

export function StatusBar({
  left,
  right,
}: {
  left: ReactNode;
  right?: ReactNode;
}) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 overflow-hidden border-t border-hair bg-crt-1 px-2 text-[10px] tracking-wider">
      <div className="flex min-w-0 items-center gap-2">{left}</div>
      {right != null && (
        <div className="ml-auto flex shrink-0 items-center gap-3 text-faint">
          {right}
        </div>
      )}
    </footer>
  );
}

export function KeyHint({
  k,
  label,
  active = false,
  onClick,
}: {
  k: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex items-center gap-1 whitespace-nowrap"
    >
      <span className="border border-hair bg-crt-2 px-1 text-[9px] leading-4 text-glow">
        {k}
      </span>
      <span
        className={`text-[9px] tracking-[0.14em] ${active ? "text-amber" : "text-faint"} ${onClick ? "hover:text-glow" : ""}`}
      >
        {label}
      </span>
    </button>
  );
}
