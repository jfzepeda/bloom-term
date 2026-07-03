import type {
  AgentJobsStatusResponse,
  AlertsResponse,
  ObserverReport,
  RefreshResponse,
  ScreenLevel,
  ScreenResponse,
  TickerDetailResponse,
  UniverseResponse,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, "No se pudo conectar con la API");
  }
  if (!res.ok) {
    throw new ApiError(res.status, `Error ${res.status} al pedir ${url}`);
  }
  return (await res.json()) as T;
}

export function getUniverse(): Promise<UniverseResponse> {
  return fetchJson<UniverseResponse>("/api/universe");
}

export function getScreen(level: ScreenLevel): Promise<ScreenResponse> {
  return fetchJson<ScreenResponse>(`/api/screens/${level}`);
}

export function getAlerts(
  params: { since?: string; severity?: string; status?: string; limit?: number } = {},
): Promise<AlertsResponse> {
  const qs = new URLSearchParams();
  if (params.since) qs.set("since", params.since);
  if (params.severity) qs.set("severity", params.severity);
  if (params.status) qs.set("status", params.status);
  if (params.limit != null) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return fetchJson<AlertsResponse>(`/api/alerts${suffix}`);
}

export function getTicker(symbol: string): Promise<TickerDetailResponse> {
  return fetchJson<TickerDetailResponse>(`/api/tickers/${encodeURIComponent(symbol)}`);
}

export function getObserverLatest(): Promise<ObserverReport> {
  return fetchJson<ObserverReport>("/api/observer/latest");
}

export function getAgentJobsStatus(): Promise<AgentJobsStatusResponse> {
  return fetchJson<AgentJobsStatusResponse>("/api/agent-jobs/status");
}

export function triggerRefresh(job: string): Promise<RefreshResponse> {
  return fetchJson<RefreshResponse>(`/api/admin/refresh/${encodeURIComponent(job)}`, {
    method: "POST",
  });
}
