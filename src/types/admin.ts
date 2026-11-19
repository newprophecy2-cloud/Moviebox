export type AdminRole = "super_admin" | "admin" | "operator" | "viewer";
export type StreamDeliveryMode = "proxy" | "direct";

export interface StreamResolverTelemetry {
  last_resolver_status: "idle" | "resolved" | "error";
  last_resolved_at: string | null;
  last_media_id: string | null;
  last_delivery_mode: StreamDeliveryMode | null;
  direct_url_availability: "unverified" | "available" | "unavailable";
  direct_url_reason: string;
  last_error_code: string | null;
  last_error_message: string | null;
  total_resolutions: number;
  proxy_resolutions: number;
  direct_resolutions: number;
  direct_unavailable_count: number;
}

export interface AdminUserSession {
  userId: string;
  username: string;
  role: AdminRole;
  expiresAt: string;
}

export interface ApiErrorPayload {
  status: "error";
  code: string;
  message: string;
  retryable: boolean;
  request_id?: string;
}

export interface ApiSuccessPayload<T> {
  status: "success";
  data: T;
}

export interface TimedApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  durationMs: number;
  url: string;
  requestId: string | null;
  body: T | ApiErrorPayload;
}

export interface HealthCheckRecord {
  id?: number;
  provider_id: string;
  status: "connected" | "degraded" | "disabled" | "mock_mode" | "error";
  latency_ms: number | null;
  active_host: string | null;
  session_valid: boolean;
  error_code: string | null;
  message: string | null;
  checked_at: string;
}

export interface CacheStats {
  entries: number;
  maxEntries: number;
  inflight: number;
  hits: number;
  misses: number;
  hitRate: number;
  lastClearedAt: string | null;
}

export interface OverviewData {
  backend: {
    status: string;
    environment: string;
    uptime_seconds: number;
    database: {
      engine: "sqlite";
      path: string;
      connected: boolean;
      migrationsApplied: string[];
    };
  };
  provider: {
    id: string;
    status: "enabled" | "disabled" | "mock_mode" | "unconfigured";
    enabled: boolean;
    configured: boolean;
    mock_mode: boolean;
    active_host: string | null;
    host_count: number;
    auth_mode: string;
    last_successful_request: string | null;
    last_health_check: HealthCheckRecord | null;
    last_error: { code: string; message: string; at: string } | null;
  };
  requests: {
    search_count: number;
    details_count: number;
    episodes_count: number;
    stream_count: number;
    total_public_requests: number;
    success_count: number;
    error_count: number;
    success_rate: number;
    error_rate: number;
  };
  stream_delivery?: {
    default_mode: StreamDeliveryMode;
    proxy_enabled: boolean;
    direct_enabled: boolean;
    telemetry: StreamResolverTelemetry;
  };
  cache: CacheStats;
  recent_errors: Array<{
    id: number;
    request_id: string;
    route_type: string;
    path: string;
    status_code: number;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
  }>;
}

export interface ProviderDetailsData {
  name: string;
  provider_id: string;
  enabled: boolean;
  mock_mode: boolean;
  connection_status: string;
  host_configuration: {
    active_host: string | null;
    hosts: string[];
    media_hosts: string[];
    https_only: boolean;
  };
  session: {
    hasSession: boolean;
    sessionValid: boolean;
    expiresAt: string | null;
    userIdPresent: boolean;
  };
  auth_diagnostics: {
    signingSecretConfigured: boolean;
    signingSecretValid: boolean;
    signingSecretFormat: string;
    authTokenConfigured: boolean;
    authTokenValidFormat: boolean;
    buildTagConfigured: boolean;
    clientInfoConfigured: boolean;
    clientInfoValidJson: boolean;
    customUserAgentConfigured: boolean;
    hostCount: number;
    authMode: string;
    missingRequirements: string[];
  };
  last_successful_check: string | null;
  last_check: HealthCheckRecord | null;
  last_error: { code: string; message: string; at: string } | null;
  stream_delivery?: {
    default_mode: StreamDeliveryMode;
    proxy_enabled: boolean;
    direct_enabled: boolean;
    telemetry: StreamResolverTelemetry;
  };
  capabilities: Array<{ id: string; label: string; supported: boolean }>;
  health_history: HealthCheckRecord[];
}

