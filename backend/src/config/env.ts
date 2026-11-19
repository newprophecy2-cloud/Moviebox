import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_MOVIEBOX_HOSTS = [
  "https://api6.aoneroom.com",
  "https://api5.aoneroom.com",
  "https://api4.aoneroom.com",
  "https://api4sg.aoneroom.com",
  "https://api3.aoneroom.com",
  "https://api6sg.aoneroom.com",
  "https://api.inmoviebox.com",
];

const DEFAULT_MEDIA_HOSTS = ["aoneroom.com", "inmoviebox.com", "hakunaymatata.com"];
const EPHEMERAL_PROXY_SECRET = `hex:${crypto.randomBytes(32).toString("hex")}`;
const EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString("hex");

// Public protocol compatibility constants derived from MovieBox-Tui (MIT).
// Operators can override every value via server-side environment variables.
const DEFAULT_MOVIEBOX_SIGNING_SECRET =
  "hex:efa891974eecd3148df63aa611602defd101259ba521022c57ae0566bd8e";
const DEFAULT_MOVIEBOX_CERT_SHA256 =
  "03d4b741632d136bc23e2de4c6adcdb7712f1980b619c183221801730bbd0410";
const DEFAULT_MOVIEBOX_BUILD_SALT = "oneroom";
const DEFAULT_MOVIEBOX_USER_AGENT =
  "com.community.oneroom/50020121 (Linux; U; Android 13; en_US; 23078RKD5C; Build/TQ2A.230405.003; Cronet/135.0.7012.3)";
const DEFAULT_MOVIEBOX_CLIENT_INFO = JSON.stringify({
  package_name: "com.community.oneroom",
  version_name: "4.0.01.0813.03",
  version_code: 50020121,
  os: "android",
  os_version: "13",
  install_ch: "ps",
  device_id: "prophecyverse-provider",
  install_store: "ps",
  gaid: "00000000-0000-0000-0000-000000000000",
  brand: "Redmi",
  model: "23078RKD5C",
  system_language: "en",
  net: "NETWORK_WIFI",
  region: "US",
  timezone: "Asia/Dhaka",
  sp_code: "40401",
  "X-Play-Mode": "2",
});

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(raw: string | undefined, fallback: boolean = false): boolean {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

function parseHosts(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [...DEFAULT_MOVIEBOX_HOSTS];
  const valid = raw
    .split(",")
    .map((h) => h.trim().replace(/\/+$/, ""))
    .filter((h) => {
      try {
        const u = new URL(h);
        return u.protocol === "https:";
      } catch {
        return false;
      }
    });
  return valid.length > 0 ? valid : [...DEFAULT_MOVIEBOX_HOSTS];
}

function parseMediaHosts(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [...DEFAULT_MEDIA_HOSTS];
  const valid = raw
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/^\.+/, ""))
    .filter((host) => /^[a-z0-9.-]+$/.test(host) && host.includes("."));
  return valid.length > 0 ? valid : [...DEFAULT_MEDIA_HOSTS];
}

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter((o) => o && o !== "*");
}

function parsePublicBaseUrl(raw: string | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function parseDefaultDeliveryMode(raw: string | undefined): "proxy" | "direct" {
  const normalized = (raw || "").trim().toLowerCase();
  return normalized === "direct" ? "direct" : "proxy";
}

function resolvePort(): number {
  const portArgIdx = process.argv.findIndex((arg) => arg === "--port" || arg === "-p");
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    const parsedArg = Number.parseInt(process.argv[portArgIdx + 1], 10);
    if (Number.isFinite(parsedArg) && parsedArg > 0) {
      return parsedArg;
    }
  }
  const eqArg = process.argv.find((arg) => arg.startsWith("--port="));
  if (eqArg) {
    const parsedEq = Number.parseInt(eqArg.slice("--port=".length), 10);
    if (Number.isFinite(parsedEq) && parsedEq > 0) {
      return parsedEq;
    }
  }
  return parsePositiveInt(process.env.PORT, 3000);
}

