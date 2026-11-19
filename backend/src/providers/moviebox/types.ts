export type MovieBoxMediaType = "movie" | "series";
export type MovieBoxResolvedMediaType = MovieBoxMediaType | "unresolved";
export type StreamDeliveryMode = "proxy" | "direct";

export interface MovieBoxSession {
  token: string;
  userId?: string;
  expiresAt?: number; // Unix seconds
  createdAt: number; // Unix seconds
}

export interface MovieBoxCatalogItem {
  id: string;
  provider: "moviebox";
  title: string;
  mediaType: MovieBoxMediaType;
  year?: string;
  posterUrl?: string;
  seasonCount?: number;
  rating?: string;
  genres?: string[];
  description?: string;
}

export interface MovieBoxEpisode {
  id: string;
  providerEpisodeId?: string;
  subjectId: string;
  season: number;
  number: number;
  title: string;
  overview?: string;
  thumbnailUrl?: string;
  duration?: string;
}

export interface MovieBoxSeason {
  number: number;
  maxEpisode: number;
  episodes: MovieBoxEpisode[];
}

export interface MovieBoxAudioTrackOption {
  subjectId: string;
  language: string;
  label: string;
  languageCode?: string;
}

export interface MovieBoxMediaDetails {
  id: string;
  provider: "moviebox";
  title: string;
  originalTitle?: string;
  mediaType: MovieBoxResolvedMediaType;
  year?: string;
  description?: string;
  tagline?: string;
  imdbRating?: string;
  country?: string;
  director?: string;
  stars?: string;
  prints?: string;
  audios?: string;
  posterUrl?: string;
  backdropUrl?: string;
  duration?: string;
  genres: string[];
  seasons: MovieBoxSeason[];
  dubs: MovieBoxAudioTrackOption[];
}

export interface MovieBoxSubtitleOption {
  id: string;
  name: string;
  languageCode?: string;
  url: string;
  format: "srt" | "vtt" | "unknown";
  upstreamCookie?: string;
}

export interface MovieBoxStreamVariant {
  id: string;
  resourceId?: string;
  label: string;
  quality: string;
  resolution: number;
  format: "mp4" | "dash" | "hls" | "unknown";
  codec?: string;
  language?: string;
  sizeBytes?: number;
  url: string;
  requiresCustomHeaders: boolean;
  hasSignedCookie: boolean;
  browserCompatible: boolean;
  notes?: string;
  upstreamCookie?: string;
  expiresAt?: string;
}

export interface MovieBoxPlaybackResult {
  subjectId: string;
  season: number;
  episode: number;
  resourceId?: string;
  streams: MovieBoxStreamVariant[];
  subtitles: MovieBoxSubtitleOption[];
  audioTracks: MovieBoxAudioTrackOption[];
  placeholderCount: number;
  fetchedAt: number;
}

// --- Normalized Public API Response Types ---

export interface NormalizedSearchItem {
  id: string;
  provider: "moviebox";
  title: string;
  media_type: MovieBoxMediaType;
  year: string | null;
  poster: string | null;
  season_count: number | null;
  rating: string | null;
  genres: string[];
}

export interface NormalizedSearchResponse {
  query: string;
  page: number;
  has_more: boolean;
  total_results: number | null;
  results: NormalizedSearchItem[];
}

export interface NormalizedSeasonSummary {
  season_number: number;
  episode_count: number;
}

export interface NormalizedSeriesDetails {
  id: string;
  provider: "moviebox";
  media_type: "series";
  title: string;
  original_title: string | null;
  description: string | null;
  year: string | null;
  poster: string | null;
  backdrop: string | null;
  rating: string | null;
  genres: string[];
  seasons: NormalizedSeasonSummary[];
  audio_languages: string[];
}

export interface NormalizedMovieDetails {
  id: string;
  provider: "moviebox";
  media_type: "movie";
  title: string;
  original_title: string | null;
  description: string | null;
  year: string | null;
  poster: string | null;
  backdrop: string | null;
  rating: string | null;
  duration: string | null;
  genres: string[];
  audio_languages: string[];
}

export type NormalizedDetailsResponse = NormalizedSeriesDetails | NormalizedMovieDetails;

export interface NormalizedEpisodeItem {
  id: string;
  provider_episode_id: string | null;
  series_id: string;
  season_number: number;
  episode_number: number;
  title: string;
  overview: string | null;
  thumbnail: string | null;
  duration: string | null;
}

export interface NormalizedEpisodesResponse {
  series_id: string;
  season: number | null;
  total_episodes: number;
  episodes: NormalizedEpisodeItem[];
}

export interface NormalizedAudioTrack {
  subject_id: string;
  language: string;
  label: string;
  language_code: string | null;
}

export interface NormalizedSubtitleTrack {
  id: string;
  name: string;
  language_code: string | null;
  format: "srt" | "vtt" | "unknown";
  url: string;
}

export interface NormalizedStreamVariant {
  id: string;
  resource_id: string | null;
  provider_resource_id: string | null;
  delivery_mode: StreamDeliveryMode;
  quality: string;
  resolution: number;
  format: "mp4" | "hls" | "dash" | "unknown";
  codec: string | null;
  language: string | null;
  size_bytes: number | null;
  stream_url: string;
  browser_compatible: boolean;
  expires_at: string | null;
}

export interface NormalizedPrimaryStream extends NormalizedStreamVariant {
  audio_tracks: NormalizedAudioTrack[];
  subtitles: NormalizedSubtitleTrack[];
}

export interface NormalizedUnifiedStreamResponse {
  media_type: "movie" | "episode";
  media_id: string;
  delivery_mode: StreamDeliveryMode;
  series_id?: string;
  season_number?: number;
  episode_number?: number;
  stream: NormalizedPrimaryStream;
  streams: NormalizedStreamVariant[];
}
