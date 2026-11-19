import crypto from "crypto";
import { dbManager } from "../db/database";

export type RouteCategory = "search" | "details" | "episodes" | "stream" | "proxy" | "health" | "admin" | "other";

export function redactSensitiveText(input: string | null | undefined): string | null {
  if (!input) return null;
  return input
    .replace(/(\/api\/v1\/stream-proxy\/dir\/)[^/\s?#]+/gi, "$1[REDACTED]")
    .replace(/(\/api\/v1\/stream-proxy\?token=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|Signature|Key-Pair-Id|Policy|Expires|sign|auth_key)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(token=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, "$1[REDACTED]")
    .replace(/((?:Set-)?Cookie:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(signCookie=)[^&\s;]+/gi, "$1[REDACTED]")
    .slice(0, 500);
}

export function hashClientIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 12);
}

export class LoggingService {
  public recordApiRequest(entry: {
    requestId: string;
    routeType: RouteCategory;
    method: string;
    path: string;
    querySummary?: string | null;
    statusCode: number;
    durationMs: number;
    success: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    clientIp?: string;
  }): void {
    try {
      const db = dbManager.getDb();
      db.prepare(
        `INSERT INTO request_logs (
          request_id, route_type, method, path, query_summary,
          status_code, duration_ms, success, error_code, error_message,
          client_ip_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        entry.requestId,
        entry.routeType,
        entry.method,
        redactSensitiveText(entry.path) || "/",
        redactSensitiveText(entry.querySummary) || null,
        entry.statusCode,
        Math.max(0, Math.round(entry.durationMs)),
        entry.success ? 1 : 0,
        entry.errorCode || null,
        redactSensitiveText(entry.errorMessage),
        hashClientIp(entry.clientIp),
        new Date().toISOString()
      );
    } catch {
      // Logging must never crash request flow
    }
  }

  public recordProviderCall(entry: {
    requestId?: string | null;
    operation: string;
    host: string;
    statusCode?: number | null;
    durationMs: number;
    success: boolean;
    errorCode?: string | null;
    message?: string | null;
  }): void {
    try {
      const db = dbManager.getDb();
      db.prepare(
        `INSERT INTO provider_logs (
          request_id, operation, host, status_code, duration_ms,
          success, error_code, message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        entry.requestId || null,
        entry.operation,
        entry.host,
        entry.statusCode ?? null,
        Math.max(0, Math.round(entry.durationMs)),
        entry.success ? 1 : 0,
        entry.errorCode || null,
        redactSensitiveText(entry.message),
        new Date().toISOString()
      );
    } catch {
      // ignore logging error
    }
  }

  public recordAudit(entry: {
    actor: string;
    role: string;
    action: string;
    target: string;
    details?: Record<string, unknown>;
  }): void {
    try {
      const db = dbManager.getDb();
      db.prepare(
        `INSERT INTO audit_logs (actor, role, action, target, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        entry.actor,
        entry.role,
        entry.action,
        entry.target,
        entry.details ? redactSensitiveText(JSON.stringify(entry.details)) : null,
        new Date().toISOString()
      );
    } catch {
      // ignore logging error
    }
  }

  public getOverviewMetrics(): {
    routeCounts: {
      search: number;
      details: number;
      episodes: number;
      stream: number;
    };
    totalPublicRequests: number;
    successCount: number;
    errorCount: number;
    successRate: number;
    errorRate: number;
    lastSuccessfulProviderAt: string | null;
    recentErrors: Array<{
      id: number;
      request_id: string;
      route_type: string;
      path: string;
      status_code: number;
      error_code: string | null;
      error_message: string | null;
      created_at: string;
    }>;
  } {
    const db = dbManager.getDb();
    const countsRows = db
      .prepare(
        `SELECT route_type, COUNT(*) as total, SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as ok
         FROM request_logs
         WHERE route_type IN ('search', 'details', 'episodes', 'stream')
         GROUP BY route_type`
      )
      .all() as Array<{ route_type: string; total: number; ok: number }>;

    const routeCounts = { search: 0, details: 0, episodes: 0, stream: 0 };
    let totalPublicRequests = 0;
    let successCount = 0;

    for (const row of countsRows) {
      if (row.route_type in routeCounts) {
        (routeCounts as Record<string, number>)[row.route_type] = row.total;
      }
      totalPublicRequests += row.total;
      successCount += row.ok || 0;
    }

    const errorCount = Math.max(0, totalPublicRequests - successCount);
    const successRate =
      totalPublicRequests > 0 ? Number(((successCount / totalPublicRequests) * 100).toFixed(1)) : 0;
    const errorRate =
      totalPublicRequests > 0 ? Number(((errorCount / totalPublicRequests) * 100).toFixed(1)) : 0;

    const lastProviderRow = db
      .prepare("SELECT created_at FROM provider_logs WHERE success = 1 ORDER BY id DESC LIMIT 1")
      .get() as { created_at: string } | undefined;

    const recentErrors = db
      .prepare(
        `SELECT id, request_id, route_type, path, status_code, error_code, error_message, created_at
         FROM request_logs
         WHERE success = 0
         ORDER BY id DESC
         LIMIT 10`
      )
      .all() as Array<{
      id: number;
      request_id: string;
      route_type: string;
      path: string;
      status_code: number;
      error_code: string | null;
      error_message: string | null;
      created_at: string;
    }>;

    return {
      routeCounts,
      totalPublicRequests,
      successCount,
      errorCount,
      successRate,
      errorRate,
      lastSuccessfulProviderAt: lastProviderRow?.created_at ?? null,
      recentErrors,
    };
  }

  public queryLogs(params: {
    category:
      | "api"
      | "provider"
      | "playback"
      | "stream_errors"
      | "errors"
      | "timeouts"
      | "rate_limits"
      | "audit";
    requestId?: string;
    limit?: number;
  }): unknown[] {
    const db = dbManager.getDb();
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 300);
    const reqIdFilter = params.requestId?.trim();

    if (params.category === "provider") {
      if (reqIdFilter) {
        return db
          .prepare("SELECT * FROM provider_logs WHERE request_id LIKE ? ORDER BY id DESC LIMIT ?")
          .all(`%${reqIdFilter}%`, limit);
      }
      return db.prepare("SELECT * FROM provider_logs ORDER BY id DESC LIMIT ?").all(limit);
    }

    if (params.category === "audit") {
      return db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?").all(limit);
    }

    const clauses: string[] = [];
    const args: Array<string | number> = [];

    if (params.category === "playback") {
      clauses.push("route_type = 'stream'");
    } else if (params.category === "stream_errors") {
      clauses.push("route_type = 'stream' AND success = 0");
    } else if (params.category === "errors") {
      clauses.push("success = 0");
    } else if (params.category === "timeouts") {
      clauses.push("(error_code = 'UPSTREAM_TIMEOUT' OR status_code = 408 OR status_code = 504)");
    } else if (params.category === "rate_limits") {
      clauses.push("(error_code IN ('RATE_LIMIT_EXCEEDED', 'UPSTREAM_RATE_LIMITED') OR status_code = 429)");
    }

    if (reqIdFilter) {
      clauses.push("request_id LIKE ?");
      args.push(`%${reqIdFilter}%`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    args.push(limit);

    return db
      .prepare(`SELECT * FROM request_logs ${where} ORDER BY id DESC LIMIT ?`)
      .all(...args);
  }
}

export const loggingService = new LoggingService();
