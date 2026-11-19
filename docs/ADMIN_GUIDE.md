# Admin Management Dashboard Guide

The Admin Dashboard is a standalone operational console served alongside the API on port `3000`. All `/api/admin/*` endpoints require server-side authentication via HttpOnly session cookies (`pv_admin_session`) or Bearer tokens, backed by SQLite `admin_users` and `admin_sessions`.

## 1. Roles & Permissions (RBAC)

| Role | View Metrics & Logs | Test Connection / Toggle Provider / Clear Cache | Edit Provider Config | Create Admin Users |
| --- | --- | --- | --- | --- |
| `super_admin` | Yes | Yes | Yes | Yes |
| `admin` | Yes | Yes | Yes | View Only |
| `operator` | Yes | Yes | No | No |
| `viewer` | Yes | No | No | No |

## 2. Dashboard Views

1. **Overview**: Server health, provider state (`enabled`, `disabled`, `mock_mode`, `unconfigured`), public route request counts (`search`, `details`, `episodes`, `stream`), success/error rates, cache entries, and recent errors.
2. **Provider**: MovieBox upstream host pool, active rotated host, session token expiry diagnostics, auth capability checks, one-click Enable/Disable, live Connection Test (`POST /api/admin/provider/test`), Cache Clear, and persisted health check history.
3. **Configuration**: Edit HTTPS API host pool, CDN media host allowlist, request/proxy timeouts, cache TTL, proxy token TTL, **Stream Delivery** settings (`default_stream_delivery`, `proxy_delivery_enabled`, `direct_delivery_enabled`), observed **Provider Direct URL Availability**, **Last Resolver Status**, redacted **Stream Resolution Error Logs**, and masked secret status (`configured` / `source` / `••••` tail only — raw secrets are never returned).
4. **Catalog Inspector**: Search `/api/v1/search` (all/movie/series) and inspect normalized `/api/v1/details/:id` metadata for any title, with raw JSON inspection.
5. **Episodes & Seasons**: Browse normalized season lists and episode tables via `/api/v1/details/:id/episodes`, including `provider_episode_id` verification and direct links to stream testing.
6. **Playback & Streams**: Test `/api/v1/stream/:id?delivery=proxy|direct` for both movies and composite `{series_id}_s{season}_e{episode}` IDs, inspect variants (`provider_resource_id`, `delivery_mode`), subtitles, and audio tracks, validate proxy token expiry (`PROXY_TOKEN_EXPIRED` vs `PROXY_TOKEN_INVALID`) via `POST /api/admin/playback/verify-proxy`, and verify playback with the built-in HTML5 preview player.
7. **API Tester**: Execute live requests against any of the 4 public routes (`search`, `details`, `episodes`, `stream` with delivery mode selector) and view HTTP status, latency, `X-Request-Id`, and formatted JSON response.
8. **Logs & Diagnostics**: Filter persisted logs across `api`, `provider`, `playback`, `stream_errors`, `errors`, `timeouts`, `rate_limits`, and `audit` categories by `request_id`. Sensitive tokens, signed proxy URLs, and cookies are redacted prior to storage.
9. **System & Security**: Inspect Node runtime info, SQLite persistence mode (`stateless :memory:` vs file-backed), applied migrations, cache stats, rate-limit policy, rotate your own admin password, and (for `super_admin`) create new admin/operator/viewer accounts.
