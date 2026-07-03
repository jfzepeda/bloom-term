// Tipos que espejan EXACTAMENTE el contrato de la API REST.
// Fechas "YYYY-MM-DD"; datetimes ISO 8601.
// Fundamentals en FRACCIÓN (0.15 = 15%); técnicos/DCF en PORCENTAJE (-35.2).

export interface UniverseItem {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  is_nasdaq100: boolean;
  last_close: number | null;
  change_pct_1d: number | null;
  drawdown_from_ath_pct: number | null;
  rally_from_low_pct: number | null;
  rsi14: number | null;
  dist_sma200_pct: number | null;
  dcf_verdict: string | null;
  dcf_upside_pct: number | null;
  growth_score: number | null;
}

export interface UniverseResponse {
  items: UniverseItem[];
  total: number;
}

export type ScreenLevel = "value" | "growth" | "event";

export interface ScreenItem {
  symbol: string | null;
  name?: string | null;
  sector?: string | null;
  score: number | null;
  rank: number | null;
  details: Record<string, any> | null;
}

export interface ScreenResponse {
  as_of: string | null;
  items: ScreenItem[];
}

// details de los items del screen "event"
export interface EventDetails {
  thesis: string;
  category: string;
  tickers: string[];
  confidence: string;
  horizon: string;
  invalidation: string;
}

export interface AgentAnalysis {
  bullets: string[];
  interpretation: string;
  severity: string;
  fundamentals_intact: boolean | null;
  cause_identified: boolean;
}

export interface AlertItem {
  id: number;
  symbol: string | null;
  kind: string;
  severity: string;
  title: string;
  payload: Record<string, any> | null;
  status: string;
  agent_analysis: AgentAnalysis | null;
  created_at: string;
}

export interface AlertsResponse {
  items: AlertItem[];
}

export interface TickerInfo {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  is_nasdaq100: boolean;
}

export interface PricePoint {
  date: string;
  close: number;
  volume: number | null;
}

// Columnas de technical_snapshots. Distancias en PORCENTAJE.
export interface Technicals {
  symbol: string;
  as_of: string;
  last_close: number | null;
  change_pct_1d: number | null;
  ath: number | null;
  drawdown_from_ath_pct: number | null;
  low_52w: number | null;
  high_52w: number | null;
  rally_from_low_pct: number | null;
  support: number | null;
  resistance: number | null;
  rsi14: number | null;
  sma200: number | null;
  dist_sma200_pct: number | null;
}

// Columnas planas de fundamentals, SIN raw. Ratios en FRACCIÓN.
export interface FundamentalsFlat {
  symbol: string;
  as_of: string;
  pe: number | null;
  peg: number | null;
  roe_ttm: number | null;
  roe_avg_4y: number | null;
  debt_to_equity: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  operating_margin_trend: number | null;
  interest_coverage: number | null;
  fcf_ttm: number | null;
  fcf_margin_ttm: number | null;
  fcf_positive_years_4y: number | null;
  fcf_cagr_5y: number | null;
  revenue_ttm: number | null;
  revenue_growth_ttm: number | null;
  net_debt: number | null;
  shares_diluted: number | null;
}

export interface DcfInfo {
  as_of: string;
  intrinsic_value: number | null;
  price_at_calc: number | null;
  upside_pct: number | null;
  verdict: string;
  assumptions: Record<string, any> | null;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string | null;
  published_at: string | null;
}

export interface TickerDetailResponse {
  ticker: TickerInfo;
  prices: PricePoint[];
  technicals: Technicals | null;
  fundamentals: FundamentalsFlat | null;
  dcf: DcfInfo | null;
  news: NewsItem[];
  alerts: AlertItem[];
}

export interface ObserverReport {
  report_date: string;
  markdown: string;
  recommendations: unknown[] | null;
}

export interface RefreshResponse {
  status: string;
  job: string;
}

export interface AgentJobCounts {
  pending: number;
  running: number;
  done: number;
  error: number;
  skipped: number;
}

export interface AgentJobRecent {
  id: number;
  kind: string;
  status: string;
  symbol: string | null;
  updated_at: string | null;
}

export interface AgentJobsStatusResponse {
  counts: AgentJobCounts;
  recent: AgentJobRecent[];
}
