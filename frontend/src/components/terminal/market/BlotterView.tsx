import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Ref } from "react";
import { fmtMoney, fmtNum, fmtPct } from "../../../format";
import type { UniverseItem } from "../../../types";
import { TermEmpty, TermLoading } from "../Panel";
import { deltaArrow, deltaClass, VERDICT_TEXT } from "../utils";

// Blotter MOV: universo completo (~500 filas) con orden por columna y
// navegación por teclado (↑/↓ + Enter) cuando no hay overlay abierto.

type SortKey =
  | "symbol"
  | "market_cap"
  | "last_close"
  | "change_pct_1d"
  | "drawdown_from_ath_pct"
  | "rsi14"
  | "dist_sma200_pct"
  | "dcf_upside_pct"
  | "growth_score";

const COLS: { key: SortKey; label: string }[] = [
  { key: "symbol", label: "SÍMBOLO" },
  { key: "last_close", label: "ÚLT" },
  { key: "change_pct_1d", label: "Δ1D%" },
  { key: "drawdown_from_ath_pct", label: "VS ATH" },
  { key: "rsi14", label: "RSI" },
  { key: "dist_sma200_pct", label: "ΔSMA200" },
  { key: "dcf_upside_pct", label: "DCF" },
  { key: "growth_score", label: "GRW" },
];

const DCF_ABBR: Record<string, string> = {
  COMPRA: "COMP",
  VIGILAR: "VIGI",
  CARA: "CARA",
  FILTRADA: "FILT",
  NO_VALORABLE: "N/V",
};

const TH =
  "sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap border-b border-hair bg-crt-2 px-1.5 py-[3px] text-[9px] font-medium uppercase tracking-[0.12em] text-faint hover:text-glow";
const TD =
  "overflow-hidden whitespace-nowrap border-b border-hair-soft px-1.5 py-[3px] text-right";

