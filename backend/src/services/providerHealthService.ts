import { dbManager } from "../db/database";
import { movieBoxClient } from "../providers/moviebox/client";
import { MovieBoxError } from "../providers/moviebox/errors";

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

export class ProviderHealthService {
  public async runConnectionTest(): Promise<HealthCheckRecord> {
    const checkedAt = new Date().toISOString();
    const runtime = movieBoxClient.getRuntimeStatus();

    if (!runtime.enabled) {
      const rec: HealthCheckRecord = {
        provider_id: "moviebox",
        status: "disabled",
        latency_ms: null,
        active_host: runtime.activeHost,
        session_valid: false,
        error_code: "PROVIDER_DISABLED",
        message: "Provider is currently disabled by administrator.",
        checked_at: checkedAt,
      };
      this.persistCheck(rec);
      return rec;
    }

    if (runtime.mockMode) {
      const rec: HealthCheckRecord = {
        provider_id: "moviebox",
        status: "mock_mode",
        latency_ms: 0,
        active_host: "mock-fixtures",
        session_valid: true,
        error_code: null,
        message: "Provider is operating in non-production mock fixture mode.",
        checked_at: checkedAt,
      };
      this.persistCheck(rec);
      return rec;
    }

    const start = Date.now();
    try {
      movieBoxClient.invalidateSession(false);
      await movieBoxClient.ensureSession();
      await movieBoxClient.search("test", 1, 0);
      const latency = Date.now() - start;
      const updated = movieBoxClient.getRuntimeStatus();
      const rec: HealthCheckRecord = {
        provider_id: "moviebox",
        status: "connected",
        latency_ms: latency,
        active_host: updated.activeHost,
        session_valid: updated.session.sessionValid,
        error_code: null,
        message: "MovieBox upstream session and catalog search probe succeeded.",
        checked_at: checkedAt,
      };
      this.persistCheck(rec);
      return rec;
    } catch (err) {
      const latency = Date.now() - start;
      const mbErr = err instanceof MovieBoxError ? err : null;
      const updated = movieBoxClient.getRuntimeStatus();
      const rec: HealthCheckRecord = {
        provider_id: "moviebox",
        status: "error",
        latency_ms: latency,
        active_host: updated.activeHost,
        session_valid: updated.session.sessionValid,
        error_code: mbErr?.code || "UPSTREAM_UNAVAILABLE",
        message: mbErr?.message || (err instanceof Error ? err.message : "Probe failed."),
        checked_at: checkedAt,
      };
      this.persistCheck(rec);
      return rec;
    }
  }

  private persistCheck(rec: HealthCheckRecord): void {
    try {
      const db = dbManager.getDb();
      db.prepare(
        `INSERT INTO health_checks (
          provider_id, status, latency_ms, active_host, session_valid,
          error_code, message, checked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        rec.provider_id,
        rec.status,
        rec.latency_ms,
        rec.active_host,
        rec.session_valid ? 1 : 0,
        rec.error_code,
        rec.message,
        rec.checked_at
      );
    } catch {
      // ignore persistence error
    }
  }

  public getLatestCheck(): HealthCheckRecord | null {
    const db = dbManager.getDb();
    const row = db
      .prepare("SELECT * FROM health_checks ORDER BY id DESC LIMIT 1")
      .get() as
      | {
          id: number;
          provider_id: string;
          status: HealthCheckRecord["status"];
          latency_ms: number | null;
          active_host: string | null;
          session_valid: number;
          error_code: string | null;
          message: string | null;
          checked_at: string;
        }
      | undefined;

    if (!row) return null;
    return {
      ...row,
      session_valid: row.session_valid === 1,
    };
  }

  public getHistory(limit: number = 25): HealthCheckRecord[] {
    const db = dbManager.getDb();
    const rows = db
      .prepare("SELECT * FROM health_checks ORDER BY id DESC LIMIT ?")
      .all(Math.min(Math.max(limit, 1), 100)) as Array<{
      id: number;
      provider_id: string;
      status: HealthCheckRecord["status"];
      latency_ms: number | null;
      active_host: string | null;
      session_valid: number;
      error_code: string | null;
      message: string | null;
      checked_at: string;
    }>;

    return rows.map((row) => ({
      ...row,
      session_valid: row.session_valid === 1,
    }));
  }
}

export const providerHealthService = new ProviderHealthService();
