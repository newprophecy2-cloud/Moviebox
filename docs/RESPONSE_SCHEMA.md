# Response Schema Reference

All normalized TypeScript interfaces live in `backend/src/providers/moviebox/types.ts`. Missing upstream fields are always normalized to `null` or `[]` and are never fabricated.

## 1. Envelope Types

### Success Envelope
```json
{
  "status": "success",
  "data": {}
}
```

### Error Envelope
```json
{
  "status": "error",
  "code": "STRING_ERROR_CODE",
  "message": "Human-readable explanation",
  "retryable": false,
  "request_id": "req-xxxxxxxxxxxx"
}
```

## 2. `GET /api/v1/search` (`NormalizedSearchResponse`)

| Field | Type | Notes |
| --- | --- | --- |
| `query` | `string` | Trimmed search keyword |
| `page` | `number` | Current page (`>= 1`) |
| `has_more` | `boolean` | Upstream `pager.hasMore` flag |
| `total_results` | `number \| null` | Upstream `pager.totalCount` or mapped result count |
| `results` | `NormalizedSearchItem[]` | Normalized catalog entries |

`NormalizedSearchItem`:
- `id`: `string`
- `provider`: `"moviebox"`
- `title`: `string`
- `media_type`: `"movie" | "series"`
- `year`: `string | null`
- `poster`: `string | null`
- `season_count`: `number | null` (`null` for `movie`)
- `rating`: `string | null`
- `genres`: `string[]`

## 3. `GET /api/v1/details/:id` (`NormalizedDetailsResponse`)

### Movie (`media_type: "movie"`)
`id`, `provider`, `media_type`, `title`, `original_title`, `description`, `year`, `poster`, `backdrop`, `rating`, `duration`, `genres`, `audio_languages`. (Does **not** include `seasons`.)

### Series (`media_type: "series"`)
`id`, `provider`, `media_type`, `title`, `original_title`, `description`, `year`, `poster`, `backdrop`, `rating`, `genres`, `seasons` (`Array<{ season_number: number; episode_count: number }>`), `audio_languages`. (Does **not** include `duration`.)

## 4. `GET /api/v1/details/:id/episodes` (`NormalizedEpisodesResponse`)

| Field | Type | Notes |
| --- | --- | --- |
| `series_id` | `string` | Parent series subject ID |
| `season` | `number \| null` | Requested season filter or `null` when returning all seasons |
| `total_episodes` | `number` | Count of returned episodes |
| `episodes` | `NormalizedEpisodeItem[]` | Sorted by `(season_number, episode_number)` |

`NormalizedEpisodeItem`:
- `id`: `string` (`{series_id}_s{season}_e{episode}`)
- `provider_episode_id`: `string | null` (actual upstream episode ID if supplied, otherwise `null`)
- `series_id`: `string`
- `season_number`: `number`
- `episode_number`: `number`
- `title`: `string`
- `overview`: `string | null`
- `thumbnail`: `string | null`
- `duration`: `string | null`

## 5. `GET /api/v1/stream/:id` (`NormalizedUnifiedStreamResponse`)

| Field | Type | Notes |
| --- | --- | --- |
| `media_type` | `"movie" \| "episode"` | Resolved target kind |
| `media_id` | `string` | Movie subject ID or composite `{series_id}_s{season}_e{episode}` |
| `delivery_mode` | `"proxy" \| "direct"` | Active stream delivery mode used for `stream` and `streams` |
| `series_id` | `string` (optional) | Present only when `media_type === "episode"` |
| `season_number` | `number` (optional) | Present only when `media_type === "episode"` |
| `episode_number` | `number` (optional) | Present only when `media_type === "episode"` |
| `stream` | `NormalizedPrimaryStream` | Highest-ranked stream variant + `audio_tracks` + `subtitles` |
| `streams` | `NormalizedStreamVariant[]` | All resolved variants sorted by resolution descending (preserving distinct resources/codecs/languages at identical quality) |

`NormalizedStreamVariant`:
- `id`: `string`
- `resource_id`: `string | null`
- `provider_resource_id`: `string | null` (provider resource ID preserved independently of `media_id`)
- `delivery_mode`: `"proxy" | "direct"`
- `quality`: `string` (e.g. `"1080p"`)
- `resolution`: `number`
- `format`: `"mp4" | "hls" | "dash" | "unknown"`
- `codec`: `string | null`
- `language`: `string | null`
- `size_bytes`: `number | null`
- `stream_url`: `string` (signed `/api/v1/stream-proxy?token=...` URL in `proxy` mode, or credential-free authorized provider URL in `direct` mode)
- `browser_compatible`: `boolean`
- `expires_at`: `string | null` (ISO-8601 expiration timestamp)

`NormalizedAudioTrack.language_code` and `NormalizedSubtitleTrack.language_code` are `string | null` and are returned strictly as provided by upstream metadata (never synthesized when absent).
