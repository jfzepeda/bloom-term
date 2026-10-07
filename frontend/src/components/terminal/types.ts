export type MarketTab = "mov" | "val" | "grw" | "mapa";

export const MARKET_TABS: MarketTab[] = ["mov", "val", "grw", "mapa"];

export const MARKET_TAB_LABEL: Record<MarketTab, string> = {
  mov: "MOV",
  val: "VAL",
  grw: "GRW",
  mapa: "MAPA",
};
