# Deployment Guide (Render Web Services & Node.js)

## 1. Prerequisites

- **Node.js**: `v22.x` or newer (required for built-in `node:sqlite` `DatabaseSync`)
- **npm**: `10.x+`

## 2. Production Environment Setup

Create a `.env` file locally or configure Render Environment Variables (never commit `.env` to source control; copy from `.env.example`):

```bash
NODE_ENV=production
PORT=10000
PUBLIC_BASE_URL=https://your-service.onrender.com
CORS_ORIGINS=https://your-frontend.example.com

# Stateless mode in production by default (:memory: when omitted);
# set DATABASE_URL only if mounting a Render Persistent Disk.
# DATABASE_URL=/var/data/provider.sqlite

# Mandatory explicit production admin & proxy secrets
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-unique-password-min-16-chars>
ADMIN_SESSION_SECRET=<64-char-random-hex>
PROXY_TOKEN_SECRET=hex:<64-char-random-hex>
PROXY_TOKEN_TTL_SECONDS=900
DEFAULT_STREAM_DELIVERY=proxy

# Optional upstream overrides if rotating MovieBox protocol values
MOVIEBOX_API_HOSTS=https://api6.aoneroom.com,https://api5.aoneroom.com,https://api.inmoviebox.com
MOVIEBOX_MEDIA_HOSTS=aoneroom.com,inmoviebox.com,hakunaymatata.com
```

### Production Security & Stateless Invariants

1. **Mock Mode Strictly Locked**: When `NODE_ENV=production`, `MOVIEBOX_MOCK_MODE` and `provider_configs.mock_mode` are forcibly evaluated as `false`. Attempting to enable mock mode via `PUT /api/admin/config` returns `400 INVALID_INPUT`. `/api/v1/mock-media/*` returns `404`.
2. **Explicit Admin Password**: Production startup will not seed a default `prophecy-admin-dev` password; `ADMIN_PASSWORD` must be supplied before first boot.
3. **Stateless by Default**: When `NODE_ENV=production` and `DATABASE_URL` is omitted, the server runs SQLite in `:memory:` mode without touching the local container filesystem.
4. **HTTPS Upstream & External URLs**: `MovieBoxService` enforces HTTPS upstream hosts, and `PUBLIC_BASE_URL` (or Render's injected `RENDER_EXTERNAL_URL`) generates HTTPS signed `/api/v1/stream-proxy` URLs behind Render's TLS terminator.
5. **SSRF & Proxy Token Protection**: `StreamProxyService` rejects raw IP targets, blocks redirects to non-allowlisted hosts, blocks private/loopback/CGNAT/link-local DNS resolutions, and validates short-lived HMAC tokens (`PROXY_TOKEN_EXPIRED` / `PROXY_TOKEN_INVALID`).

## 3. Deploying to Render Web Services

A ready-to-use `render.yaml` Blueprint is included at the repository root:

- **Runtime**: `node` (Node.js `>=22.0.0` per `package.json` `engines`)
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm start` (`NODE_ENV=production node dist/server.cjs`)
- **Host & Port Binding**: Server binds `0.0.0.0` and reads `process.env.PORT` (Render injects `PORT=10000`).
- **Health Check Path**: `/health` (both `GET /health` and `GET /api/health` return `200 OK` with provider & resolver status).
- **Graceful Shutdown**: `SIGTERM` and `SIGINT` drain active HTTP connections (`server.close`) and close the SQLite handle cleanly before exiting `0`.
- **Render Environment Variables**:
  - Auto-generated via `render.yaml`: `PROXY_TOKEN_SECRET`, `ADMIN_SESSION_SECRET`
  - Set manually in Render Dashboard (`sync: false`): `ADMIN_PASSWORD`, `PUBLIC_BASE_URL` (optional if `RENDER_EXTERNAL_URL` suffices), `CORS_ORIGINS`, and optional `MOVIEBOX_*` overrides.

## 4. Build & Start Commands

```bash
# Install dependencies
npm install

# Type-check TypeScript (backend + frontend)
npm run lint

# Run automated unit and integration tests
npm test

# Build frontend (dist/) and bundled backend (dist/server.cjs)
npm run build

# Start production server (reads PORT, defaults to 3000 if unset)
npm start
```

## 5. Database Migrations

SQLite migrations in `database/migrations/*.sql` (`001_initial.sql`, `002_stream_delivery.sql`) run automatically during `createApiApp()` startup and record applied migration filenames in `schema_migrations`. In stateless production mode (`DATABASE_URL` omitted), migrations run against `:memory:` on each boot; if you attach a Render Persistent Disk, point `DATABASE_URL` to a path inside the mounted disk directory.
