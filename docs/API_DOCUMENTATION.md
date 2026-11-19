# Public API Documentation — ProphecyVerse MovieBox Provider

All public media routes live under `/api/v1` and return normalized JSON envelopes with `status: "success"` or structured `status: "error"` objects including `request_id`.

---

## Primary Public Routes (4 Routes)

### 1. Search Catalog

`GET /api/v1/search`

Query Parameters:
- `q` (required, string, 1–120 chars): Search keyword.
- `page` (optional, integer `1–100`, default `1`): Page index.
- `type` (optional, `"all" | "movie" | "series"`, default `"all"`): Media type filter.

Example Request:
```http
GET /api/v1/search?q=Naruto&page=1&type=series
```

Example Success Response (`200 OK`):
```json
{
  "status": "success",
  "data": {
    "query": "Naruto",
    "page": 1,
    "has_more": true,
    "total_results": 15,
    "results": [
      {
        "id": "sr-200",
        "provider": "moviebox",
        "title": "Naruto Chronicles",
        "media_type": "series",
        "year": "2002",
        "poster": "https://cdn.aoneroom.com/posters/sr200.jpg",
        "season_count": 2,
        "rating": "8.9",
        "genres": ["Animation", "Action"]
      }
    ]
  }
}
```

---

### 2. Get Media Details

`GET /api/v1/details/:id`

Path Parameters:
- `id` (required, `[a-zA-Z0-9_-]{1,64}`): Subject identifier returned by `/api/v1/search`.

Returns distinct normalized schemas for **movies** (`duration` present, no `seasons` field) and **series** (`seasons` summary array present, no `duration` field).

Example Movie Response (`200 OK`):
```json
{
  "status": "success",
  "data": {
    "id": "mv-100",
    "provider": "moviebox",
    "media_type": "movie",
    "title": "Inception Orbit",
    "original_title": "Inception Orbit",
    "description": "A deep-space heist movie.",
    "year": "2024",
    "poster": "https://cdn.aoneroom.com/posters/mv100.jpg",
    "backdrop": "https://cdn.aoneroom.com/backdrops/mv100.jpg",
    "rating": "8.6",
    "duration": "120 min",
    "genres": ["Sci-Fi", "Thriller"],
    "audio_languages": ["English"]
  }
}
```

Example Series Response (`200 OK`):
```json
{
  "status": "success",
  "data": {
    "id": "sr-200",
    "provider": "moviebox",
    "media_type": "series",
    "title": "Naruto Chronicles",
    "original_title": "NARUTO",
    "description": "Shinobi saga.",
    "year": "2002",
    "poster": "https://cdn.aoneroom.com/posters/sr200.jpg",
    "backdrop": null,
    "rating": "8.9",
    "genres": ["Animation", "Action"],
    "seasons": [
      { "season_number": 1, "episode_count": 2 },
      { "season_number": 2, "episode_count": 0 }
    ],
    "audio_languages": ["Japanese", "English"]
  }
}
```

---

### 3. Get Series Episodes

`GET /api/v1/details/:id/episodes`

Path Parameters:
- `id` (required, `[a-zA-Z0-9_-]{1,64}`): Series subject identifier.

Query Parameters:
- `season` (optional, integer `1–500`): Filter episodes to a specific season. When omitted, returns all seasons sorted by `(season_number, episode_number)` and sets `data.season` to `null`.

Calling this endpoint on a **movie** returns `400 Bad Request` with `code: "NOT_A_SERIES"`.

Example Success Response (`200 OK`):
```json
{
  "status": "success",
  "data": {
    "series_id": "sr-200",
    "season": 1,
    "total_episodes": 2,
    "episodes": [
      {
        "id": "sr-200_s1_e1",
        "provider_episode_id": "up-ep-1",
        "series_id": "sr-200",
        "season_number": 1,
        "episode_number": 1,
        "title": "Enter: Naruto Uzumaki!",
        "overview": null,
        "thumbnail": null,
        "duration": "23 min"
      },
      {
        "id": "sr-200_s1_e2",
        "provider_episode_id": null,
        "series_id": "sr-200",
        "season_number": 1,
        "episode_number": 2,
        "title": "My Name is Konohamaru!",
        "overview": null,
        "thumbnail": null,
        "duration": "23 min"
      }
    ]
  }
}
```

---

### 4. Unified Stream Resolution

`GET /api/v1/stream/:id`

Path Parameters:
- `id`:
  - For **movies**: the movie subject ID (e.g., `mv-100`).
  - For **episodes**: the composite episode ID returned by `/episodes` in the format `{series_id}_s{season}_e{episode}` (e.g., `sr-200_s1_e1`).

Query Parameters:
- `delivery` (optional, `"proxy" | "direct"`): Stream delivery mode. When omitted, defaults to the server's configured default (`DEFAULT_STREAM_DELIVERY` / Admin Stream Delivery setting, `"proxy"` by default). Invalid values return `400 INVALID_DELIVERY_MODE`. Requesting `delivery=direct` never silently falls back to proxy mode; if no authorized direct provider playback URL is available without private cookies/headers, the server returns `404 DIRECT_URL_UNAVAILABLE`.
- `refresh` (optional, `"true"` or `"1"`): Bypass short-lived raw upstream cache.

