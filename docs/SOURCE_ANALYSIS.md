# Source Code Analysis: ProphecyVerse MovieBox Provider Reference

**Reference Repository:** `https://github.com/newprophecy2-cloud/ProphecyVerse`  
**Branch:** `prophecyverse-website`  
**Commit:** `a41ddcb13bc277d4858fc7b5f2f68a8e054ef23e`

---

## 1. Reusable Source Files

The following backend files from the reference repository provide the MovieBox protocol implementation, mappers, proxy hardening, and service primitives:

- `backend/src/providers/moviebox/config.ts` — Upstream BFF endpoint paths, timeouts (`requestTimeoutMs`, `captionTimeoutMs`), retry backoff, pagination limits, and session age constants.
- `backend/src/providers/moviebox/crypto.ts` — Secret decoding (`base64:`, `hex:`, `escaped:`, `utf8:`), `x-client-token` generation (reversed timestamp MD5), `x-tr-signature` canonical string builder and HMAC-MD5 request signing, optional `x-client-build` tag generation, and `MovieBoxAuthDiagnostics`.
- `backend/src/providers/moviebox/session.ts` — JWT payload decoding (`parseJwtClaims`), `createSessionFromToken`, and `isSessionValid` expiration checking with safety buffer.
- `backend/src/providers/moviebox/errors.ts` — `MovieBoxError` error class, error codes, and retryable HTTP status classification (`403, 406, 407, 429, 500, 502, 503, 504`).
- `backend/src/providers/moviebox/types.ts` — Core TypeScript interfaces (`MovieBoxSession`, `MovieBoxCatalogItem`, `MovieBoxEpisode`, `MovieBoxSeason`, `MovieBoxAudioTrackOption`, `MovieBoxMediaDetails`, `MovieBoxSubtitleOption`, `MovieBoxStreamVariant`, `MovieBoxPlaybackResult`).
- `backend/src/providers/moviebox/mapper.ts` — Upstream response normalizers (`mapSubjectToCatalogItem`, `mapSearchToCatalog`, `mapDetailsToMediaDetails`, `mapPlayInfoToStreams`, `mapResourceItemToStream`, `mapDetectorItemsToStreams`, `mapCaptionsToOptions`, `resolveDashManifestFromPolicy`, `isDeprecationNoticeUrl`, `sanitizeLanguageLabel`).
- `backend/src/providers/moviebox/mockData.ts` — Deterministic mock fixtures for offline unit/integration testing (`MOCK_SUBJECTS`, `getMockSearchPayload`, `getMockDetailsPayload`, `getMockPlaybackResult`).
- `backend/src/services/moviebox.service.ts` (`MovieBoxService` / `MovieBoxClient`) — Host rotation (`getHosts`, `rotateHost`), single-flight `visitor-login` session initialization, automatic `x-user` header absorption, retry/failover across host pool, and BFF endpoint wrappers.
- `backend/src/services/streamProxyService.ts` — HMAC-SHA256 signed short-lived proxy tokens (`v1.<payload>.<sig>`), strict HTTPS & hostname allowlist (`MOVIEBOX_MEDIA_HOSTS`), DNS pinning SSRF protection (`isPrivateOrReservedIp`), HTTP redirect hop validation, byte-range forwarding (`Range` / `206`), HLS `.m3u8` URI rewriting, DASH `.mpd` `<BaseURL>` and `SegmentTemplate` directory token (`/api/v1/stream-proxy/dir/:token/*`) rewriting with path traversal defense.
- `backend/src/services/cacheService.ts` — Bounded in-memory TTL cache (`maxEntries = 500`) with single-flight in-flight request deduplication (`getOrFetch`).
- `backend/src/utils/validation.ts` — Input validation helpers (`validateSubjectId`, `validatePositiveInt`, `validateSearchQuery`, `parseEpisodeDescriptor`).

---

## 2. Existing Provider Capabilities

1. **Multi-host failover**: Round-robin rotation across `MOVIEBOX_API_HOSTS` (default pool: `api6.aoneroom.com`, `api5.aoneroom.com`, `api4.aoneroom.com`, `api4sg.aoneroom.com`, `api3.aoneroom.com`, `api6sg.aoneroom.com`, `api.inmoviebox.com`).
2. **Signed mobile BFF protocol**: Generates `x-client-token`, `x-tr-signature` (`<ts>|2|<hmac-md5-base64>`), `x-client-status`, optional `x-client-build`, `x-client-info`, and `User-Agent`.
3. **Single-flight visitor session**: Automatically acquires a visitor JWT via `POST /wefeed-mobile-bff/user-api/visitor-login` (`{}` body) when no static `MOVIEBOX_AUTH_TOKEN` is set or when a `401`/`403` invalidates the active session. Also absorbs rotated session tokens from `x-user` response headers.
4. **Catalog search**: Queries `POST /wefeed-mobile-bff/subject-api/search/v2` with `keyword`, `page`, `perPage`, and `subjectType` (`0` = all, `1` = movie, `2` = series).
5. **Subject & season details**: Queries `GET /wefeed-mobile-bff/subject-api/get?subjectId=...` and, when `subjectType === 2`, fetches `GET /wefeed-mobile-bff/subject-api/season-info?subjectId=...`.
6. **Multi-source playback resolution**: Concurrently queries subject details (`resourceDetectors`), `play-info/v2`, and `resource/v2` (falling back to `resource` v1), detects placeholder/deprecation notice clips, attempts recovery via `resource-position/v2`, and fetches external subtitles via `get-ext-captions` across primary and sibling dub `subjectId`s.
7. **Secure media proxy**: Rewrites upstream media & subtitle URLs into signed same-origin `/api/v1/stream-proxy?token=...` URLs so upstream cookies (`signCookie`) and CDN URLs never leak to the browser.

