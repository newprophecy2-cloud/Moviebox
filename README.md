# ProphecyVerse — MovieBox Provider Server

A standalone full-stack **MovieBox Provider Server** and **Admin Management Dashboard** exposing a clean, normalized 4-route public media API backed by SQLite persistence, HMAC-signed stream proxying, and role-based operational tooling.

## Key Features

- **Exactly 4 Primary Public API Routes (`/api/v1/*`)**:
  - `GET /api/v1/search` — Paginated movie & series search with type filtering
  - `GET /api/v1/details/:id` — Distinct normalized movie vs. series metadata
  - `GET /api/v1/details/:id/episodes` — Sorted series season/episode enumeration (`NOT_A_SERIES` guard on movies)
  - `GET /api/v1/stream/:id?delivery=proxy|direct` — 7-stage unified movie & `{series_id}_s{season}_e{episode}` playback resolver supporting signed proxy URLs and authorized direct provider URLs (`DIRECT_URL_UNAVAILABLE` when unavailable, preserving `provider_resource_id` and multi-resource streams)
- **Signed Stream Proxy**: Rewrites HLS `.m3u8` and DASH `.mpd` manifests through short-lived HMAC-SHA256 signed `/api/v1/stream-proxy` URLs (`PROXY_TOKEN_EXPIRED` / `PROXY_TOKEN_INVALID`), with byte-range (`206 Partial Content`) streaming, SSRF/private-IP protection, and strict CDN host allowlisting.
- **Render Web Service Ready**: Binds `0.0.0.0:$PORT`, includes `render.yaml` & `GET /health`, runs stateless (`:memory:`) in production when `DATABASE_URL` is unset, uses `PUBLIC_BASE_URL` / `RENDER_EXTERNAL_URL` for HTTPS proxy URLs, and handles `SIGTERM` gracefully.
- **Standalone Admin Management Dashboard**: 9 operational views including **Stream Delivery** settings, observed **Provider Direct URL Availability**, **Last Resolver Status**, and redacted **Stream Resolution Error Logs**, protected by `scrypt` + HttpOnly session cookies and 4 RBAC roles.
- **SQLite Persistence**: Built-in `node:sqlite` (`DatabaseSync`) with SQL migrations (`database/migrations/001_initial.sql`, `002_stream_delivery.sql`) storing provider config, admin users/sessions, redacted request/provider/stream-error logs, health checks, and audit logs. Temporary playback URLs are never persisted.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (optional for local dev; defaults provided)
cp .env.example .env

# 3. Start development server (Express API + Vite SPA on port 3000)
npm run dev
```

Default development admin credentials (when `ADMIN_USERNAME` / `ADMIN_PASSWORD` are unset):
- Username: `admin`
- Password: `prophecy-admin-dev`

*(In production, `ADMIN_PASSWORD` must be explicitly configured via environment variables.)*

## Scripts

- `npm run dev` — Start development server on `http://localhost:3000`
- `npm run lint` — TypeScript check (`tsc --noEmit`)
- `npm test` — Run all unit & integration tests (`tsx --test`)
- `npm run build` — Build frontend (`dist/`) and bundled server (`dist/server.cjs`)
- `npm start` — Run production bundle (`NODE_ENV=production node dist/server.cjs`)

## Documentation

- [Source Code Analysis](docs/SOURCE_ANALYSIS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Public API Documentation](docs/API_DOCUMENTATION.md)
- [Response Schema Reference](docs/RESPONSE_SCHEMA.md)
- [Provider Configuration](docs/PROVIDER_CONFIGURATION.md)
- [Admin Dashboard Guide](docs/ADMIN_GUIDE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Testing Guide](docs/TESTING.md)
