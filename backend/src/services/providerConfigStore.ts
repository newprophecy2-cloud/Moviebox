import { env } from "../config/env";
import { dbManager } from "../db/database";
import { StreamDeliveryMode } from "../providers/moviebox/types";

export interface PersistedProviderConfig {
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
}

interface ProviderConfigRow {
  provider_id: string;
  enabled: number;
  api_hosts_json: string;
  media_hosts_json: string;
  request_timeout_ms: number;
  cache_ttl_ms: number;
  stream_proxy_ttl_seconds: number;
  stream_proxy_timeout_ms: number;
  mock_mode: number;
  default_stream_delivery?: string;
  proxy_delivery_enabled?: number;
  direct_delivery_enabled?: number;
  updated_at: string;
  updated_by: string;
}

function safeJsonArray(raw: string, fallback: string[]): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // ignore malformed json
  }
  return [...fallback];
}

export class ProviderConfigStore {
  public getConfig(): PersistedProviderConfig {
    const db = dbManager.getDb();
    const row = db
      .prepare("SELECT * FROM provider_configs WHERE provider_id = ?")
      .get("moviebox") as ProviderConfigRow | undefined;

    if (!row) {
      return {
        provider_id: "moviebox",
        enabled: true,
        api_hosts: [...env.movieboxHosts],
        media_hosts: [...env.movieboxMediaHosts],
        request_timeout_ms: 12_000,
        cache_ttl_ms: env.cacheTtlMs,
        stream_proxy_ttl_seconds: env.streamProxyTtlSeconds,
        stream_proxy_timeout_ms: env.streamProxyTimeoutMs,
        mock_mode: env.isProduction ? false : env.movieboxMockMode,
        default_stream_delivery: env.defaultStreamDelivery,
        proxy_delivery_enabled: true,
        direct_delivery_enabled: true,
        updated_at: new Date().toISOString(),
        updated_by: "system",
      };
    }

    const defaultDelivery: StreamDeliveryMode =
      row.default_stream_delivery === "direct"
        ? "direct"
        : row.default_stream_delivery === "proxy"
        ? "proxy"
        : env.defaultStreamDelivery;

    return {
      provider_id: row.provider_id,
      enabled: row.enabled === 1,
      api_hosts: safeJsonArray(row.api_hosts_json, env.movieboxHosts),
      media_hosts: safeJsonArray(row.media_hosts_json, env.movieboxMediaHosts),
      request_timeout_ms: row.request_timeout_ms,
      cache_ttl_ms: row.cache_ttl_ms,
      stream_proxy_ttl_seconds: row.stream_proxy_ttl_seconds,
      stream_proxy_timeout_ms: row.stream_proxy_timeout_ms,
      // Mock mode is strictly disabled in production regardless of stored value
      mock_mode: env.isProduction ? false : row.mock_mode === 1,
      default_stream_delivery: defaultDelivery,
      proxy_delivery_enabled: row.proxy_delivery_enabled !== 0,
      direct_delivery_enabled: row.direct_delivery_enabled !== 0,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    };
  }

  public updateConfig(
    patch: Partial<{
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
    }>,
    actor: string
  ): PersistedProviderConfig {
    const current = this.getConfig();
    const next: PersistedProviderConfig = {
      ...current,
      enabled: patch.enabled ?? current.enabled,
      api_hosts: patch.api_hosts ?? current.api_hosts,
      media_hosts: patch.media_hosts ?? current.media_hosts,
      request_timeout_ms: patch.request_timeout_ms ?? current.request_timeout_ms,
      cache_ttl_ms: patch.cache_ttl_ms ?? current.cache_ttl_ms,
      stream_proxy_ttl_seconds: patch.stream_proxy_ttl_seconds ?? current.stream_proxy_ttl_seconds,
      stream_proxy_timeout_ms: patch.stream_proxy_timeout_ms ?? current.stream_proxy_timeout_ms,
      mock_mode: env.isProduction ? false : (patch.mock_mode ?? current.mock_mode),
      default_stream_delivery: patch.default_stream_delivery ?? current.default_stream_delivery,
      proxy_delivery_enabled: patch.proxy_delivery_enabled ?? current.proxy_delivery_enabled,
      direct_delivery_enabled: patch.direct_delivery_enabled ?? current.direct_delivery_enabled,
      updated_at: new Date().toISOString(),
      updated_by: actor,
    };

    const db = dbManager.getDb();
    db.prepare(
      `UPDATE provider_configs
       SET enabled = ?,
           api_hosts_json = ?,
           media_hosts_json = ?,
           request_timeout_ms = ?,
           cache_ttl_ms = ?,
           stream_proxy_ttl_seconds = ?,
           stream_proxy_timeout_ms = ?,
           mock_mode = ?,
           default_stream_delivery = ?,
           proxy_delivery_enabled = ?,
           direct_delivery_enabled = ?,
           updated_at = ?,
           updated_by = ?
       WHERE provider_id = ?`
    ).run(
      next.enabled ? 1 : 0,
      JSON.stringify(next.api_hosts),
      JSON.stringify(next.media_hosts),
      next.request_timeout_ms,
      next.cache_ttl_ms,
      next.stream_proxy_ttl_seconds,
      next.stream_proxy_timeout_ms,
      next.mock_mode ? 1 : 0,
      next.default_stream_delivery,
      next.proxy_delivery_enabled ? 1 : 0,
      next.direct_delivery_enabled ? 1 : 0,
      next.updated_at,
      actor,
      "moviebox"
    );

    return next;
  }
}

export const providerConfigStore = new ProviderConfigStore();
