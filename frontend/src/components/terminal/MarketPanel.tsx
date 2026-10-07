import { useScreen } from "../../hooks/useScreen";
import { useUniverse } from "../../hooks/useUniverse";
import { BlotterView } from "./market/BlotterView";
import { GrowthView } from "./market/GrowthView";
import { HeatmapView } from "./market/HeatmapView";
import { ValueView } from "./market/ValueView";
import { Panel, PanelTab, Stamp } from "./Panel";
import { MARKET_TAB_LABEL, MARKET_TABS, type MarketTab } from "./types";

/**
 * Panel MERCADO — pestañas: MOV (blotter del universo), VAL (screen value),
 * GRW (screen growth), MAPA (heatmap sectorial).
 *
 * Contrato:
 * - `tab`/`onTabChange`: pestaña activa controlada por SuperView (hotkeys 1-4).
 * - `onSelect(symbol)`: abrir el QuoteOverlay de ese ticker.
 * - `keyboardEnabled`: cuando es true y no hay input enfocado, ↑/↓ mueven la
 *   selección del blotter y Enter abre el ticker seleccionado.
 * - Datos: useUniverse() (MOV/MAPA), useScreen("value"), useScreen("growth").
 */
export function MarketPanel({
  tab,
  onTabChange,
  onSelect,
  keyboardEnabled,
  className = "",
}: {
  tab: MarketTab;
  onTabChange: (tab: MarketTab) => void;
  onSelect: (symbol: string) => void;
  keyboardEnabled: boolean;
  className?: string;
}) {
  const universe = useUniverse();
  const value = useScreen("value");
  const growth = useScreen("growth");

  return (
    <Panel
      code="MER"
      title="Mercado · S&P 500"
      className={className}
      right={
        <>
          {tab === "val" && value.data?.as_of && (
            <Stamp>AL {value.data.as_of}</Stamp>
          )}
          {tab === "grw" && growth.data?.as_of && (
            <Stamp>AL {growth.data.as_of}</Stamp>
          )}
          {MARKET_TABS.map((t, i) => (
            <PanelTab
              key={t}
              active={tab === t}
              hotkey={String(i + 1)}
              onClick={() => onTabChange(t)}
            >
              {MARKET_TAB_LABEL[t]}
            </PanelTab>
          ))}
        </>
      }
    >
      {tab === "mov" && (
        <BlotterView
          items={universe.items}
          loading={universe.loading}
          error={universe.error}
          onSelect={onSelect}
          keyboardEnabled={keyboardEnabled}
        />
      )}
      {tab === "val" && (
        <ValueView
          data={value.data}
          loading={value.loading}
          error={value.error}
          onSelect={onSelect}
        />
      )}
      {tab === "grw" && (
        <GrowthView
          data={growth.data}
          loading={growth.loading}
          error={growth.error}
          onSelect={onSelect}
        />
      )}
      {tab === "mapa" && (
        <HeatmapView
          items={universe.items}
          loading={universe.loading}
          error={universe.error}
          onSelect={onSelect}
        />
      )}
    </Panel>
  );
}