Notes:
- Passing a bare series ID (e.g., `GET /api/v1/stream/sr-200`) returns `400 Bad Request` with `code: "EPISODE_REQUIRED"`.
- Upstream CDN URLs are never returned raw to clients when `delivery=proxy`; they are wrapped in HMAC-signed `/api/v1/stream-proxy?token=...` URLs (prefixed with `PUBLIC_BASE_URL` / `RENDER_EXTERNAL_URL` when configured).
- Multiple variants sharing the same resolution/quality from distinct upstream resource IDs, codecs, or languages are preserved without collapsing by quality alone.

Example Episode Stream Response (`200 OK`, `delivery=proxy`):
```json
{
  "status": "success",
  "data": {
    "media_type": "episode",
    "media_id": "sr-200_s1_e1",
    "delivery_mode": "proxy",
    "series_id": "sr-200",
    "season_number": 1,
    "episode_number": 1,
    "stream": {
      "id": "st-primary_1080",
      "resource_id": "st-primary",
      "provider_resource_id": "st-primary",
      "delivery_mode": "proxy",
      "quality": "1080p",
      "resolution": 1080,
      "format": "hls",
      "codec": "h264",
      "language": "Japanese",
      "size_bytes": 950000000,
      "stream_url": "https://service.onrender.com/api/v1/stream-proxy?token=v1...",
      "browser_compatible": true,
      "expires_at": "2026-11-19T16:35:00.000Z",
      "audio_tracks": [
        { "subject_id": "sr-200", "language": "Japanese", "label": "Japanese", "language_code": null },
        { "subject_id": "sr-200-en", "language": "English", "label": "English Dub", "language_code": "en" }
      ],
      "subtitles": [
        {
          "id": "cap-en",
          "name": "English",
          "language_code": "en",
          "format": "vtt",
          "url": "https://service.onrender.com/api/v1/stream-proxy?token=v1..."
        }
      ]
    },
    "streams": [
      {
        "id": "st-primary_1080",
        "resource_id": "st-primary",
        "provider_resource_id": "st-primary",
        "delivery_mode": "proxy",
        "quality": "1080p",
        "resolution": 1080,
        "format": "hls",
        "codec": "h264",
        "language": "Japanese",
        "size_bytes": 950000000,
        "stream_url": "https://service.onrender.com/api/v1/stream-proxy?token=v1...",
        "browser_compatible": true,
        "expires_at": "2026-11-19T16:35:00.000Z"
      }
    ]
  }
}
```

---

## Supporting Endpoints

- `GET /health` and `GET /api/health` — Public server health & diagnostic status (never exposes raw secrets).
- `GET|HEAD /api/v1/stream-proxy?token=...` — Signed media/subtitle/manifest proxy with `Range` (`206 Partial Content`) support.
- `GET|HEAD /api/v1/stream-proxy/dir/:token/*` — Signed directory proxy for DASH `SegmentTemplate` URLs.
- `/api/admin/*` — Authenticated Admin Management API (session cookie / Bearer token + RBAC).

---

## Structured Error Envelope

```json
{
  "status": "error",
  "code": "EPISODE_REQUIRED",
  "message": "Series 'sr-200' requires an episode descriptor in the format sr-200_s{season}_e{episode}.",
  "retryable": false,
  "request_id": "req-3f9b2c1a80d1"
}
```

Common Error Codes:
- `INVALID_INPUT` (`400`) — Invalid query parameters, malformed ID, or malformed composite episode ID.
- `INVALID_DELIVERY_MODE` (`400`) — Invalid `delivery` query parameter (must be `"proxy"` or `"direct"`), or requested delivery mode disabled in Admin configuration.
- `NOT_A_SERIES` (`400`) — Requested `/episodes` for a movie subject.
- `EPISODE_REQUIRED` (`400`) — Requested `/stream/:id` with a bare series ID instead of `{series_id}_s{season}_e{episode}`.
- `UNAUTHORIZED` (`401`) / `FORBIDDEN` (`403`) — Admin auth/RBAC failure.
- `PROXY_TOKEN_INVALID` (`403`) — Signed proxy token is missing, malformed, or failed HMAC verification.
- `PROXY_TOKEN_EXPIRED` (`403`) — Signed proxy token passed its `exp` timestamp.
- `MEDIA_NOT_FOUND` (`404`) — Subject, season, or episode does not exist.
- `MEDIA_TYPE_UNRESOLVED` (`422`) — Provider metadata could not establish whether the media ID is a movie or series.
- `STREAM_NOT_FOUND` (`404`) — Upstream returned no playable stream variants for the requested media.
- `DIRECT_URL_UNAVAILABLE` (`404`) — `delivery=direct` was requested, but no authorized credential-free direct playback URL was exposed by the provider.
- `PROVIDER_AUTH_REQUIRED` (`424`) — Missing or rejected upstream `x-tr-signature` / session credentials.
- `RATE_LIMIT_EXCEEDED` (`429`) / `UPSTREAM_RATE_LIMITED` (`429`) — Rate limit triggered.
- `STREAM_PROXY_ERROR` (`403` / `502` / `504`) — Blocked CDN host or upstream proxy fetch failure.
- `PROVIDER_DISABLED` (`503`) — Provider disabled by administrator.
- `PLACEHOLDER_ONLY` (`503`) — MovieBox upstream returned only deprecation/notice placeholder video clips.
- `UPSTREAM_TIMEOUT` (`504`) — Upstream request exceeded configured `request_timeout_ms`.
- `UPSTREAM_UNAVAILABLE` (`502` / `503`) — All configured MovieBox upstream hosts failed.
