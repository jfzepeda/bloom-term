import { useMemo } from "react";
import { fmtMoney, fmtPct } from "../../../format";
import type { ScreenItem, ScreenResponse } from "../../../types";
import { TermEmpty, TermLoading } from "../Panel";
import { deltaClass, VERDICT_TEXT } from "../utils";

// Screen VAL: candidatas value (DCF) ordenadas por upside descendente.

const TH =
  "sticky top-0 z-10 whitespace-nowrap border-b border-hair bg-crt-2 px-1.5 py-[3px] text-[9px] font-medium uppercase tracking-[0.12em] text-faint";
const TD = "overflow-hidden whitespace-nowrap border-b border-hair-soft px-1.5 py-[3px]";

function upsideOf(it: ScreenItem): number | null {
  return (it.details?.upside_pct as number | null | undefined) ?? it.score;
}

export function ValueView({
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
        const av = upsideOf(a);
        const bv = upsideOf(b);
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av;
      });
  }, [data]);

  if (loading) return <TermLoading />;
  if (error)
    return <TermEmpty>SIN CONEXIÓN — SCREEN VALUE NO DISPONIBLE</TermEmpty>;
  if (!rows.length)
    return (
      <TermEmpty>SCREEN VALUE SIN RESULTADOS — EJECUTA EL JOB «screens»</TermEmpty>
    );

  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-[11px]">
      <colgroup>
        <col className="w-[6%]" />
        <col className="w-[13%]" />
        <col className="w-[24%]" />
        <col className="w-[13%]" />
        <col className="w-[13%]" />
        <col className="w-[13%]" />
        <col className="w-[18%]" />
      </colgroup>
      <thead>
        <tr>
          <th className={`${TH} pl-2 text-right`}>#</th>
          <th className={`${TH} text-left`}>SÍMBOLO</th>
          <th className={`${TH} text-left`}>SECTOR</th>
          <th className={`${TH} text-right`}>PRECIO</th>
          <th className={`${TH} text-right`}>V.INTR</th>
          <th className={`${TH} text-right`}>UPSIDE</th>
          <th className={`${TH} pr-2 text-left`}>VEREDICTO</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((it, i) => {
          const d = it.details ?? {};
          const upside = upsideOf(it);
          const verdict = (d.verdict as string | null | undefined) ?? null;
          return (
            <tr
              key={it.symbol!}
              onClick={() => onSelect(it.symbol!)}
              className="cursor-pointer hover:bg-crt-2"
            >
              <td className={`${TD} pl-2 text-right text-faint`}>{i + 1}</td>
              <td className={`${TD} font-medium text-amber`}>{it.symbol}</td>
              <td className={`${TD} truncate text-faint`}>
                {it.sector ?? "—"}
              </td>
              <td className={`${TD} text-right`}>
                {fmtMoney(d.price_at_calc as number | null | undefined)}
              </td>
              <td className={`${TD} text-right`}>
                {fmtMoney(d.intrinsic_value as number | null | undefined)}
              </td>
              <td className={`${TD} text-right ${deltaClass(upside)}`}>
                {fmtPct(upside)}
              </td>
              <td
                className={`${TD} pr-2 ${
                  verdict ? VERDICT_TEXT[verdict] ?? "text-faint" : "text-faint"
                }`}
              >
                {verdict ?? "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
