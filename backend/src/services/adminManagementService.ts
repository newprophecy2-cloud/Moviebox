import crypto from "crypto";
import { env, maskSecretIndicator } from "../config/env";
import { dbManager, hashPassword, verifyPassword } from "../db/database";
import { movieBoxClient } from "../providers/moviebox/client";
import { MovieBoxError } from "../providers/moviebox/errors";
import { cacheService } from "./cacheService";
import { loggingService } from "./loggingService";
import { playbackService } from "./playbackService";
import { PersistedProviderConfig, providerConfigStore } from "./providerConfigStore";
import { providerHealthService } from "./providerHealthService";

export type AdminRole = "super_admin" | "admin" | "operator" | "viewer";

export interface AdminUserRecord {
  id: string;
  username: string;
  role: AdminRole;
  active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface AdminSessionContext {
  userId: string;
  username: string;
  role: AdminRole;
  expiresAt: string;
}

function hashSessionToken(rawToken: string): string {
  return crypto
    .createHmac("sha256", env.adminSessionSecret)
    .update(rawToken)
    .digest("hex");
}

export class AdminManagementService {
  public login(username: string, password: string): {
    token: string;
    user: AdminSessionContext;
  } {
    const db = dbManager.getDb();
    const row = db
      .prepare("SELECT * FROM admin_users WHERE username = ? AND active = 1")
      .get(username.trim()) as
      | {
          id: string;
          username: string;
          password_hash: string;
          role: AdminRole;
          active: number;
        }
      | undefined;

    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new MovieBoxError("UNAUTHORIZED", "Invalid administrator credentials.", 401, false);
    }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashSessionToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + env.adminSessionTtlSeconds * 1000).toISOString();

