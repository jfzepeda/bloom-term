import type { ReactNode } from "react";
import { nyClock, useNow, type MarketPhase } from "./hooks";

const PHASE_DOT: Record<MarketPhase, string> = {
  pre: "bg-amber",
  open: "bg-up animate-pulse",
  post: "bg-amber",
  closed: "bg-ghost",
};

const PHASE_TEXT: Record<MarketPhase, string> = {
  pre: "text-amber",
  open: "text-up",
  post: "text-amber",
  closed: "text-faint",
};

export function TopBar({
  command,
  onExit,
}: {
  command: ReactNode;
  onExit: () => void;
}) {
  const now = useNow(1000);
  const ny = nyClock(now);
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-hair bg-crt-1 px-3">
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[15px] leading-none text-amber">◮</span>
        <span className="text-[12px] font-bold tracking-[0.22em] text-glow">
          MARKET SENTINEL
        </span>
        <span className="hidden text-[9px] tracking-[0.3em] text-faint lg:inline">
          TERMINAL
        </span>
      </div>
      <div className="min-w-0 flex-1">{command}</div>
      <div className="flex shrink-0 items-center gap-3 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${PHASE_DOT[ny.phase]}`}
          />
          <span className="tracking-wider text-dim">NY {ny.hhmmss}</span>
          <span
            className={`text-[9px] font-semibold tracking-[0.18em] ${PHASE_TEXT[ny.phase]}`}
          >
            {ny.phaseLabel}
          </span>
        </span>
        <span className="hidden text-[10px] tracking-[0.14em] text-faint md:inline">
          {ny.dateLabel}
        </span>
        <button
          type="button"
          onClick={onExit}
          className="border border-hair px-2 py-0.5 text-[10px] tracking-[0.18em] text-faint transition-colors hover:border-hair-strong hover:text-glow"
        >
          ESC SALIR
        </button>
      </div>
    </header>
  );
}
