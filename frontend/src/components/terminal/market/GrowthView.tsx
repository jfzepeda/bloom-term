import { useMemo } from "react";
import { fmtNum } from "../../../format";
import type { ScreenResponse } from "../../../types";
import { TermEmpty, TermLoading } from "../Panel";

// Screen GRW: ranking growth con barra secuencial ámbar (score/maxScore)
// y etiquetas cualitativas del screen como chips.

const TH =
  "sticky top-0 z-10 whitespace-nowrap border-b border-hair bg-crt-2 px-1.5 py-[3px] text-[9px] font-medium uppercase tracking-[0.12em] text-faint";
const TD = "overflow-hidden whitespace-nowrap border-b border-hair-soft px-1.5 py-[3px]";

export function GrowthView({
  data,
  loading,
  error,
  onSelect,
}: {
  data: ScreenResponse | null;
  loading: boolean;
  error: string | null;
  onSelect: (symbol: string) => void;
}) {
  const rows = useMemo(() => {
    return (data?.items ?? [])
      .filter((it) => it.symbol != null)
      .sort((a, b) => {
        if (a.rank == null && b.rank == null) return 0;
        if (a.rank == null) return 1;
        if (b.rank == null) return -1;
        return a.rank - b.rank;
      });
  }, [data]);

  const maxScore = useMemo(
    () => rows.reduce((m, it) => Math.max(m, it.score ?? 0), 0) || 1,
    [rows],
  );

  if (loading) return <TermLoading />;
  if (error)
    return <TermEmpty>SIN CONEXIÓN — SCREEN GROWTH NO DISPONIBLE</TermEmpty>;
  if (!rows.length)
    return (
      <TermEmpty>SCREEN GROWTH SIN RESULTADOS — EJECUTA EL JOB «screens»</TermEmpty>
    );

  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-[11px]">
      <colgroup>
        <col className="w-[6%]" />
        <col className="w-[13%]" />
        <col className="w-[22%]" />
        <col className="w-[30%]" />
        <col className="w-[29%]" />
      </colgroup>
      <thead>
        <tr>
          <th className={`${TH} pl-2 text-right`}>#</th>
          <th className={`${TH} text-left`}>SÍMBOLO</th>
          <th className={`${TH} text-left`}>SECTOR</th>
          <th className={`${TH} text-left`}>SCORE</th>
          <th className={`${TH} pr-2 text-left`}>ETIQUETAS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((it, i) => {
          const labels: string[] = (
            (it.details?.labels as string[] | undefined) ??
            (it.details?.tags as string[] | undefined) ??
            []
          ).slice(0, 3);
          const pct = Math.max(
            0,
            Math.min(100, ((it.score ?? 0) / maxScore) * 100),
          );
          return (
            <tr
              key={it.symbol!}
              onClick={() => onSelect(it.symbol!)}
              className="cursor-pointer hover:bg-crt-2"
            >
              <td className={`${TD} pl-2 text-right text-faint`}>
                {it.rank ?? i + 1}
              </td>
              <td className={`${TD} font-medium text-amber`}>{it.symbol}</td>
              <td className={`${TD} truncate text-faint`}>
                {it.sector ?? "—"}
              </td>
              <td className={TD}>
                <div className="flex items-center gap-1.5">
                  <div className="h-[3px] min-w-0 flex-1 bg-crt-2">
                    <div
                      className="h-full bg-amber"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right">
                    {fmtNum(it.score, 0)}
                  </span>
                </div>
              </td>
              <td className={`${TD} pr-2`}>
                {labels.length ? (
                  <div className="flex gap-1 overflow-hidden">
                    {labels.map((l) => (
                      <span
                        key={l}
                        className="max-w-[90px] truncate border border-hair px-1 py-px text-[9px] uppercase tracking-wide text-dim"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-faint">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
