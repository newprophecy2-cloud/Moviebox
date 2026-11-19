-- 001_initial.sql: Initial schema for ProphecyVerse MovieBox Provider Server

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
