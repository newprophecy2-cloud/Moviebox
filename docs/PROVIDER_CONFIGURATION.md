# Provider Configuration Guide

## 1. Environment Variables (`.env`)

All sensitive credentials live exclusively on the server and are never sent to the browser Admin UI.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `3000` | HTTP port bound on `0.0.0.0` (Render sets `PORT=10000` automatically) |
| `NODE_ENV` | No | `development` | Set to `production` for hardened cookies, stateless DB default & mock-mode lock |
| `PUBLIC_BASE_URL` | Prod Rec. | `RENDER_EXTERNAL_URL` | External HTTPS origin used to build absolute signed `/api/v1/stream-proxy` URLs |
| `RENDER_EXTERNAL_URL` | Render | Auto | Injected by Render Web Services and used as fallback when `PUBLIC_BASE_URL` is unset |
| `CORS_ORIGINS` | No | `""` | Comma-separated allowed browser origins (`CORS_ORIGIN` supported as alias; `*` disallowed) |
| `DATABASE_URL` | No | Dev: `./database/provider.sqlite`, Prod: `:memory:` | SQLite path; production defaults to stateless `:memory:` unless a persistent disk path is supplied |
| `ADMIN_USERNAME` | No | `admin` | Seeded `super_admin` username on fresh DB |
| `ADMIN_PASSWORD` | Prod: Yes | Dev fallback | Seeded `super_admin` password (must be set explicitly in production) |
| `ADMIN_SESSION_SECRET` | Prod: Yes | Ephemeral random | HMAC-SHA256 key used to hash admin session tokens |
| `ADMIN_SESSION_TTL_SECONDS` | No | `86400` | Admin session lifetime in seconds |
| `MOVIEBOX_API_HOSTS` | No | 7 HTTPS hosts | Comma-separated MovieBox BFF HTTPS origins |
| `MOVIEBOX_MEDIA_HOSTS` | No | `aoneroom.com,inmoviebox.com,hakunaymatata.com` | Stream proxy media CDN host allowlist |
| `MOVIEBOX_SIGNING_SECRET` | Override | Protocol default | HMAC-MD5 key for `x-tr-signature` (`base64:`, `hex:`, `escaped:`, `utf8:`) |
| `MOVIEBOX_CERT_SHA256` | Override | Protocol default | Certificate digest used to compute `x-client-build` |
| `MOVIEBOX_BUILD_SALT` | Override | `oneroom` | Build salt paired with `MOVIEBOX_CERT_SHA256` |
| `MOVIEBOX_USER_AGENT` | No | Android Cronet UA | Upstream User-Agent header |
| `MOVIEBOX_CLIENT_INFO` | No | Android device JSON | JSON payload sent in `x-client-info` header |
| `MOVIEBOX_AUTH_TOKEN` | No | `""` | Optional pre-existing MovieBox JWT session |
| `MOVIEBOX_STREAM_REFERER` | No | `""` | Optional `Referer` header sent by stream proxy |
| `DEFAULT_STREAM_DELIVERY` | No | `proxy` | Default `GET /api/v1/stream/:id` delivery mode (`proxy` \| `direct`) |
| `PROXY_TOKEN_SECRET` | Prod: Yes | Derived/ephemeral | HMAC-SHA256 secret signing `/api/v1/stream-proxy` URLs (`STREAM_PROXY_SECRET` alias supported) |
| `PROXY_TOKEN_TTL_SECONDS` | No | `900` | Default signed proxy URL lifetime in seconds (`STREAM_PROXY_TTL_SECONDS` alias supported) |
| `STREAM_PROXY_TIMEOUT_MS` | No | `30000` | Upstream CDN request timeout in ms |
| `MOVIEBOX_CACHE_TTL_MS` | No | `300000` | Catalog/details cache TTL in ms (`0` disables) |
| `MOVIEBOX_MOCK_MODE` | No | `false` | Non-production fixture toggle (strictly ignored when `NODE_ENV=production`) |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limiter window in ms |
| `RATE_LIMIT_MAX_REQUESTS` | No | `120` | Max requests per IP per window |

## 2. Database-Persisted Configuration (`provider_configs`)

Runtime tuning changes made in the Admin Dashboard (`Configuration` view or `PUT /api/admin/config`) are persisted in SQLite (`provider_configs` table) and override startup defaults for:
- `enabled` (`true` / `false`)
- `default_stream_delivery` (`"proxy"` / `"direct"`)
- `proxy_delivery_enabled` (`true` / `false`)
- `direct_delivery_enabled` (`true` / `false`)
- `api_hosts` (HTTPS URLs only)
- `media_hosts` (valid hostnames only)
- `request_timeout_ms` (`1000–60000`)
- `cache_ttl_ms` (`0–3600000`)
- `stream_proxy_ttl_seconds` (`60–86400`)
- `stream_proxy_timeout_ms` (`1000–120000`)
- `mock_mode` (rejected with `400 INVALID_INPUT` if `true` in production)

Whenever configuration is updated via `PUT /api/admin/config`, the in-memory catalog/playback cache is cleared and an `audit_logs` entry is recorded.
