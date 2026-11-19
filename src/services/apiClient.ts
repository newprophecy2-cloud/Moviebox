import {
  AdminUserSession,
  ApiErrorPayload,
  ApiSuccessPayload,
  CacheStats,
  EpisodesResponseData,
  HealthCheckRecord,
  MediaDetailsData,
  OverviewData,
  ProviderConfigData,
  ProviderDetailsData,
  SearchResponseData,
  TimedApiResponse,
  UnifiedStreamData,
} from "../types/admin";

export class ApiClientError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly retryable: boolean;
  public readonly requestId?: string;

  constructor(payload: Partial<ApiErrorPayload>, status: number) {
    super(payload.message || `HTTP ${status}`);
    this.code = payload.code || "REQUEST_FAILED";
    this.status = status;
    this.retryable = Boolean(payload.retryable);
    this.requestId = payload.request_id;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  const data = (await res.json()) as ApiSuccessPayload<T> | ApiErrorPayload;
  if (!res.ok || data.status === "error") {
    throw new ApiClientError(data as ApiErrorPayload, res.status);
  }
  return (data as ApiSuccessPayload<T>).data;
}

export async function timedPublicFetch<T>(url: string): Promise<TimedApiResponse<T>> {
  const start = performance.now();
  const res = await fetch(url, { credentials: "include" });
  const durationMs = Math.round(performance.now() - start);
  const requestId = res.headers.get("x-request-id");
  const body = (await res.json()) as T | ApiErrorPayload;
  return {
    ok: res.ok,
    status: res.status,
    durationMs,
    url,
    requestId,
    body,
  };
}

export const adminApi = {
  // Auth
  me: () => requestJson<{ user: AdminUserSession }>("/api/admin/auth/me"),
  login: (username: string, password: string) =>
    requestJson<{ user: AdminUserSession }>("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () =>
    requestJson<{ logged_out: boolean }>("/api/admin/auth/logout", {
      method: "POST",
    }),

  // Dashboard & Provider
  getOverview: () => requestJson<OverviewData>("/api/admin/overview"),
  getProvider: () => requestJson<ProviderDetailsData>("/api/admin/provider"),
  enableProvider: () =>
    requestJson<{ enabled: boolean }>("/api/admin/provider/enable", { method: "POST" }),
  disableProvider: () =>
    requestJson<{ enabled: boolean }>("/api/admin/provider/disable", { method: "POST" }),
  testProvider: () =>
    requestJson<HealthCheckRecord>("/api/admin/provider/test", { method: "POST" }),
  refreshHealth: () =>
    requestJson<HealthCheckRecord>("/api/admin/provider/health/refresh", { method: "POST" }),
  clearCache: () =>
    requestJson<CacheStats>("/api/admin/provider/cache/clear", { method: "POST" }),

  // Config
  getConfig: () => requestJson<ProviderConfigData>("/api/admin/config"),
  updateConfig: (patch: Record<string, unknown>) =>
    requestJson<ProviderConfigData>("/api/admin/config", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),

  // Playback proxy verification
  verifyProxyUrl: (streamUrl: string) =>
    requestJson<{
      token_valid: boolean;
      expired: boolean;
      error_code: string | null;
      expires_at: string | null;
      kind: string | null;
    }>("/api/admin/playback/verify-proxy", {
      method: "POST",
      body: JSON.stringify({ stream_url: streamUrl }),
    }),

  // Logs & System
  getLogs: (category: string, requestId?: string, limit: number = 100) => {
    const params = new URLSearchParams({ category, limit: String(limit) });
    if (requestId?.trim()) params.set("request_id", requestId.trim());
    return requestJson<{ category: string; total: number; items: Array<Record<string, unknown>> }>(
      `/api/admin/logs?${params.toString()}`
    );
  },
  getSystem: () => requestJson<Record<string, unknown>>("/api/admin/system"),
  changePassword: (currentPassword: string, newPassword: string) =>
    requestJson<{ updated: boolean }>("/api/admin/system/password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  listUsers: () =>
    requestJson<{
      users: Array<{
        id: string;
        username: string;
        role: string;
        active: boolean;
        created_at: string;
        last_login_at: string | null;
      }>;
    }>("/api/admin/system/users"),
  createUser: (username: string, password: string, role: string) =>
    requestJson<{ user: { id: string; username: string; role: string } }>("/api/admin/system/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    }),
};

// Public 4 API route callers for Inspector, Episodes, Playback, and API Tester
export const publicApi = {
  search: (q: string, page: number = 1, type: "all" | "movie" | "series" = "all") => {
    const params = new URLSearchParams({ q, page: String(page), type });
    return timedPublicFetch<ApiSuccessPayload<SearchResponseData>>(
      `/api/v1/search?${params.toString()}`
    );
  },
  details: (id: string) =>
    timedPublicFetch<ApiSuccessPayload<MediaDetailsData>>(
      `/api/v1/details/${encodeURIComponent(id)}`
    ),
  episodes: (id: string, season?: number) => {
    const query = season !== undefined ? `?season=${season}` : "";
    return timedPublicFetch<ApiSuccessPayload<EpisodesResponseData>>(
      `/api/v1/details/${encodeURIComponent(id)}/episodes${query}`
    );
  },
  stream: (id: string, refresh: boolean = false, delivery?: "proxy" | "direct") => {
    const params = new URLSearchParams();
    if (refresh) params.set("refresh", "1");
    if (delivery) params.set("delivery", delivery);
    const query = params.toString();
    return timedPublicFetch<ApiSuccessPayload<UnifiedStreamData>>(
      `/api/v1/stream/${encodeURIComponent(id)}${query ? `?${query}` : ""}`
    );
  },
};
