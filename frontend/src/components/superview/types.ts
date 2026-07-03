export interface TickerRowItem {
  symbol: string;
  priceDisplay: string;
  pctDisplay: string;
  pctCls: string;
}

export interface SectorAgg {
  name: string;
  avgPct: number;
  count: number;
}

export interface ModalRow {
  label: string;
  value: string;
}

export interface ModalState {
  title: string;
  subtitle: string;
  rows: ModalRow[];
  note: string;
}
