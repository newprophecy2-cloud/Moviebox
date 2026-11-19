# Testing Guide

Automated tests use Node.js's built-in test runner (`node:test`) executed via `tsx --test`.

## Running Tests

```bash
# Run all unit and integration tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration
```

## Test Coverage

### Unit Tests (`tests/unit/moviebox.unit.test.ts`)
- **Crypto & Signing**: Secret decoding (`base64:`, `hex:`, `escaped:`, `utf8:`), `x-client-token`, canonical query/body construction, `x-tr-signature`, `x-client-build`.
- **Session Lifecycle**: JWT claim parsing and `sessionExpiryBufferSeconds` enforcement.
- **Mappers**: Search catalog mapping, distinct movie vs. series details mapping, season/episode sorting, absent `providerEpisodeId` normalization, `PlayInfo` & `ResourceV2` mapping, deprecation/placeholder URL filtering, CloudFront/`urlprefix=` DASH extraction, caption deduplication & filtering, and unfabricated audio language codes.
- **Validation**: `parseUnifiedStreamId`, `validateSubjectId`, `validateSearchParams`, `validateEpisodesParams`, and `validateDeliveryMode` (`INVALID_DELIVERY_MODE`).
- **Stream Proxy Security**: Private/reserved IPv4 & IPv6 detection, host allowlist enforcement, tampered (`PROXY_TOKEN_INVALID`) vs. expired (`PROXY_TOKEN_EXPIRED`) proxy token rejection, `PUBLIC_BASE_URL` absolute URL generation, HLS `.m3u8` rewriting, DASH `.mpd` `SegmentTemplate` directory token rewriting, and path traversal (`../`, `%2e%2e`) blocking.

### Integration Tests (`tests/integration/routes.integration.test.ts`)
Spins up `createApiApp({ dbUrl: ":memory:" })` on an ephemeral port alongside a local TCP upstream HTTP simulator (preserving all request signing, timeouts, header parsing, SQLite persistence, and error handling without making external network assumptions):
- **Search (`GET /api/v1/search`)**: Movie search, series search, pagination (`has_more`, `total_results`), empty results, invalid queries (`400 INVALID_INPUT`), upstream timeout (`504 UPSTREAM_TIMEOUT`).
- **Details (`GET /api/v1/details/:id`)**: Distinct movie vs. series schemas, invalid ID (`400`), missing title (`404 MEDIA_NOT_FOUND`), malformed upstream payload (`404`).
- **Episodes (`GET /api/v1/details/:id/episodes`)**: Season filtering, sorted episodes, empty season (`total_episodes: 0`), invalid season (`400`), non-existent season (`404 MEDIA_NOT_FOUND`), movie ID rejection (`400 NOT_A_SERIES`), unfabricated `provider_episode_id: null`.
- **Unified Stream & Delivery Modes (`GET /api/v1/stream/:id`)**: Movie streams, composite `{series_id}_s{season}_e{episode}` streams, `delivery=proxy` signed URLs + `Range` (`206 Partial Content`) playback, `delivery=direct` credential-free provider URLs vs. `404 DIRECT_URL_UNAVAILABLE` (without falling back to proxy), `400 INVALID_DELIVERY_MODE`, missing episode (`404 MEDIA_NOT_FOUND`), bare series ID (`400 EPISODE_REQUIRED`), same-quality multi-resource preservation (`provider_resource_id`), subtitles, unfabricated audio tracks, placeholder-only (`503 PLACEHOLDER_ONLY`), empty sources (`404 STREAM_NOT_FOUND`), blocked CDN host (`502 STREAM_PROXY_ERROR`), invalid/expired proxy tokens (`403 PROXY_TOKEN_INVALID` / `PROXY_TOKEN_EXPIRED`), timeout (`504`), provider disabled (`503 PROVIDER_DISABLED`).
- **Admin, Diagnostics & Health (`/api/admin/*`, `/health`, `/api/health`)**: Render `GET /health` + `GET /api/health` checks, session cookie login, unauthorized rejection (`401`), RBAC enforcement (`403`), SQLite-persisted stream delivery settings & enable/disable updates, live resolver telemetry, and sensitive token/proxy URL/cookie redaction in `request_logs` (`stream_errors` category).

## Note on Live Upstream Verification

Passing automated tests against local test servers verifies adapter logic, contract normalization, SQLite persistence, proxy security, and error handling. Live MovieBox upstream reachability depends on external host availability and valid upstream signing credentials in the deployment environment.
