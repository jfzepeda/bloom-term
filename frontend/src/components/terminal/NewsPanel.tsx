import { useState } from "react";
import { getNews } from "../../api";
import { fmtRelative } from "../../format";
import { usePoll } from "./hooks";
import { Panel, PanelTab, TermEmpty, TermLoading } from "./Panel";

const POLL_MS = 120_000;

type NewsTab = "todas" | "macro" | "emp";

const TABS: NewsTab[] = ["todas", "macro", "emp"];

const TAB_LABEL: Record<NewsTab, string> = {
  todas: "TODAS",
  macro: "MACRO",
  emp: "EMPRESAS",
};

const EMPTY_LABEL: Record<NewsTab, string> = {
  todas: "SIN TITULARES",
  macro: "SIN TITULARES MACRO",
  emp: "SIN TITULARES DE EMPRESAS",
};

/**
 * Panel NOTICIAS — feed global de titulares (macro + empresas).
 *
 * Contrato:
 * - Datos: getNews({ macroOnly, limit: 80 }) con polling cada 120s;
 *   MACRO refetchea en el servidor, EMPRESAS filtra en memoria sobre TODAS.
 * - Pestañas en cabecera: TODAS / MACRO / EMPRESAS.
 * - Cada ítem: hora relativa, fuente, símbolo (chip ámbar clicable → onSelect)
 *   o etiqueta MACRO, título; enlace externo al abrir (target _blank).
 */
export function NewsPanel({
  onSelect,
  className = "",
}: {
  onSelect: (symbol: string) => void;
  className?: string;
}) {
  const [tab, setTab] = useState<NewsTab>("todas");

  const { data, error } = usePoll(
    () => getNews({ macroOnly: tab === "macro", limit: 80 }),
    POLL_MS,
    [tab],
  );
  const items = data?.items ?? null;

  const visible =
    items == null
      ? []
      : tab === "emp"
        ? items.filter((n) => n.symbol != null)
        : items;

  const right = (
    <>
      {error && items != null && (
        <span className="text-[8px] font-semibold tracking-[0.14em] text-down">
          SIN CONEXIÓN
        </span>
      )}
      {TABS.map((t) => (
        <PanelTab key={t} active={tab === t} onClick={() => setTab(t)}>
          {TAB_LABEL[t]}
        </PanelTab>
      ))}
    </>
  );

  let body;
  if (items == null && !error) {
    body = <TermLoading />;
  } else if (items == null) {
    body = <TermEmpty>SIN CONEXIÓN — REINTENTANDO CADA 120s</TermEmpty>;
  } else if (visible.length === 0) {
    body = <TermEmpty>{EMPTY_LABEL[tab]}</TermEmpty>;
  } else {
    body = visible.map((n) => (
      <div
        key={`${n.url}-${n.symbol ?? "macro"}`}
        className="flex items-start gap-2 border-b border-hair-soft px-2 py-[3px] hover:bg-crt-2"
      >
        <span className="w-20 shrink-0 truncate text-[9px] leading-4 text-faint">
          {fmtRelative(n.published_at)}
        </span>
        {n.symbol ? (
          <button
            type="button"
            onClick={() => onSelect(n.symbol!)}
            className="w-14 shrink-0 cursor-pointer truncate text-left text-[10px] font-semibold text-amber hover:text-glow"
          >
            {n.symbol}
          </button>
        ) : (
          <span className="w-14 shrink-0 text-[10px] tracking-[0.12em] text-ghost">
            MACRO
          </span>
        )}
        <a
          href={n.url}
          target="_blank"
          rel="noreferrer"
          className="line-clamp-2 min-w-0 flex-1 cursor-pointer text-left text-[11px] leading-4 text-dim no-underline hover:text-glow"
        >
          {n.title}
        </a>
        {n.source && (
          <span className="max-w-24 shrink-0 truncate text-right text-[9px] leading-4 text-ghost">
            {n.source}
          </span>
        )}
      </div>
    ));
  }

  return (
    <Panel code="NOT" title="Noticias" right={right} className={className}>
      {body}
    </Panel>
  );
}
