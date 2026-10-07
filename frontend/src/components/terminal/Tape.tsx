import type { CSSProperties } from "react";

export interface TapeItem {
  symbol: string;
  price: string;
  delta: string;
  dir: "up" | "down" | "flat";
}

const DIR_TEXT: Record<TapeItem["dir"], string> = {
  up: "text-up",
  down: "text-down",
  flat: "text-faint",
};

const DIR_ARROW: Record<TapeItem["dir"], string> = {
  up: "▲",
  down: "▼",
  flat: "",
};

// Cinta de cotizaciones en marquesina continua; se pausa al pasar el cursor.
export function Tape({
  label,
  items,
  duration = 90,
}: {
  label: string;
  items: TapeItem[];
  duration?: number;
}) {
  const doubled = [...items, ...items];
  return (
    <div className="term-tape flex h-7 items-stretch overflow-hidden border-b border-hair bg-crt">
      <span className="z-10 flex w-24 shrink-0 items-center border-r border-hair bg-crt-2 px-2 text-[9px] font-semibold tracking-[0.18em] text-amber">
        {label}
      </span>
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {items.length === 0 ? (
          <span className="flex h-full items-center px-3 text-[10px] tracking-wider text-ghost">
            SIN DATOS
          </span>
        ) : (
          <div
            className="term-tape-track h-full items-center"
            style={{ "--tape-duration": `${duration}s` } as CSSProperties}
          >
            {doubled.map((it, i) => (
              <span
                key={`${it.symbol}-${i}`}
                className="flex items-center gap-1.5 whitespace-nowrap px-3 text-[11px]"
              >
                <span className="font-medium text-amber">{it.symbol}</span>
                <span className="text-glow">{it.price}</span>
                <span className={DIR_TEXT[it.dir]}>
                  {DIR_ARROW[it.dir]} {it.delta}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
