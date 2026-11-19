import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DatabaseSync } from "node:sqlite";
import { env } from "../config/env";

const INITIAL_MIGRATION_FALLBACK = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_configs (
  provider_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  api_hosts_json TEXT NOT NULL,
  media_hosts_json TEXT NOT NULL,
  request_timeout_ms INTEGER NOT NULL DEFAULT 12000,
  cache_ttl_ms INTEGER NOT NULL DEFAULT 300000,
  stream_proxy_ttl_seconds INTEGER NOT NULL DEFAULT 3600,
  stream_proxy_timeout_ms INTEGER NOT NULL DEFAULT 30000,
  mock_mode INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);
CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'operator', 'viewer')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  route_type TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  query_summary TEXT,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  success INTEGER NOT NULL,
  error_code TEXT,
  error_message TEXT,
  client_ip_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_logs_created ON request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_request_id ON request_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_route_type ON request_logs(route_type);
CREATE INDEX IF NOT EXISTS idx_request_logs_error_code ON request_logs(error_code);
CREATE TABLE IF NOT EXISTS provider_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT,
  operation TEXT NOT NULL,
  host TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER NOT NULL,
  success INTEGER NOT NULL,
  error_code TEXT,
  message TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_provider_logs_created ON provider_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_logs_request_id ON provider_logs(request_id);
CREATE TABLE IF NOT EXISTS health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  active_host TEXT,
  session_valid INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  message TEXT,
  checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_health_checks_checked ON health_checks(checked_at DESC);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
`;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hexKey] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hexKey, "hex");
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function resolveSqliteFilePath(dbUrl: string): string {
  if (dbUrl === ":memory:") return ":memory:";
  let rawPath = dbUrl.trim();
  if (rawPath.startsWith("sqlite://")) {
    rawPath = rawPath.slice("sqlite://".length);
  } else if (rawPath.startsWith("file:")) {
    rawPath = rawPath.slice("file:".length);
  }
  const resolved = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return resolved;
}

class DatabaseManager {
  private db: DatabaseSync | null = null;
  private dbPath: string = ":memory:";

  public init(overrideUrl?: string): DatabaseSync {
    const targetUrl = overrideUrl || env.databaseUrl;
    const resolvedPath = resolveSqliteFilePath(targetUrl);

    if (this.db && this.dbPath === resolvedPath) {
      return this.db;
    }
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore close error
      }
    }

    this.dbPath = resolvedPath;
    this.db = new DatabaseSync(resolvedPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");

    this.runMigrations();
    this.seedDefaults();
    return this.db;
  }

  public getDb(): DatabaseSync {
    if (!this.db) {
      return this.init();
    }
    return this.db;
  }

  public close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // ignore close error
      }
      this.db = null;
      this.dbPath = ":memory:";
    }
  }

  public getStatus(): {
    engine: "sqlite";
    path: string;
    connected: boolean;
    migrationsApplied: string[];
  } {
    const db = this.getDb();
    const rows = db
      .prepare("SELECT name FROM schema_migrations ORDER BY id ASC")
      .all() as Array<{ name: string }>;
    return {
      engine: "sqlite",
      path: this.dbPath === ":memory:" ? ":memory:" : path.relative(process.cwd(), this.dbPath),
      connected: true,
      migrationsApplied: rows.map((r) => r.name),
    };
  }

  private runMigrations(): void {
    const db = this.getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL
      );
    `);

    const migrationsDir = path.resolve(process.cwd(), "database/migrations");
    let migrationFiles: Array<{ name: string; sql: string }> = [];

    if (fs.existsSync(migrationsDir)) {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      migrationFiles = files.map((name) => ({
        name,
        sql: fs.readFileSync(path.join(migrationsDir, name), "utf8"),
      }));
    } else {
      migrationFiles = [
        { name: "001_initial.sql", sql: INITIAL_MIGRATION_FALLBACK },
        {
          name: "002_stream_delivery.sql",
          sql: `
            ALTER TABLE provider_configs ADD COLUMN default_stream_delivery TEXT NOT NULL DEFAULT 'proxy';
            ALTER TABLE provider_configs ADD COLUMN proxy_delivery_enabled INTEGER NOT NULL DEFAULT 1;
            ALTER TABLE provider_configs ADD COLUMN direct_delivery_enabled INTEGER NOT NULL DEFAULT 1;
          `,
        },
      ];
    }

    const appliedRows = db
      .prepare("SELECT name FROM schema_migrations")
      .all() as Array<{ name: string }>;
    const appliedSet = new Set(appliedRows.map((r) => r.name));

    for (const mig of migrationFiles) {
      if (appliedSet.has(mig.name)) continue;
      db.exec(mig.sql);
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
        mig.name,
        new Date().toISOString()
      );
    }
  }

  private seedDefaults(): void {
    const db = this.getDb();
    const now = new Date().toISOString();

    const existingConfig = db
      .prepare("SELECT provider_id FROM provider_configs WHERE provider_id = ?")
      .get("moviebox") as { provider_id: string } | undefined;

    if (!existingConfig) {
      db.prepare(
        `INSERT INTO provider_configs (
          provider_id, enabled, api_hosts_json, media_hosts_json,
          request_timeout_ms, cache_ttl_ms, stream_proxy_ttl_seconds,
          stream_proxy_timeout_ms, mock_mode, default_stream_delivery,
          proxy_delivery_enabled, direct_delivery_enabled, updated_at, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "moviebox",
        1,
        JSON.stringify(env.movieboxHosts),
        JSON.stringify(env.movieboxMediaHosts),
        12_000,
        env.cacheTtlMs,
        env.streamProxyTtlSeconds,
        env.streamProxyTimeoutMs,
        env.isProduction ? 0 : env.movieboxMockMode ? 1 : 0,
        env.defaultStreamDelivery,
        1,
        1,
        now,
        "system"
      );
    } else if (env.isProduction) {
      // Strictly enforce mock mode disabled in production
      db.prepare("UPDATE provider_configs SET mock_mode = 0 WHERE provider_id = ?").run("moviebox");
    }

    const userCountRow = db
      .prepare("SELECT COUNT(*) as cnt FROM admin_users")
      .get() as { cnt: number };
    if ((userCountRow?.cnt ?? 0) === 0 && env.adminPassword) {
      db.prepare(
        `INSERT INTO admin_users (id, username, password_hash, role, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        env.adminUsername,
        hashPassword(env.adminPassword),
        "super_admin",
        1,
        now
      );
    }

    const existingSystem = db
      .prepare("SELECT key FROM system_settings WHERE key = ?")
      .get("server_profile") as { key: string } | undefined;
    if (!existingSystem) {
      db.prepare(
        "INSERT INTO system_settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, ?)"
      ).run(
        "server_profile",
        JSON.stringify({
          serviceName: "ProphecyVerse MovieBox Provider",
          apiVersion: "v1",
          rateLimitWindowMs: env.rateLimitWindowMs,
          rateLimitMaxRequests: env.rateLimitMaxRequests,
        }),
        now,
        "system"
      );
    }
  }
}

export const dbManager = new DatabaseManager();
