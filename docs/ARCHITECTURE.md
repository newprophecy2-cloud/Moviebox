# Architecture — ProphecyVerse MovieBox Provider Server

## 1. High-Level Overview

The application is a standalone full-stack **MovieBox Provider Server** with an integrated **Admin Management Dashboard**. The MovieBox provider adapter and Express API server run strictly server-side; the React Admin UI communicates exclusively with `/api/admin/*` and `/api/v1/*` over HTTP and never contacts MovieBox upstream services directly.

```
+-------------------------------------------------------------------+
|                   Admin Management Dashboard (SPA)                |
|  React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons       |
|  Auth: HttpOnly Cookie Session (pv_admin_session)                 |
+-------------------------------+-----------------------------------+
                                | HTTP (Same-Origin)
                                v
+-------------------------------------------------------------------+
|                      Express Server (Port 3000)                   |
|  Middleware: Security Headers -> CORS Allowlist -> JSON (64KB)    |
|              -> Request ID & Logger -> Rate Limiter -> Auth/RBAC  |
+------------------+------------------------------+-----------------+
                   |                              |
   4 Public Routes | /api/v1/*                    | /api/admin/*
                   v                              v
+----------------------------------+   +----------------------------+
|         Service Layer            |   |    Admin & Health Layer    |
|  - CatalogService (Search)       |   |  - AdminManagementService  |
|  - DetailsService (Movie/Series) |   |  - ProviderHealthService   |
|  - EpisodeService (Season/Ep)    |   |  - LoggingService          |
|  - PlaybackService (Unified)     |   |  - ProviderConfigStore     |
|  - StreamProxyService (Signed)   |   |  - CacheService (In-Mem)   |
+------------------+---------------+   +-------------+--------------+
                   |                                 |
                   v                                 v
+----------------------------------+   +----------------------------+
|     MovieBox Provider Adapter    |   |  SQLite Persistence        |
|  - MovieBoxService (Host Pool,   |   |  (node:sqlite DatabaseSync)|
|    Signing, Session Lifecycle)   |   |  - provider_configs        |
|  - Crypto (x-tr-signature,       |   |  - system_settings         |
|    x-client-token, x-client-build)|  |  - admin_users & sessions  |
|  - Mapper (Normalized DTOs)      |   |  - request_logs & provider |
+------------------+---------------+   |  - health_checks & audit   |
                   |                   +----------------------------+
                   | HTTPS Only (Signed Requests)
                   v
+-------------------------------------------------------------------+
|               MovieBox Upstream BFF & Media CDNs                  |
|  api6.aoneroom.com ... api.inmoviebox.com / hakunaymatata.com     |
+-------------------------------------------------------------------+
```

## 2. Backend Module Structure

- `server.ts`: Application entrypoint. Initializes Express API routes, attaches Vite dev middleware in non-production or serves `dist/` static assets in production, and handles `SIGINT`/`SIGTERM` graceful shutdown.
- `backend/src/app.ts`: Express factory (`createApiApp`) configuring database initialization, security headers, CORS allowlist, JSON body limits, request-ID logging, rate limiting, public routes, admin routes, health route, and centralized error handling.
- `backend/src/config/env.ts`: Server environment parser with strict production guard (`NODE_ENV=production` forces `movieboxMockMode = false`) and secret masking indicators.
- `backend/src/db/database.ts`: SQLite (`node:sqlite` `DatabaseSync`) connection manager, SQL migration runner (`database/migrations/*.sql`), `scrypt` password hashing, and default configuration/admin seeding.
- `backend/src/providers/moviebox/`:
  - `config.ts`: Endpoint map (`/wefeed-mobile-bff/...`), pagination sizes, timeout and session buffers.
  - `crypto.ts`: Signing secret decoder (`base64:`, `hex:`, `escaped:`, `utf8:`), canonical string builder, `x-tr-signature` HMAC-MD5 generator, `x-client-token`, and `x-client-build`.
  - `session.ts`: JWT claim inspection (`userId`, `exp`) and session validity buffer checks.
  - `mapper.ts`: Upstream payload normalization, title cleanup, ISO 639-1 language code mapping, deprecation/placeholder URL filtering, CloudFront/`urlprefix=` DASH manifest extraction, `PlayInfo` and `ResourceV2` variant mapping, and external caption filtering.
  - `errors.ts`: Structured `MovieBoxError` error taxonomy and retryable HTTP status detection.
  - `mockData.ts`: Explicit non-production fixture payloads (never used in production).
- `backend/src/services/`:
  - `moviebox.service.ts`: Upstream HTTP client with host pool rotation, automatic visitor session bootstrap/refresh, `x-user` header absorption, and structured provider telemetry.
  - `catalogService.ts`: Search normalization and caching.
  - `detailsService.ts`: Media details normalization separating `movie` vs `series` response shapes.
  - `episodeService.ts`: Series season/episode enumeration with movie rejection (`400 NOT_A_SERIES`).
  - `playbackService.ts`: Unified stream resolution supporting both `movie` IDs and `{series_id}_s{season}_e{episode}` composite IDs, placeholder recovery via `resource-position/v2`, subtitle proxying, and host allowlist enforcement.
  - `streamProxyService.ts`: Same-origin HMAC-SHA256 signed proxy for MP4, HLS (`.m3u8` rewriting), DASH (`.mpd` + `/dir/:token/*` template segment rewriting), and subtitles (`.vtt`/`.srt`), with DNS rebinding / private IP SSRF protection.
  - `providerConfigStore.ts`, `providerHealthService.ts`, `loggingService.ts`, `adminManagementService.ts`, `cacheService.ts`.

## 3. Data Persistence Policy

- **Stored in SQLite**: Provider enable/disable state, API host pool, media CDN host allowlist, request/proxy timeouts, cache TTL, proxy token TTL, non-production mock flag, admin users/sessions (`sha256(HMAC)` session tokens), health check history, redacted request/provider logs, and admin audit trail.
- **Kept Ephemeral (Never Persisted)**: Temporary signed stream proxy URLs, upstream CloudFront cookies, MovieBox session JWTs, and playback variants are kept solely in short-lived memory caches (`<= 120s` for playback) and never written to permanent database tables.
