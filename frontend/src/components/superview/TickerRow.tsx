import type { TickerRowItem } from "./types";

export function TickerRow({
  label,
  items,
  variant,
}: {
  label: string;
  items: TickerRowItem[];
  variant: "a" | "b";
}) {
  if (items.length === 0) return null;
  const doubled = [...items, ...items];
  return (
    <div className={`kiosk-ticker kiosk-ticker-${variant}`}>
      <div className="kiosk-ticker-tag">{label}</div>
      <div className="kiosk-ticker-scroll">
        <div className="kiosk-ticker-track">
          {doubled.map((it, i) => (
            <div className="kiosk-ticker-item" key={`${it.symbol}-${i}`}>
              <span className="kiosk-ticker-symbol">{it.symbol}</span>
              <span>{it.priceDisplay}</span>
              <span className={it.pctCls}>{it.pctDisplay}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