export interface ServerEnv {
  nodeEnv: string;
  isProduction: boolean;
  isRender: boolean;
  port: number;
  publicBaseUrl: string | null;
  corsOrigins: string[];
  databaseUrl: string;
  statelessMode: boolean;
  adminUsername: string;
  adminPassword: string;
  adminSessionSecret: string;
  adminSessionTtlSeconds: number;
  movieboxHosts: string[];
  movieboxSigningSecret: string;
  movieboxSigningSecretExplicit: boolean;
  movieboxCertSha256: string;
  movieboxBuildSalt: string;
  movieboxUserAgent: string;
  movieboxClientInfo: string;
  movieboxAuthToken: string;
  movieboxMediaHosts: string[];
  movieboxMockMode: boolean;
  defaultStreamDelivery: "proxy" | "direct";
  streamReferer: string;
  streamProxySecret: string;
  streamProxySecretExplicit: boolean;
  streamProxyTtlSeconds: number;
  streamProxyTimeoutMs: number;
  cacheTtlMs: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export function loadEnv(): ServerEnv {
  const nodeEnv = (process.env.NODE_ENV || "development").trim();
  const isProduction = nodeEnv === "production";
  const isRender = parseBoolean(process.env.RENDER, false) || Boolean(process.env.RENDER_SERVICE_ID);
  const explicitSigningSecret = (process.env.MOVIEBOX_SIGNING_SECRET || "").trim();
  const explicitProxySecret = (
    process.env.PROXY_TOKEN_SECRET ||
    process.env.STREAM_PROXY_SECRET ||
    ""
  ).trim();
  const rawMockMode = parseBoolean(process.env.MOVIEBOX_MOCK_MODE, false);
  const explicitDatabaseUrl = (process.env.DATABASE_URL || "").trim();
  // Keep production stateless in-memory unless an explicit persistent DATABASE_URL is configured
  const databaseUrl = explicitDatabaseUrl || (isProduction ? ":memory:" : "./database/provider.sqlite");
  const statelessMode = databaseUrl === ":memory:";

  const publicBaseUrl =
    parsePublicBaseUrl(process.env.PUBLIC_BASE_URL) ||
    parsePublicBaseUrl(process.env.RENDER_EXTERNAL_URL);

  return {
    nodeEnv,
    isProduction,
    isRender,
    port: resolvePort(),
    publicBaseUrl,
    corsOrigins: parseCorsOrigins(
      process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || process.env.APP_URL
    ),
    databaseUrl,
    statelessMode,
    adminUsername: (process.env.ADMIN_USERNAME || "admin").trim(),
    adminPassword: (process.env.ADMIN_PASSWORD || (isProduction ? "" : "prophecy-admin-dev")).trim(),
    adminSessionSecret: (process.env.ADMIN_SESSION_SECRET || EPHEMERAL_SESSION_SECRET).trim(),
    adminSessionTtlSeconds: parsePositiveInt(process.env.ADMIN_SESSION_TTL_SECONDS, 86_400),
    movieboxHosts: parseHosts(process.env.MOVIEBOX_API_HOSTS),
    movieboxSigningSecret: explicitSigningSecret || DEFAULT_MOVIEBOX_SIGNING_SECRET,
    movieboxSigningSecretExplicit: Boolean(explicitSigningSecret),
    movieboxCertSha256: (
      process.env.MOVIEBOX_CERT_SHA256 || DEFAULT_MOVIEBOX_CERT_SHA256
    ).trim(),
    movieboxBuildSalt: (process.env.MOVIEBOX_BUILD_SALT || DEFAULT_MOVIEBOX_BUILD_SALT).trim(),
    movieboxUserAgent: (
      process.env.MOVIEBOX_USER_AGENT || DEFAULT_MOVIEBOX_USER_AGENT
    ).trim(),
    movieboxClientInfo: (
      process.env.MOVIEBOX_CLIENT_INFO || DEFAULT_MOVIEBOX_CLIENT_INFO
    ).trim(),
    movieboxAuthToken: (process.env.MOVIEBOX_AUTH_TOKEN || "").trim(),
    movieboxMediaHosts: parseMediaHosts(process.env.MOVIEBOX_MEDIA_HOSTS),
    movieboxMockMode: isProduction ? false : rawMockMode,
    defaultStreamDelivery: parseDefaultDeliveryMode(process.env.DEFAULT_STREAM_DELIVERY),
    streamReferer: (process.env.MOVIEBOX_STREAM_REFERER || "").trim(),
    streamProxySecret: explicitProxySecret || explicitSigningSecret || EPHEMERAL_PROXY_SECRET,
    streamProxySecretExplicit: Boolean(explicitProxySecret),
    streamProxyTtlSeconds: parsePositiveInt(
      process.env.PROXY_TOKEN_TTL_SECONDS || process.env.STREAM_PROXY_TTL_SECONDS,
      900
    ),
    streamProxyTimeoutMs: parsePositiveInt(process.env.STREAM_PROXY_TIMEOUT_MS, 30_000),
    cacheTtlMs: parsePositiveInt(process.env.MOVIEBOX_CACHE_TTL_MS, 5 * 60 * 1000),
    rateLimitWindowMs: parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
    rateLimitMaxRequests: parsePositiveInt(process.env.RATE_LIMIT_MAX_REQUESTS, 120),
  };
}

export const env = loadEnv();

export function maskSecretIndicator(value: string, explicit: boolean): {
  configured: boolean;
  source: "environment" | "protocol_default" | "ephemeral" | "unset";
  preview: string | null;
} {
  if (!value) {
    return { configured: false, source: "unset", preview: null };
  }
  const tail = value.length > 4 ? value.slice(-4) : "****";
  return {
    configured: true,
    source: explicit ? "environment" : value === EPHEMERAL_PROXY_SECRET ? "ephemeral" : "protocol_default",
    preview: `••••${tail}`,
  };
}
