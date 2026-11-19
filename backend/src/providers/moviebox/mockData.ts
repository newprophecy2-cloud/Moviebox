import { MovieBoxPlaybackResult } from "./types";

/**
 * Deterministic mock fixtures strictly for automated testing and explicit non-production mock mode.
 * Never treated as live MovieBox upstream availability.
 */
export const MOCK_SUBJECTS = [
  {
    subjectId: "mock-series-101",
    title: "Neon Horizon: Chronicles [Mock Fixture]",
    originalTitle: "Neon Horizon",
    subjectType: 2,
    releaseDate: "2024-04-12",
    season: 2,
    imdbRatingValue: 8.9,
    countryName: "Japan",
    director: "Kenji Takahashi",
    stars: "Aoi Sato, Ren Kobayashi",
    duration: 1440,
    genre: ["Sci-Fi", "Action", "Animation"],
    description:
      "Mock test fixture series: In a fractured orbital metropolis, an outcast pilot uncovers a signal connecting lost colony fleets.",
    seasons: [
      { se: 1, maxEp: 3 },
      { se: 2, maxEp: 0 },
    ],
    dubs: [
      { subjectId: "mock-series-101", lanName: "English", title: "English Audio" },
      { subjectId: "mock-series-101-ja", lanName: "Japanese", title: "Japanese Audio" },
    ],
  },
  {
    subjectId: "mock-movie-202",
    title: "Orbital Drift [Mock Fixture]",
    originalTitle: "Orbital Drift",
    subjectType: 1,
    releaseDate: "2025-01-18",
    imdbRatingValue: 8.4,
    countryName: "United States",
    director: "Elena Vance",
    stars: "Marcus Reed, Claire Lin",
    duration: 7200,
    genre: ["Thriller", "Adventure", "Sci-Fi"],
    description:
      "Mock test fixture movie: A salvage crew intercepts a drifting research vessel carrying an encrypted quantum archive.",
    seasons: [],
    dubs: [{ subjectId: "mock-movie-202", lanName: "English", title: "English Audio" }],
  },
];

export function getMockSearchPayload(query: string, subjectType: number = 0) {
  const q = query.trim().toLowerCase();
  if (q === "__empty__" || q === "no_results_fixture") {
    return {
      results: [{ subjects: [] }],
      pager: { hasMore: false, totalCount: 0 },
    };
  }
  let matches = MOCK_SUBJECTS.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.genre.some((g) => g.toLowerCase().includes(q))
  );
  if (subjectType === 1 || subjectType === 2) {
    matches = matches.filter((s) => s.subjectType === subjectType);
  }
  return {
    results: [{ subjects: matches }],
    pager: { hasMore: false, totalCount: matches.length },
  };
}

export function getMockDetailsPayload(subjectId: string) {
  const normalized = subjectId === "mock-series-101-ja" ? "mock-series-101" : subjectId;
  const match = MOCK_SUBJECTS.find((s) => s.subjectId === normalized);
  if (!match) {
    return null;
  }
  return {
    subject: {
      ...match,
      subjectId,
    },
    seasons: {
      seasons: match.seasons,
    },
  };
}

export function getMockPlaybackResult(
  subjectId: string,
  season: number,
  episode: number,
  mediaType?: "movie" | "series" | "unresolved"
): MovieBoxPlaybackResult {
  const isSeries = mediaType === "series" || season > 0 || episode > 0;
  const se = isSeries ? Math.max(1, season || 1) : 0;
  const ep = isSeries ? Math.max(1, episode || 1) : 0;
  const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
  return {
    subjectId,
    season: se,
    episode: ep,
    resourceId: `${subjectId}-res-${se}-${ep}`,
    streams: [
      {
        id: `mock-hls-${se}-${ep}`,
        resourceId: `${subjectId}-res-${se}-${ep}`,
        label: "1080p H264 HLS",
        quality: "1080p",
        resolution: 1080,
        format: "hls",
        codec: "h264",
        language: subjectId.endsWith("-ja") ? "Japanese" : "English",
        url: `/api/v1/mock-media/${encodeURIComponent(subjectId)}/playlist.m3u8`,
        requiresCustomHeaders: false,
        hasSignedCookie: false,
        browserCompatible: true,
        expiresAt,
      },
      {
        id: `mock-mp4-${se}-${ep}`,
        resourceId: `${subjectId}-res-${se}-${ep}`,
        label: "720p H264 MP4",
        quality: "720p",
        resolution: 720,
        format: "mp4",
        codec: "h264",
        language: subjectId.endsWith("-ja") ? "Japanese" : "English",
        url: `/api/v1/mock-media/${encodeURIComponent(subjectId)}/sample.mp4`,
        requiresCustomHeaders: false,
        hasSignedCookie: false,
        browserCompatible: true,
        expiresAt,
      },
    ],
    subtitles: [
      {
        id: "mock-sub-en",
        name: "English",
        languageCode: "en",
        url: `/api/v1/mock-media/${encodeURIComponent(subjectId)}/subtitles-en.vtt`,
        format: "vtt",
      },
      {
        id: "mock-sub-es",
        name: "Spanish",
        languageCode: "es",
        url: `/api/v1/mock-media/${encodeURIComponent(subjectId)}/subtitles-es.srt`,
        format: "srt",
      },
    ],
    audioTracks: [
      { subjectId: "mock-series-101", language: "English", label: "English Audio", languageCode: "en" },
      { subjectId: "mock-series-101-ja", language: "Japanese", label: "Japanese Audio", languageCode: "ja" },
    ],
    placeholderCount: 0,
    fetchedAt: Date.now(),
  };
}
