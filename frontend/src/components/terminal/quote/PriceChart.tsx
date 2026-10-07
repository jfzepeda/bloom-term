import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "../../../format";
import type { PricePoint, Technicals } from "../../../types";
import { TermEmpty } from "../Panel";

// Gráfico de precio 365d (línea ámbar + referencias ATH/SOP/RES) con
// mini-gráfico de volumen separado debajo. NUNCA doble eje en un mismo plot.

const MESES = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
];

function mesDe(date: string): string {
  const m = Number(date.slice(5, 7));
  return MESES[m - 1] ?? date;
}

const AXIS_TICK = { fontSize: 9, fill: "#6b665b" };
const Y_WIDTH = 52;
const GRID_STROKE = "rgba(239,234,221,0.05)";
const CURSOR_STROKE = "rgba(239,234,221,0.18)";

export function PriceChart({
  prices,
  technicals,
}: {
  prices: PricePoint[];
  technicals: Technicals | null;
}) {
  // ~6 ticks de meses repartidos a lo largo de la serie.
  const ticks = useMemo(() => {
    const n = prices.length;
    if (n === 0) return [];
    const count = Math.min(6, n);
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      out.push(prices[Math.floor(((i + 0.5) * n) / count)].date);
    }
    return out;
  }, [prices]);

  const maxClose = useMemo(
    () => prices.reduce((m, p) => Math.max(m, p.close), 0),
    [prices],
  );
  const hasVolume = useMemo(
    () => prices.some((p) => p.volume != null && p.volume > 0),
    [prices],
  );

  const ath = technicals?.ath ?? null;
  // Solo pintamos el ATH si está cerca del rango de la ventana; si queda muy
  // por encima aplastaría la escala de la serie.
  const showAth = ath != null && maxClose > 0 && ath <= maxClose * 1.15;
  const support = technicals?.support ?? null;
  const resistance = technicals?.resistance ?? null;

  return (
    <section className="flex min-h-0 min-w-0 flex-col border border-hair bg-crt-1">
      <header className="flex h-6 shrink-0 items-center justify-between gap-2 border-b border-hair bg-crt-2 px-2">
        <span className="text-[10px] font-semibold tracking-[0.18em] text-amber">
          PRECIO · 365D
        </span>
        <span className="text-[9px] tracking-[0.12em] text-faint">
          <span className="text-faint">┄ ATH</span>
          <span className="ml-2 text-amber-2">┄ SOP/RES</span>
        </span>
      </header>

      {prices.length === 0 ? (
        <div className="min-h-0 flex-1">
          <TermEmpty>SIN HISTÓRICO DE PRECIOS</TermEmpty>
        </div>
      ) : (
        <>
          <div className="min-h-0 min-w-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={prices}
                margin={{ top: 8, right: 0, bottom: 0, left: 8 }}
              >
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={ticks}
                  interval={0}
                  tickFormatter={mesDe}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  orientation="right"
                  domain={["auto", "auto"]}
                  width={Y_WIDTH}
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => fmtMoney(Number(v), 0)}
                />
                <Tooltip
                  cursor={{ stroke: CURSOR_STROKE }}
                  contentStyle={{
                    backgroundColor: "#211e17",
                    border: "1px solid rgba(239,234,221,0.18)",
                    fontSize: 10,
                    padding: "4px 8px",
                  }}
                  labelStyle={{ color: "#a09a8c" }}
                  itemStyle={{ color: "#efeadd" }}
                  formatter={(value) => [fmtMoney(value as number), "CIERRE"]}
                />
                {showAth && (
                  <ReferenceLine
                    y={ath}
                    stroke="#6b665b"
                    strokeDasharray="4 3"
                    ifOverflow="extendDomain"
                    label={{
                      value: "ATH",
                      fill: "#6b665b",
                      fontSize: 9,
                      position: "insideLeft",
                    }}
                  />
                )}
                {support != null && (
                  <ReferenceLine
                    y={support}
                    stroke="#c98a1e"
                    strokeDasharray="4 3"
                    ifOverflow="extendDomain"
                    label={{
                      value: "SOP",
                      fill: "#c98a1e",
                      fontSize: 9,
                      position: "insideLeft",
                    }}
                  />
                )}
                {resistance != null && (
                  <ReferenceLine
                    y={resistance}
                    stroke="#c98a1e"
                    strokeDasharray="4 3"
                    ifOverflow="extendDomain"
                    label={{
                      value: "RES",
                      fill: "#c98a1e",
                      fontSize: 9,
                      position: "insideLeft",
                    }}
                  />
                )}
                <Line
                  type="linear"
                  dataKey="close"
                  stroke="var(--color-amber)"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {hasVolume && (
            <div className="relative h-[56px] shrink-0 border-t border-hair-soft">
              <span className="absolute left-2 top-0.5 z-10 text-[8px] tracking-[0.18em] text-ghost">
                VOL
              </span>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={prices}
                  margin={{ top: 4, right: Y_WIDTH, bottom: 2, left: 8 }}
                >
                  <XAxis dataKey="date" hide />
                  <Bar
                    dataKey="volume"
                    fill="rgba(239,234,221,0.14)"
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </section>
  );
}