---

## 3. Existing Upstream Request Methods & Response Structures

| Operation | HTTP Method & Path | Request Payload / Query | Observed Response Structure |
|---|---|---|---|
| Visitor Login | `POST /wefeed-mobile-bff/user-api/visitor-login` | `{}` | `{ code: 0\|200, data: { token, uid \| userId } }` |
| Search | `POST /wefeed-mobile-bff/subject-api/search/v2` | `{ keyword, page, perPage: 15, subjectType }` | `{ data: { results: [{ subjects: [...] }], pager: { hasMore, totalCount } } }` or `{ data: { list: [...] } }` |
| Details | `GET /wefeed-mobile-bff/subject-api/get` | `?subjectId=<id>` | `{ data: { subject: { subjectId, title, originalTitle, subjectType, releaseDate, description, intro, imdbRatingValue, cover, backdrop, stills, duration, genre, dubs, resourceDetectors } } }` |
| Season Info | `GET /wefeed-mobile-bff/subject-api/season-info` | `?subjectId=<id>` | `{ data: { seasons: [{ se, maxEp, episodeNumbers? }] } }` |
| Play Info v2 | `GET /wefeed-mobile-bff/subject-api/play-info/v2` | `?subjectId=<id>&se=<se>&ep=<ep>` (omits `se`/`ep` when `0`) | `{ data: { streams: [{ id, format, codecName, size, resolutions, url, signCookie }], displayResolutions } }` |
| Resources v2 | `GET /wefeed-mobile-bff/subject-api/resource/v2` | `?subjectId=<id>&page=1&perPage=20&all=0&startPosition=1&endPosition=1&pagerMode=2&resolution=0&se=<se>&epFrom=<ep>&epTo=<ep>&isVip=true` | `{ data: { list: [{ resourceId, id, se, ep, resolution, codecName, language, lanName, size, resourceLink, url, signCookie, cookie }] } }` |
| Resources v1 | `GET /wefeed-mobile-bff/subject-api/resource` | `?subjectId=<id>&page=<p>&perPage=20[&se=...&ep=...&resolution=...]` | `{ data: { list: [...], collectionResolutions: [{ resolution }] } }` |
| Position Recovery | `GET /wefeed-mobile-bff/subject-api/resource-position/v2` | `?subjectId=<id>&resourceId=<rid>&failUrl=<url>&failCode=404&resourceNum=0&isVip=true` | `{ data: { list: [...] } }` |
| External Captions | `GET /wefeed-mobile-bff/subject-api/get-ext-captions` | `?subjectId=<id>&resourceId=<rid>` | `{ data: { extCaptions: [{ id, lanName, lan, size, url, signCookie, cookie }] } }` |

*Note:* Upstream responses wrap payloads in `{ code, message, data }`; `MovieBoxService.requestHosts` unwraps `parsed.data` when non-null and returns `parsed` otherwise.

---

## 4. Identification Logic & Season/Episode Mapping

### Movie vs. Series Identification
- Upstream items carry `subjectType` (or `stype`):
  - `2` -> `"series"`
  - `1` (or fallback) -> `"movie"`
- Note on dub siblings: Upstream `subject.dubs` lists alternate audio-language versions as separate `subjectId` entries (`{ subjectId, lanName, title }`).

### Season & Episode Mapping
- For series (`subjectType === 2`), `season-info` returns `seasons: [{ se, maxEp, episodeNumbers? }]`.
- Notice that MovieBox does **not** consistently return per-episode titles, overviews, thumbnails, or upstream episode IDs in `season-info`!
  - When `episodeNumbers` array is present, those episode numbers are mapped; otherwise episodes `1..maxEp` are enumerated.
  - The normalized composite episode ID format is `{series_subject_id}_s{season}_e{episode}`.
  - Because `season-info` only provides season numbers and episode counts/numbers (unless upstream adds per-episode objects), `provider_episode_id` must be `null` when not returned by upstream, and `overview` / `thumbnail` / `duration` must be `null` rather than fabricated.