export interface SecretIndicator {
  configured: boolean;
  source: "environment" | "protocol_default" | "ephemeral" | "unset";
  preview: string | null;
}

export interface ProviderConfigData {
  config: {
    provider_id: string;
    enabled: boolean;
    api_hosts: string[];
    media_hosts: string[];
    request_timeout_ms: number;
    cache_ttl_ms: number;
    stream_proxy_ttl_seconds: number;
    stream_proxy_timeout_ms: number;
    mock_mode: boolean;
    default_stream_delivery: StreamDeliveryMode;
    proxy_delivery_enabled: boolean;
    direct_delivery_enabled: boolean;
    updated_at: string;
    updated_by: string;
  };
  production_lock: boolean;
  public_base_url: string | null;
  stream_delivery_telemetry: StreamResolverTelemetry;
  stream_error_logs: Array<Record<string, unknown>>;
  secrets: {
    moviebox_signing_secret: SecretIndicator;
    moviebox_auth_token: SecretIndicator;
    stream_proxy_secret: SecretIndicator;
    moviebox_cert_sha256: SecretIndicator;
    moviebox_build_salt: SecretIndicator;
  };
}

export interface SearchResultItem {
  id: string;
  provider: "moviebox";
  title: string;
  media_type: "movie" | "series";
  year: string | null;
  poster: string | null;
  season_count: number | null;
  rating: string | null;
  genres: string[];
}

export interface SearchResponseData {
  query: string;
  page: number;
  has_more: boolean;
  total_results: number | null;
  results: SearchResultItem[];
}

export interface SeriesDetailsData {
  id: string;
  provider: "moviebox";
  media_type: "series";
  title: string;
  original_title: string | null;
  description: string | null;
  year: string | null;
  poster: string | null;
  backdrop: string | null;
  rating: string | null;
  genres: string[];
  seasons: Array<{ season_number: number; episode_count: number }>;
  audio_languages: string[];
}

export interface MovieDetailsData {
  id: string;
  provider: "moviebox";
  media_type: "movie";
  title: string;
  original_title: string | null;
  description: string | null;
  year: string | null;
  poster: string | null;
  backdrop: string | null;
  rating: string | null;
  duration: string | null;
  genres: string[];
  audio_languages: string[];
}

export type MediaDetailsData = SeriesDetailsData | MovieDetailsData;

export interface EpisodeItem {
  id: string;
  provider_episode_id: string | null;
  series_id: string;
  season_number: number;
  episode_number: number;
  title: string;
  overview: string | null;
  thumbnail: string | null;
  duration: string | null;
}

export interface EpisodesResponseData {
  series_id: string;
  season: number | null;
  total_episodes: number;
  episodes: EpisodeItem[];
}

export interface StreamVariant {
  id: string;
  resource_id: string | null;
  provider_resource_id: string | null;
  delivery_mode: StreamDeliveryMode;
  quality: string;
  resolution: number;
  format: "mp4" | "hls" | "dash" | "unknown";
  codec: string | null;
  language: string | null;
  size_bytes: number | null;
  stream_url: string;
  browser_compatible: boolean;
  expires_at: string | null;
}

export interface UnifiedStreamData {
  media_type: "movie" | "episode";
  media_id: string;
  delivery_mode: StreamDeliveryMode;
  series_id?: string;
  season_number?: number;
  episode_number?: number;
  stream: StreamVariant & {
    audio_tracks: Array<{
      subject_id: string;
      language: string;
      label: string;
      language_code: string | null;
    }>;
    subtitles: Array<{
      id: string;
      name: string;
      language_code: string | null;
      format: string;
      url: string;
    }>;
  };
  streams: StreamVariant[];
}