    db.prepare(
      `INSERT INTO admin_sessions (token_hash, user_id, username, role, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(tokenHash, row.id, row.username, row.role, expiresAt, now.toISOString());

    db.prepare("UPDATE admin_users SET last_login_at = ? WHERE id = ?").run(
      now.toISOString(),
      row.id
    );

    loggingService.recordAudit({
      actor: row.username,
      role: row.role,
      action: "ADMIN_LOGIN",
      target: "admin_session",
    });

    return {
      token: rawToken,
      user: {
        userId: row.id,
        username: row.username,
        role: row.role,
        expiresAt,
      },
    };
  }

  public validateSession(rawToken: string | undefined): AdminSessionContext | null {
    if (!rawToken || !rawToken.trim()) return null;
    const db = dbManager.getDb();
    const tokenHash = hashSessionToken(rawToken.trim());
    const row = db
      .prepare(
        `SELECT s.user_id, s.username, s.role, s.expires_at, u.active
         FROM admin_sessions s
         JOIN admin_users u ON u.id = s.user_id
         WHERE s.token_hash = ?`
      )
      .get(tokenHash) as
      | {
          user_id: string;
          username: string;
          role: AdminRole;
          expires_at: string;
          active: number;
        }
      | undefined;

    if (!row || row.active !== 1) return null;
    if (Date.parse(row.expires_at) <= Date.now()) {
      db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash);
      return null;
    }

    return {
      userId: row.user_id,
      username: row.username,
      role: row.role,
      expiresAt: row.expires_at,
    };
  }

  public logout(rawToken: string | undefined, actor?: AdminSessionContext): void {
    if (!rawToken) return;
    const db = dbManager.getDb();
    db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(
      hashSessionToken(rawToken.trim())
    );
    if (actor) {
      loggingService.recordAudit({
        actor: actor.username,
        role: actor.role,
        action: "ADMIN_LOGOUT",
        target: "admin_session",
      });
    }
  }

  public getOverview() {
    const config = providerConfigStore.getConfig();
    const runtime = movieBoxClient.getRuntimeStatus();
    const authDiag = movieBoxClient.getAuthDiagnostics();
    const metrics = loggingService.getOverviewMetrics();
    const cache = cacheService.getStats();
    const latestCheck = providerHealthService.getLatestCheck();

    let providerStatus: "enabled" | "disabled" | "mock_mode" | "unconfigured" = "enabled";
    if (!config.enabled) {
      providerStatus = "disabled";
    } else if (runtime.mockMode) {
      providerStatus = "mock_mode";
    } else if (!movieBoxClient.isConfigured()) {
      providerStatus = "unconfigured";
    }

    return {
      backend: {
        status: "healthy",
        environment: env.nodeEnv,
        uptime_seconds: Math.floor(process.uptime()),
        database: dbManager.getStatus(),
      },
      provider: {
        id: "moviebox",
        status: providerStatus,
        enabled: config.enabled,
        configured: movieBoxClient.isConfigured(),
        mock_mode: runtime.mockMode,
        active_host: runtime.activeHost,
        host_count: runtime.hostCount,
        auth_mode: authDiag.authMode,
        last_successful_request: runtime.lastSuccessAt || metrics.lastSuccessfulProviderAt,
        last_health_check: latestCheck,
        last_error: runtime.lastError,
      },
      requests: {
        search_count: metrics.routeCounts.search,
        details_count: metrics.routeCounts.details,
        episodes_count: metrics.routeCounts.episodes,
        stream_count: metrics.routeCounts.stream,
        total_public_requests: metrics.totalPublicRequests,
        success_count: metrics.successCount,
        error_count: metrics.errorCount,
        success_rate: metrics.successRate,
        error_rate: metrics.errorRate,
      },
      stream_delivery: {
        default_mode: config.default_stream_delivery,
        proxy_enabled: config.proxy_delivery_enabled,
        direct_enabled: config.direct_delivery_enabled,
        telemetry: playbackService.getResolverTelemetry(),
      },
      cache,
      recent_errors: metrics.recentErrors,
    };
  }

  public getProviderDetails() {
    const config = providerConfigStore.getConfig();
    const runtime = movieBoxClient.getRuntimeStatus();
    const authDiag = movieBoxClient.getAuthDiagnostics();
    const latestCheck = providerHealthService.getLatestCheck();
    const history = providerHealthService.getHistory(15);

    return {
      name: "MovieBox Provider",
      provider_id: "moviebox",
      enabled: config.enabled,
      mock_mode: runtime.mockMode,
      connection_status: !config.enabled
        ? "disabled"
        : runtime.mockMode
        ? "mock_mode"
        : latestCheck?.status ?? "unchecked",
      host_configuration: {
        active_host: runtime.activeHost,
        hosts: config.api_hosts,
        media_hosts: config.media_hosts,
        https_only: true,
      },
      session: runtime.session,
      auth_diagnostics: authDiag,
      last_successful_check: latestCheck?.status === "connected" ? latestCheck.checked_at : runtime.lastSuccessAt,
      last_check: latestCheck,
      last_error: runtime.lastError,
      stream_delivery: {
        default_mode: config.default_stream_delivery,
        proxy_enabled: config.proxy_delivery_enabled,
        direct_enabled: config.direct_delivery_enabled,
        telemetry: playbackService.getResolverTelemetry(),
      },
      capabilities: [
        { id: "search", label: "Catalog Search (Movies & Series)", supported: true },
        { id: "details", label: "Subject Details & Season Metadata", supported: true },
        { id: "episodes", label: "Series Season & Episode Enumeration", supported: true },
        { id: "unified_stream", label: "Unified Stream Resolver (Proxy & Authorized Direct)", supported: true },
        { id: "subtitles", label: "External Captions & Language Normalization", supported: true },
        { id: "stream_proxy", label: "Signed Same-Origin HLS/DASH/MP4 Proxy", supported: true },
      ],
      health_history: history,
    };
  }

  public setProviderEnabled(enabled: boolean, actor: AdminSessionContext): PersistedProviderConfig {
    const updated = providerConfigStore.updateConfig({ enabled }, actor.username);
    loggingService.recordAudit({
      actor: actor.username,
      role: actor.role,
      action: enabled ? "PROVIDER_ENABLED" : "PROVIDER_DISABLED",
      target: "moviebox",
    });
    return updated;
  }

  public getConfigView() {
    const config = providerConfigStore.getConfig();
    return {
      config,
      production_lock: env.isProduction,
      public_base_url: env.publicBaseUrl,
      stream_delivery_telemetry: playbackService.getResolverTelemetry(),
      stream_error_logs: loggingService.queryLogs({
        category: "stream_errors",
        limit: 20,
      }),
      secrets: {
        moviebox_signing_secret: maskSecretIndicator(
          env.movieboxSigningSecret,
          env.movieboxSigningSecretExplicit
        ),
        moviebox_auth_token: maskSecretIndicator(
          env.movieboxAuthToken,
          Boolean(env.movieboxAuthToken)
        ),
        stream_proxy_secret: maskSecretIndicator(
          env.streamProxySecret,
          env.streamProxySecretExplicit
        ),
        moviebox_cert_sha256: maskSecretIndicator(
          env.movieboxCertSha256,
          Boolean(process.env.MOVIEBOX_CERT_SHA256)
        ),
        moviebox_build_salt: maskSecretIndicator(
          env.movieboxBuildSalt,
          Boolean(process.env.MOVIEBOX_BUILD_SALT)
        ),
      },
    };
  }

  public updateConfig(
    patch: Parameters<typeof providerConfigStore.updateConfig>[0],
    actor: AdminSessionContext
  ) {
    if (env.isProduction && patch.mock_mode === true) {
      throw new MovieBoxError(
        "INVALID_INPUT",
        "Mock mode cannot be enabled in production environment.",
        400,
        false
      );
    }

    const updated = providerConfigStore.updateConfig(patch, actor.username);
    cacheService.clear();
    loggingService.recordAudit({
      actor: actor.username,
      role: actor.role,
      action: "CONFIG_UPDATED",
      target: "moviebox",
      details: {
        enabled: updated.enabled,
        api_hosts_count: updated.api_hosts.length,
        media_hosts_count: updated.media_hosts.length,
        request_timeout_ms: updated.request_timeout_ms,
        cache_ttl_ms: updated.cache_ttl_ms,
        stream_proxy_ttl_seconds: updated.stream_proxy_ttl_seconds,
        mock_mode: updated.mock_mode,
        default_stream_delivery: updated.default_stream_delivery,
        proxy_delivery_enabled: updated.proxy_delivery_enabled,
        direct_delivery_enabled: updated.direct_delivery_enabled,
      },
    });
    return this.getConfigView();
  }

  public clearCache(actor: AdminSessionContext) {
    const before = cacheService.getStats();
    cacheService.clear();
    loggingService.recordAudit({
      actor: actor.username,
      role: actor.role,
      action: "CACHE_CLEARED",
      target: "catalog_playback_cache",
      details: { cleared_entries: before.entries },
    });
    return cacheService.getStats();
  }

  public changeOwnPassword(
    actor: AdminSessionContext,
    currentPassword: string,
    newPassword: string
  ): void {
    const db = dbManager.getDb();
    const row = db
      .prepare("SELECT password_hash FROM admin_users WHERE id = ?")
      .get(actor.userId) as { password_hash: string } | undefined;

    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
      throw new MovieBoxError("UNAUTHORIZED", "Current password is incorrect.", 401, false);
    }
    if (newPassword.length < 8) {
      throw new MovieBoxError(
        "INVALID_INPUT",
        "New password must be at least 8 characters.",
        400,
        false
      );
    }

    db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").run(
      hashPassword(newPassword),
      actor.userId
    );
    loggingService.recordAudit({
      actor: actor.username,
      role: actor.role,
      action: "PASSWORD_CHANGED",
      target: actor.username,
    });
  }

  public listUsers(): AdminUserRecord[] {
    const db = dbManager.getDb();
    const rows = db
      .prepare("SELECT id, username, role, active, created_at, last_login_at FROM admin_users ORDER BY created_at ASC")
      .all() as Array<{
      id: string;
      username: string;
      role: AdminRole;
      active: number;
      created_at: string;
      last_login_at: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      role: r.role,
      active: r.active === 1,
      created_at: r.created_at,
      last_login_at: r.last_login_at,
    }));
  }

  public createUser(
    actor: AdminSessionContext,
    input: { username: string; password: string; role: AdminRole }
  ): AdminUserRecord {
    const db = dbManager.getDb();
    const username = input.username.trim().replace(/\s+/g, " ");
    if (!/^[a-zA-Z0-9 _.-]{3,32}$/.test(username)) {
      throw new MovieBoxError(
        "INVALID_INPUT",
        "Username must be 3-32 characters (letters, numbers, spaces, _, ., -).",
        400,
        false
      );
    }
    if (input.password.length < 8) {
      throw new MovieBoxError(
        "INVALID_INPUT",
        "Password must be at least 8 characters.",
        400,
        false
      );
    }

    const existing = db
      .prepare("SELECT id FROM admin_users WHERE username = ?")
      .get(username) as { id: string } | undefined;
    if (existing) {
      throw new MovieBoxError("INVALID_INPUT", "Username already exists.", 400, false);
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO admin_users (id, username, password_hash, role, active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    ).run(id, username, hashPassword(input.password), input.role, createdAt);

    loggingService.recordAudit({
      actor: actor.username,
      role: actor.role,
      action: "ADMIN_USER_CREATED",
      target: username,
      details: { role: input.role },
    });

    return {
      id,
      username,
      role: input.role,
      active: true,
      created_at: createdAt,
      last_login_at: null,
    };
  }

  public getSystemInfo() {
    return {
      server: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime_seconds: Math.floor(process.uptime()),
        memory_rss_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        environment: env.nodeEnv,
        port: env.port,
        public_base_url: env.publicBaseUrl,
        stateless_mode: env.statelessMode,
        is_render: env.isRender,
      },
      api: {
        version: "v1",
        public_routes: [
          "GET /api/v1/search",
          "GET /api/v1/details/:id",
          "GET /api/v1/details/:id/episodes",
          "GET /api/v1/stream/:id",
        ],
        rate_limit_window_ms: env.rateLimitWindowMs,
        rate_limit_max_requests: env.rateLimitMaxRequests,
        cors_origins: env.corsOrigins,
      },
      database: dbManager.getStatus(),
      cache: cacheService.getStats(),
      health_history: providerHealthService.getHistory(10),
    };
  }
}

export const adminManagementService = new AdminManagementService();
