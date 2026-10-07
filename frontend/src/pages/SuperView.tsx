import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AgentsPanel } from "../components/terminal/AgentsPanel";
import { CommandLine } from "../components/terminal/CommandLine";
import { MarketPanel } from "../components/terminal/MarketPanel";
import { NewsPanel } from "../components/terminal/NewsPanel";
import { ObserverPanel } from "../components/terminal/ObserverPanel";
import { QuoteOverlay } from "../components/terminal/QuoteOverlay";
import { RadarPanel } from "../components/terminal/RadarPanel";
import { SignalsPanel } from "../components/terminal/SignalsPanel";
import { StatusBar, KeyHint } from "../components/terminal/StatusBar";
import { Tape, type TapeItem } from "../components/terminal/Tape";
import { TopBar } from "../components/terminal/TopBar";
import {
  MARKET_TABS,
  MARKET_TAB_LABEL,
  type MarketTab,
} from "../components/terminal/types";
import { fmtMoney, fmtPct } from "../format";
import { useUniverse } from "../hooks/useUniverse";
import type { UniverseItem } from "../types";

function toTapeItem(it: UniverseItem): TapeItem {
  const chg = it.change_pct_1d;
  return {
    symbol: it.symbol,
    price: fmtMoney(it.last_close),
    delta: fmtPct(chg),
    dir: chg == null || chg === 0 ? "flat" : chg > 0 ? "up" : "down",
  };
}

// Auto-ciclo de pestañas cuando nadie interactúa (herencia del modo kiosco).
function useIdleCycle(onTick: () => void, idleMs = 60000, stepMs = 15000) {
  useEffect(() => {
    let lastActivity = Date.now();
    let lastTick = 0;
    const bump = () => {
      lastActivity = Date.now();
    };
    window.addEventListener("keydown", bump);
    window.addEventListener("mousemove", bump);
    window.addEventListener("click", bump);
    const id = window.setInterval(() => {
      const now = Date.now();
      if (now - lastActivity >= idleMs && now - lastTick >= stepMs) {
        lastTick = now;
        onTick();
      }
    }, 1000);
    return () => {
      window.removeEventListener("keydown", bump);
      window.removeEventListener("mousemove", bump);
      window.removeEventListener("click", bump);
      window.clearInterval(id);
    };
  }, [onTick, idleMs, stepMs]);
}

export default function SuperView() {
  const navigate = useNavigate();
  const { items } = useUniverse();
  const commandRef = useRef<HTMLInputElement | null>(null);

  const [marketTab, setMarketTab] = useState<MarketTab>("mov");
  const [quoteSymbol, setQuoteSymbol] = useState<string | null>(null);

  const openQuote = useCallback((symbol: string) => {
    setQuoteSymbol(symbol.toUpperCase());
  }, []);

  // Teclado global: 1-4 pestañas, / comando, ESC cierra overlay o sale.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === "Escape") {
        if (typing) {
          (el as HTMLElement).blur();
          return;
        }
        if (quoteSymbol) setQuoteSymbol(null);
        else navigate("/");
        return;
      }
      if (typing) return;
      if (quoteSymbol) return; // con el QUOTE abierto, solo ESC actúa
      if (e.key === "/") {
        e.preventDefault();
        commandRef.current?.focus();
        return;
      }
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx >= 0) setMarketTab(MARKET_TABS[idx]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, quoteSymbol]);

  useIdleCycle(
    useCallback(() => {
      setQuoteSymbol((q) => {
        if (q != null) return q; // no rotar con un quote abierto
        setMarketTab(
          (t) => MARKET_TABS[(MARKET_TABS.indexOf(t) + 1) % MARKET_TABS.length],
        );
        return q;
      });
    }, []),
  );

  const nasdaqTape = useMemo<TapeItem[]>(
    () =>
      (items ?? [])
        .filter((it) => it.is_nasdaq100 && it.last_close != null)
        .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
        .slice(0, 30)
        .map(toTapeItem),
    [items],
  );

  const moversTape = useMemo<TapeItem[]>(
    () =>
      (items ?? [])
        .filter((it) => it.change_pct_1d != null && it.last_close != null)
        .sort(
          (a, b) => Math.abs(b.change_pct_1d!) - Math.abs(a.change_pct_1d!),
        )
        .slice(0, 30)
        .map(toTapeItem),
    [items],
  );

  return (
    <div className="term fixed inset-0 z-30 flex flex-col overflow-hidden bg-crt font-term text-[12px] leading-tight text-glow">
      <TopBar
        command={
          <CommandLine
            inputRef={commandRef}
            universe={items}
            onTicker={openQuote}
            onTab={setMarketTab}
          />
        }
        onExit={() => navigate("/")}
      />
      <Tape label="NASDAQ-100" items={nasdaqTape} duration={120} />
      <Tape label="MOVIMIENTOS" items={moversTape} duration={90} />

      <main className="grid min-h-0 flex-1 grid-cols-12 gap-1 p-1">
        <MarketPanel
          className="col-span-5"
          tab={marketTab}
          onTabChange={setMarketTab}
          onSelect={openQuote}
          keyboardEnabled={quoteSymbol == null}
        />
        <div className="col-span-4 grid min-h-0 grid-rows-[3fr_2fr] gap-1">
          <SignalsPanel onSelect={openQuote} />
          <NewsPanel onSelect={openQuote} />
        </div>
        <div className="col-span-3 grid min-h-0 grid-rows-[5fr_4fr_3fr] gap-1">
          <ObserverPanel onSelect={openQuote} />
          <RadarPanel onSelect={openQuote} />
          <AgentsPanel onSelect={openQuote} />
        </div>
      </main>

      <StatusBar
        left={
          <>
            {MARKET_TABS.map((t, i) => (
              <KeyHint
                key={t}
                k={String(i + 1)}
                label={MARKET_TAB_LABEL[t]}
                active={marketTab === t}
                onClick={() => setMarketTab(t)}
              />
            ))}
            <KeyHint
              k="/"
              label="COMANDO"
              onClick={() => commandRef.current?.focus()}
            />
            <KeyHint k="ESC" label="SALIR" onClick={() => navigate("/")} />
          </>
        }
        right={
          <span className="text-[9px] tracking-[0.14em]">
            UNIVERSO {items?.length ?? "—"} · S&P 500
          </span>
        }
      />

      {quoteSymbol && (
        <QuoteOverlay
          symbol={quoteSymbol}
          onClose={() => setQuoteSymbol(null)}
        />
      )}
    </div>
  );
}