// Fila memoizada: solo re-renderiza cuando cambian sus props (selección,
// orden o datos), no en cada pulsación de teclado del blotter completo.
// scroll-mt-[19px] = alto de la cabecera sticky (9px × 1.25 + 6px pad + 1px borde).
const BlotterRow = memo(function BlotterRow({
  item,
  index,
  selected,
  rowRef,
  onRowClick,
}: {
  item: UniverseItem;
  index: number;
  selected: boolean;
  rowRef?: Ref<HTMLTableRowElement>;
  onRowClick: (index: number, symbol: string) => void;
}) {
  return (
    <tr
      ref={rowRef}
      onClick={() => onRowClick(index, item.symbol)}
      className={`scroll-mt-[19px] cursor-pointer ${selected ? "bg-crt-2" : "hover:bg-crt-2"}`}
    >
      <td
        className={`whitespace-nowrap border-b border-l-2 border-hair-soft py-[3px] pl-2 pr-1.5 font-medium text-amber ${
          selected ? "border-l-amber" : "border-l-transparent"
        }`}
      >
        {item.symbol}
      </td>
      <td className={TD}>{fmtMoney(item.last_close)}</td>
      <td className={`${TD} ${deltaClass(item.change_pct_1d)}`}>
        {deltaArrow(item.change_pct_1d)}
        {fmtPct(item.change_pct_1d)}
      </td>
      <td
        className={`${TD} ${
          item.drawdown_from_ath_pct == null
            ? "text-faint"
            : "text-down/60"
        }`}
      >
        {fmtPct(item.drawdown_from_ath_pct)}
      </td>
      <td className={`${TD} ${item.rsi14 == null ? "text-faint" : ""}`}>
        {fmtNum(item.rsi14, 0)}
        {item.rsi14 != null && item.rsi14 > 70 && (
          <span className="ml-0.5 text-[8px] font-semibold text-amber">
            SC
          </span>
        )}
        {item.rsi14 != null && item.rsi14 < 30 && (
          <span className="ml-0.5 text-[8px] font-semibold text-amber">
            SV
          </span>
        )}
      </td>
      <td className={`${TD} ${deltaClass(item.dist_sma200_pct)}`}>
        {fmtPct(item.dist_sma200_pct)}
      </td>
      <td className={TD}>
        {item.dcf_verdict ? (
          <>
            <span className={VERDICT_TEXT[item.dcf_verdict] ?? "text-faint"}>
              {DCF_ABBR[item.dcf_verdict] ?? item.dcf_verdict}
            </span>
            <span className="ml-1 text-dim">
              {fmtPct(item.dcf_upside_pct, 0)}
            </span>
          </>
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className={`${TD} pr-2 text-dim`}>
        {fmtNum(item.growth_score, 0)}
      </td>
    </tr>
  );
});

export function BlotterView({
  items,
  loading,
  error,
  onSelect,
  keyboardEnabled,
}: {
  items: UniverseItem[] | null;
  loading: boolean;
  error: string | null;
  onSelect: (symbol: string) => void;
  keyboardEnabled: boolean;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "market_cap",
    dir: "desc",
  });
  const [sel, setSel] = useState(0);
  const selRowRef = useRef<HTMLTableRowElement | null>(null);

  const rows = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...(items ?? [])].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulos siempre al final
      if (bv == null) return -1;
      if (typeof av === "string" || typeof bv === "string")
        return dir * String(av).localeCompare(String(bv));
      return dir * (av - bv);
    });
  }, [items, sort]);

  const selIdx = rows.length ? Math.min(sel, rows.length - 1) : -1;

  // Refs espejo para que el listener de teclado se suscriba una sola vez.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const selRef = useRef(sel);
  selRef.current = sel;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!keyboardEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target;
      if (
        el instanceof HTMLElement &&
        el.closest("button, input, textarea, select")
      )
        return;
      const rows = rowsRef.current;
      if (!rows.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => {
          const cur = Math.min(s, rows.length - 1);
          return e.key === "ArrowDown"
            ? Math.min(cur + 1, rows.length - 1)
            : Math.max(cur - 1, 0);
        });
      } else if (e.key === "Enter") {
        const row = rows[Math.min(selRef.current, rows.length - 1)];
        if (row) onSelectRef.current(row.symbol);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboardEnabled]);

  useEffect(() => {
    selRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const handleRowClick = useCallback(
    (index: number, symbol: string) => {
      setSel(index);
      onSelect(symbol);
    },
    [onSelect],
  );

  if (loading) return <TermLoading />;
  if (error) return <TermEmpty>SIN CONEXIÓN — UNIVERSO NO DISPONIBLE</TermEmpty>;
  if (!rows.length)
    return <TermEmpty>UNIVERSO VACÍO — EJECUTA EL JOB «universe»</TermEmpty>;

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "symbol" ? "asc" : "desc" },
    );

  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-[11px]">
      <colgroup>
        <col className="w-[14%]" />
        <col className="w-[12%]" />
        <col className="w-[12%]" />
        <col className="w-[12%]" />
        <col className="w-[10%]" />
        <col className="w-[13%]" />
        <col className="w-[18%]" />
        <col className="w-[9%]" />
      </colgroup>
      <thead>
        <tr>
          {COLS.map((c, i) => (
            <th
              key={c.key}
              onClick={() => toggleSort(c.key)}
              className={`${TH} ${i === 0 ? "pl-2 text-left" : "text-right"} ${
                i === COLS.length - 1 ? "pr-2" : ""
              }`}
            >
              {c.label}
              {sort.key === c.key && (
                <span className="text-amber">
                  {sort.dir === "asc" ? " ▲" : " ▼"}
                </span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((it, i) => (
          <BlotterRow
            key={it.symbol}
            item={it}
            index={i}
            selected={i === selIdx}
            rowRef={i === selIdx ? selRowRef : undefined}
            onRowClick={handleRowClick}
          />
        ))}
      </tbody>
    </table>
  );
}