- In the old reference `CatalogService.getSeasons`, movies were wrapped in a synthetic single-season/episode `{ id: "${subjectId}_s0_e0", season: 0, number: 0 }`. **In the new standalone server**, Route 2 (`/api/v1/details/:id`) keeps movies and series distinct (movies do not include `seasons`), Route 3 (`/api/v1/details/:id/episodes`) returns `400 NOT_A_SERIES` for movies, and Route 4 (`/api/v1/stream/:id`) resolves movies with `season = 0, episode = 0` directly from the movie `subjectId`.

---

## 5. Playback Resolution, Audio Tracks & Subtitles

1. **Concurrent Upstream Resolution**:
   - `getSubjectDetails(subjectId)` -> extracts `dubs` (`audio_tracks`) and `resourceDetectors` streams.
   - `getPlayInfo(subjectId, season, episode)` -> extracts `streams` (including `CloudFront-Policy` / `urlprefix=` DASH manifest policy extraction when `stream.url` is absent).
   - `getEpisodeResourcesV2(subjectId, season, episode)` -> extracts `list` items; if `resourcesRes` fails and no streams were found yet, falls back to `getResourcesPage` (v1).
2. **Placeholder / Deprecation Detection**:
   - `isDeprecationNoticeUrl` detects known placeholder/deprecation notice URLs (`1c7de0bd3393702d9191801f15f88f8d`, `9a0461bc39da389663bf3dbb17091d3f`, `b164fbfb4347792950bdfbfb563d39d9`, `/notice.mp4`, `macdn.aoneroom.com/other/`).
   - When a `resource/v2` item points to a deprecation URL, `PlaybackService` calls `getResourcePosition` (`resource-position/v2`) to recover a valid CDN link.
   - If zero valid streams remain and `placeholderCount > 0`, returns `PLACEHOLDER_ONLY` (`503`).
3. **Stream Variant Normalization**:
   - Deduplicates by `baseUrl::format::resolution`.
   - Sorts descending by `resolution`, then `sizeBytes`.
   - Wraps every upstream HTTP/HTTPS stream URL through `StreamProxyService.createProxyUrl` (`kind = "media"`, passing `upstreamCookie` server-side inside the HMAC-SHA256 signed token).
   - Rejects any stream whose host is not in `MOVIEBOX_MEDIA_HOSTS`.
4. **Audio Tracks**:
   - Mapped from `subject.dubs` -> `subject_id`, `language`, `label`, plus normalized ISO `language_code` via `languageToCode`.
5. **Subtitles**:
   - Uses `primaryResourceId` and up to 3 sibling dub `subjectId`s to query `get-ext-captions`.
   - Filters known broken/empty placeholder captions (`aa348f2541d13ffe`, `size <= 50`).
   - Sanitizes language names, deduplicates by normalized language, sorts English first, and proxies subtitle URLs via `StreamProxyService` (`kind = "subtitle"`).

---

## 6. Known Limitations, Incomplete Functionality & Integration Risks

1. **Upstream Availability & Network Restrictions**: MovieBox BFF endpoints (`api*.aoneroom.com`, `api.inmoviebox.com`) are third-party mobile BFF services subject to geo-blocking, TLS/WAF challenges, rate limiting (`429`), signature enforcement (`407`), or upstream downtime. Code existence does not guarantee live upstream reachability from any given hosting environment.
2. **Protocol Signing Volatility**: Default compatibility constants (`x-client-build`, `x-tr-signature`, `User-Agent`, `x-client-info`) may be rotated or invalidated by MovieBox upstream app updates, causing `HTTP 407 PROVIDER_AUTH_REQUIRED`.
3. **Limited Per-Episode Metadata**: MovieBox `season-info` typically returns `{ se, maxEp }` without episode titles, synopses, thumbnails, or distinct `provider_episode_id`s.
4. **PlayInfo Resolution Size Estimation**: When `play-info/v2` returns a single `size` for multiple comma-separated `resolutions` (e.g., `"1080,720,480"`), `mapPlayInfoToStreams` estimates lower-resolution sizes proportionally rather than receiving exact per-resolution byte counts.
5. **In-Memory Caching vs. Persistent Config**: Reference `cacheService` and `MovieBoxService` host/session state were strictly in-memory (`env` singleton). In the standalone provider server, provider runtime configuration, enable/disable state, health history, audit logs, and request/provider logs are persisted in SQLite with explicit runtime overrides.
6. **Public Route Proliferation in Reference**: The reference repo exposed 11 `/api/v1/*` routes tailored to a public anime streaming site (`/anime/*`, `/catalog/home`, `/playback/*`, `/captions/*`). These are replaced by the **exact four public API routes** (`/api/v1/search`, `/api/v1/details/:id`, `/api/v1/details/:id/episodes`, `/api/v1/stream/:id`) plus the signed `/api/v1/stream-proxy` media gateway and authenticated `/api/admin/*` management routes.
7. **Mock Data Leaks**: `mockData.ts` in the reference repo used `images.unsplash.com` URLs and could be activated if `MOVIEBOX_MOCK_MODE=true`. In production (`NODE_ENV=production`), mock mode must be strictly enforced as disabled, and mock fixtures must never be treated as live provider availability.
