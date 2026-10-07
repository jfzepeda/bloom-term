import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { UniverseItem } from "../../types";
import type { MarketTab } from "./types";
import { MARKET_TABS, MARKET_TAB_LABEL } from "./types";
import { deltaClass } from "./utils";
import { fmtPct } from "../../format";

type Suggestion =
  | { kind: "panel"; tab: MarketTab; label: string }
  | { kind: "ticker"; item: UniverseItem };

const MAX_SUGGESTIONS = 8;

/**
 * Línea de comandos del terminal (firma de la interfaz).
 *
 * Contrato:
 * - Input mono con placeholder "TICKER O COMANDO … [/]"; prompt "❯" ámbar.
 * - Autocompletado sobre `universe` (símbolo o nombre, máx 8 sugerencias,
 *   navegables con ↑/↓, Enter selecciona, Escape cierra y desenfoca).
 * - Comandos de panel: MOV, VAL, GRW, MAPA → onTab(tab correspondiente).
 * - Cualquier símbolo del universo (exacto o sugerencia) → onTicker(symbol).
 * - Al ejecutar: limpiar input y desenfocar (el foco vuelve al terminal).
 */
export function CommandLine({
  inputRef,
  universe,
  onTicker,
  onTab,
}: {
  inputRef: RefObject<HTMLInputElement>;
  universe: UniverseItem[] | null;
  onTicker: (symbol: string) => void;
  onTab: (tab: MarketTab) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState(false);
  const errTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(errTimer.current), []);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const out: Suggestion[] = [];
    // Comandos de panel por prefijo, como primera sugerencia especial.
    for (const tab of MARKET_TABS) {
      const label = MARKET_TAB_LABEL[tab];
      if (label.startsWith(q)) out.push({ kind: "panel", tab, label });
    }
    if (universe) {
      const bySymbol = universe.filter((it) =>
        it.symbol.toUpperCase().startsWith(q),
      );
      const seen = new Set(bySymbol.map((it) => it.symbol));
      const byName = universe.filter(
        (it) =>
          !seen.has(it.symbol) &&
          (it.name ?? "").toUpperCase().includes(q),
      );
      for (const it of [...bySymbol, ...byName]) {
        if (out.length >= MAX_SUGGESTIONS) break;
        out.push({ kind: "ticker", item: it });
      }
    }
    return out.slice(0, MAX_SUGGESTIONS);
  }, [query, universe]);

  const active = Math.min(activeIndex, Math.max(0, suggestions.length - 1));

  function flashError() {
    setError(true);
    window.clearTimeout(errTimer.current);
    errTimer.current = window.setTimeout(() => setError(false), 600);
  }

  function execute(s: Suggestion) {
    if (s.kind === "panel") onTab(s.tab);
    else onTicker(s.item.symbol);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.blur();
  }

  function executeExact(): boolean {
    const q = query.trim();
    if (!q) return false;
    const tab = MARKET_TABS.find((t) => MARKET_TAB_LABEL[t] === q);
    if (tab) {
      execute({ kind: "panel", tab, label: q });
      return true;
    }
    const item = universe?.find((it) => it.symbol.toUpperCase() === q);
    if (item) {
      execute({ kind: "ticker", item });
      return true;
    }
    return false;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length > 0)
        setActiveIndex((active + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length > 0)
        setActiveIndex((active - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === "Enter") {
      // stopPropagation: execute() blurea el input de forma síncrona y, sin
      // esto, el mismo keydown llega a los listeners de window (SuperView /
      // BlotterView) que ya no ven un input enfocado y actúan por su cuenta.
      e.stopPropagation();
      if (open && suggestions.length > 0) {
        execute(suggestions[active]);
      } else if (!executeExact()) {
        flashError();
      }
      return;
    }
    if (e.key === "Tab") {
      if (open && suggestions.length > 0) {
        e.preventDefault();
        const s = suggestions[active];
        setQuery(s.kind === "panel" ? s.label : s.item.symbol.toUpperCase());
        setActiveIndex(0);
      }
      return;
    }
    if (e.key === "Escape") {
      e.stopPropagation(); // sin esto, SuperView ve el input ya blureado y sale del terminal
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.toUpperCase();
    setQuery(v);
    setActiveIndex(0);
    setOpen(v.trim().length > 0);
    if (error) {
      window.clearTimeout(errTimer.current);
      setError(false);
    }
  }

  const borderClass = error
    ? "border-down"
    : focused
      ? "border-amber-2"
      : "border-hair";

  return (
    <div
      className={`relative flex h-6 max-w-xl items-center gap-1.5 border bg-crt px-2 ${borderClass}`}
    >
      <span className="text-[11px] text-amber">❯</span>
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setFocused(true);
          if (query.trim()) setOpen(true);
        }}
        onBlur={() => {
          setFocused(false);
          setOpen(false);
        }}
        className="w-full bg-transparent text-[11px] tracking-wider text-glow outline-none placeholder:text-ghost"
        placeholder="TICKER O COMANDO … [/]"
        spellCheck={false}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="term-scroll absolute left-0 right-0 top-full z-50 mt-px max-h-56 overflow-y-auto border border-hair-strong bg-crt-3">
          {suggestions.map((s, i) => {
            const isActive = i === active;
            const rowClass = `flex cursor-pointer items-center gap-2 border-b border-hair-soft border-l-2 px-2 py-[3px] ${
              isActive ? "border-l-amber bg-crt-2" : "border-l-transparent"
            }`;
            if (s.kind === "panel") {
              return (
                <div
                  key={`panel-${s.tab}`}
                  className={rowClass}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    execute(s);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span className="w-14 shrink-0 text-[11px] text-amber">
                    {s.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] tracking-[0.12em] text-faint">
                    → PANEL
                  </span>
                </div>
              );
            }
            const it = s.item;
            return (
              <div
                key={it.symbol}
                className={rowClass}
                onMouseDown={(e) => {
                  e.preventDefault();
                  execute(s);
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="w-14 shrink-0 text-[11px] text-amber">
                  {it.symbol}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-dim">
                  {it.name ?? "—"}
                </span>
                {it.sector && (
                  <span className="shrink-0 text-[9px] text-ghost">
                    {it.sector}
                  </span>
                )}
                {it.change_pct_1d != null && (
                  <span
                    className={`w-14 shrink-0 text-right text-[11px] ${deltaClass(it.change_pct_1d)}`}
                  >
                    {fmtPct(it.change_pct_1d)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
