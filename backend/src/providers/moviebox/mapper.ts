import {
  MovieBoxAudioTrackOption,
  MovieBoxCatalogItem,
  MovieBoxEpisode,
  MovieBoxMediaDetails,
  MovieBoxResolvedMediaType,
  MovieBoxSeason,
  MovieBoxStreamVariant,
  MovieBoxSubtitleOption,
} from "./types";

const KNOWN_LANGUAGE_TAGS = [
  "hindi",
  "tamil",
  "telugu",
  "malayalam",
  "kannada",
  "bengali",
  "marathi",
  "punjabi",
  "gujarati",
  "urdu",
  "english",
  "spanish",
  "french",
  "german",
  "italian",
  "japanese",
  "korean",
  "chinese",
  "russian",
  "portuguese",
  "turkish",
  "arabic",
  "dub",
  "audio",
  "multi",
  "season",
];

const LANGUAGE_TO_CODE: Record<string, string> = {
  english: "en",
  en: "en",
  eng: "en",
  spanish: "es",
  es: "es",
  spa: "es",
  "español": "es",
  castellano: "es",
  hindi: "hi",
  hi: "hi",
  hin: "hi",
  french: "fr",
  fr: "fr",
  fre: "fr",
  fra: "fr",
  "français": "fr",
  german: "de",
  de: "de",
  ger: "de",
  deu: "de",
  deutsch: "de",
  italian: "it",
  it: "it",
  ita: "it",
  italiano: "it",
  japanese: "ja",
  ja: "ja",
  jpn: "ja",
  "日本語": "ja",
  korean: "ko",
  ko: "ko",
  kor: "ko",
  "한국어": "ko",
  chinese: "zh",
  zh: "zh",
  zho: "zh",
  chi: "zh",
  "中文": "zh",
  mandarin: "zh",
  cantonese: "zh",
  portuguese: "pt",
  pt: "pt",
  por: "pt",
  "português": "pt",
  russian: "ru",
  ru: "ru",
  rus: "ru",
  "русский": "ru",
  arabic: "ar",
  ar: "ar",
  ara: "ar",
  "العربية": "ar",
  turkish: "tr",
  tr: "tr",
  tur: "tr",
  "türkçe": "tr",
  bengali: "bn",
  bn: "bn",
  ben: "bn",
  "বাংলা": "bn",
  tamil: "ta",
  ta: "ta",
  tam: "ta",
  "தமிழ்": "ta",
  telugu: "te",
  te: "te",
  tel: "te",
  "తెలుగు": "te",
  indonesian: "id",
  id: "id",
  ind: "id",
  bahasa: "id",
  thai: "th",
  th: "th",
  tha: "th",
  "ไทย": "th",
  vietnamese: "vi",
  vi: "vi",
  vie: "vi",
  "tiếng việt": "vi",
  malayalam: "ml",
  ml: "ml",
  mal: "ml",
  "മലയാളം": "ml",
  kannada: "kn",
  kn: "kn",
  kan: "kn",
  "ಕನ್ನಡ": "kn",
  marathi: "mr",
  mr: "mr",
  mar: "mr",
  "मराठी": "mr",
  punjabi: "pa",
  pa: "pa",
  pan: "pa",
  "ਪੰਜਾਬੀ": "pa",
  gujarati: "gu",
  gu: "gu",
  guj: "gu",
  "ગુજરાતી": "gu",
  urdu: "ur",
  ur: "ur",
  urd: "ur",
  "اردو": "ur",
  "أردو": "ur",
  dutch: "nl",
  nl: "nl",
  dut: "nl",
  nld: "nl",
  nederlands: "nl",
  polish: "pl",
  pl: "pl",
  pol: "pl",
  polski: "pl",
  swedish: "sv",
  sv: "sv",
  swe: "sv",
  svenska: "sv",
  danish: "da",
  da: "da",
  dan: "da",
  dansk: "da",
  norwegian: "no",
  no: "no",
  nor: "no",
  norsk: "no",
  finnish: "fi",
  fi: "fi",
  fin: "fi",
  suomi: "fi",
  greek: "el",
  el: "el",
  ell: "el",
  gre: "el",
  "ελληνικά": "el",
  hebrew: "he",
  he: "he",
  heb: "he",
  "עברית": "he",
  czech: "cs",
  cs: "cs",
  cze: "cs",
  ces: "cs",
  "čeština": "cs",
  hungarian: "hu",
  hu: "hu",
  hun: "hu",
  magyar: "hu",
  romanian: "ro",
  ro: "ro",
  rum: "ro",
  ron: "ro",
  "română": "ro",
  ukrainian: "uk",
  uk: "uk",
  ukr: "uk",
  "українська": "uk",
  persian: "fa",
  fa: "fa",
  fas: "fa",
  per: "fa",
  "فارسی": "fa",
  tagalog: "tl",
  tl: "tl",
  fil: "tl",
  filipino: "tl",
  malay: "ms",
  ms: "ms",
  msa: "ms",
  may: "ms",
  melayu: "ms",
};

const CODE_TO_CANONICAL_NAME: Record<string, string> = {
  en: "English",
  es: "Spanish",
  hi: "Hindi",
  fr: "French",
  de: "German",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  pt: "Portuguese",
  ru: "Russian",
  ar: "Arabic",
  tr: "Turkish",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  mr: "Marathi",
  pa: "Punjabi",
  gu: "Gujarati",
  ur: "Urdu",
  id: "Indonesian",
  th: "Thai",
  vi: "Vietnamese",
  nl: "Dutch",
  pl: "Polish",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  el: "Greek",
  he: "Hebrew",
  cs: "Czech",
  hu: "Hungarian",
  ro: "Romanian",
  uk: "Ukrainian",
  fa: "Persian",
  tl: "Filipino",
  ms: "Malay",
};

export function languageToCode(name: string): string | undefined {
  const cleaned = name
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .trim()
    .toLowerCase();
  if (cleaned === "in_id") return "id";
  return LANGUAGE_TO_CODE[cleaned];
}

export function sanitizeLanguageLabel(name: string): string {
  const cleaned = name
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .trim();
  const code = languageToCode(cleaned);
  if (code && CODE_TO_CANONICAL_NAME[code]) {
    return CODE_TO_CANONICAL_NAME[code];
  }
  return cleaned || "Unknown";
}

export function cleanMovieBoxTitle(rawTitle: string): string {
  let title = rawTitle.trim();
  if (!title) return "";

  while (title.startsWith("[")) {
    const close = title.indexOf("]");
    if (close === -1) break;
    title = title.slice(close + 1).trim();
  }

  while (title.endsWith("]")) {
    const open = title.lastIndexOf("[");
    if (open === -1) break;
    title = title.slice(0, open).trim();
  }

  if (title.endsWith(")")) {
    const open = title.lastIndexOf("(");
    if (open > 0) {
      const inner = title.slice(open + 1, -1).trim();
      const yearNum = Number.parseInt(inner, 10);
      const isYear = /^\d{4}$/.test(inner) && yearNum >= 1900 && yearNum <= 2099;
      if (!isYear) {
        title = title.slice(0, open).trim();
      }
    }
  }

  const dashPos = title.lastIndexOf(" - ");
  if (dashPos !== -1) {
    const suffix = title.slice(dashPos + 3);
    const suffixLower = suffix.toLowerCase();
    const isTag =
      KNOWN_LANGUAGE_TAGS.some((tag) => suffixLower.includes(tag)) ||
      ((suffix.startsWith("s") || suffix.startsWith("S")) &&
        /^[\d-]+$/.test(suffix.slice(1)));
    if (isTag) {
      title = title.slice(0, dashPos).trim();
    }
  }

  const sIdx = title.lastIndexOf(" S");
  if (sIdx !== -1) {
    const suffix = title.slice(sIdx + 2);
    if (suffix.length > 0 && /^\d[\d\-S]*$/.test(suffix)) {
      title = title.slice(0, sIdx).trim();
    }
  }

  const seasonIdx = title.toLowerCase().lastIndexOf(" season ");
  if (seasonIdx !== -1) {
    title = title.slice(0, seasonIdx).trim();
  }

  for (const sep of ["_", " ", ".", "-"]) {
    const pos = title.lastIndexOf(sep);
    if (pos !== -1) {
      const suffix = title.slice(pos + 1);
      if (/^\d{3,4}[pP]$/.test(suffix)) {
        const res = Number.parseInt(suffix.slice(0, -1), 10);
        if (res >= 144 && res <= 8640) {
          title = title.slice(0, pos).trim();
        }
      }
    }
  }

  const cleaned = title.replace(/[-:_.\s]+$/, "").trim();
  return cleaned || rawTitle.trim();
}

export function extract4DigitYear(raw: unknown): string | undefined {
  if (typeof raw === "number" && raw >= 1900 && raw <= 2099) {
    return String(raw);
  }
  if (typeof raw !== "string") return undefined;
  const match = raw.match(/(19|20)\d{2}/);
  return match ? match[0] : undefined;
}

export function isDeprecationNoticeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("1c7de0bd3393702d9191801f15f88f8d") ||
    lower.includes("9a0461bc39da389663bf3dbb17091d3f") ||
    lower.includes("b164fbfb4347792950bdfbfb563d39d9") ||
    lower.includes("/notice.mp4") ||
    (lower.includes("macdn.aoneroom.com") && lower.includes("/other/"))
  );
}

function toDashMpd(urlStr: string): string | undefined {
  const base = urlStr.replace(/\*+$/, "").replace(/\/+$/, "");
  if (
    base &&
    (base.startsWith("http://") || base.startsWith("https://")) &&
    base.includes("/dash/")
  ) {
    return `${base}/index.mpd`;
  }
  return undefined;
}

export function resolveDashManifestFromPolicy(signCookie: string): string | undefined {
  if (!signCookie) return undefined;
  for (const part of signCookie.split(";")) {
    const trimmed = part.trim();
    const prefixIdx = trimmed.indexOf("urlprefix=");
    if (prefixIdx !== -1) {
      const prefixPart = trimmed.slice(prefixIdx + "urlprefix=".length);
      const b64Token = (prefixPart.split(":")[0] || prefixPart).trim();
      const normalized = b64Token.replace(/-/g, "+").replace(/_/g, "/");
      try {
        const decoded = Buffer.from(normalized, "base64").toString("utf8");
        const mpd = toDashMpd(decoded);
        if (mpd) return mpd;
      } catch {
        // ignore invalid base64
      }
    }
    if (trimmed.startsWith("CloudFront-Policy=")) {
      const raw = trimmed.slice("CloudFront-Policy=".length).trim();
      const normalized = raw.replace(/-/g, "+").replace(/_/g, "=").replace(/~/g, "/");
      try {
        const decoded = Buffer.from(normalized, "base64").toString("utf8");
        const json = JSON.parse(decoded) as {
          Statement?: Array<{ Resource?: string }>;
        };
        const resource = json.Statement?.[0]?.Resource;
        if (typeof resource === "string") {
          const mpd = toDashMpd(resource);
          if (mpd) return mpd;
        }
      } catch {
        // ignore invalid policy
      }
    }
  }
  return undefined;
}

function readId(val: unknown): string | undefined {
  if (typeof val === "string" && val.trim()) return val.trim();
  if (typeof val === "number" && Number.isFinite(val)) return String(val);
  return undefined;
}

function readNumber(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim()) {
    const n = Number(val.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function formatDuration(rawDuration: unknown): string | undefined {
  if (typeof rawDuration === "number" && Number.isFinite(rawDuration) && rawDuration > 0) {
    return `${Math.max(1, Math.floor(rawDuration / 60))} min`;
  }
  if (typeof rawDuration === "string") {
    const trimmed = rawDuration.trim();
    if (!trimmed || trimmed === "0m" || trimmed === "0" || trimmed === "0 min") {
      return undefined;
    }
    if (/^\d+m$/i.test(trimmed)) {
      return `${trimmed.slice(0, -1)} min`;
    }
    return trimmed;
  }
  return undefined;
}

export function resolveProviderMediaType(
  subject: any,
  payload?: any
): MovieBoxResolvedMediaType {
  const candidates = [
    subject?.subjectType,
    subject?.stype,
    subject?.mediaType,
    payload?.subjectType,
    payload?.stype,
    payload?.mediaType,
  ];

  for (const raw of candidates) {
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw === "number") {
      if (raw === 1) return "movie";
      if (raw === 2) return "series";
      return "unresolved";
    }
    if (typeof raw === "string") {
      const norm = raw.trim().toLowerCase();
      if (norm === "1" || norm === "movie" || norm === "film") return "movie";
      if (
        norm === "2" ||
        norm === "series" ||
        norm === "tv" ||
        norm === "tv_series" ||
        norm === "show" ||
        norm === "anime"
      ) {
        return "series";
      }
      return "unresolved";
    }
  }

  return "unresolved";
}

export function mapSubjectToCatalogItem(s: any): MovieBoxCatalogItem | null {
  if (!s || typeof s !== "object") return null;
  const id = readId(s.subjectId ?? s.id);
  if (!id) return null;

  const title = typeof s.title === "string" ? s.title : typeof s.name === "string" ? s.name : "Unknown";
  const resolvedType = resolveProviderMediaType(s);
  if (resolvedType === "unresolved") return null;
  const mediaType = resolvedType;
  const year = extract4DigitYear(s.releaseDate ?? s.year ?? s.releaseInfo);

  const posterUrl =
    (typeof s.cover?.url === "string" && s.cover.url) ||
    (typeof s.coverUrl === "string" && s.coverUrl) ||
    (typeof s.poster === "string" && s.poster) ||
    (typeof s.pic === "string" && s.pic) ||
    undefined;

  const seasonCount = readNumber(s.season);
  const rawRating = s.imdbRatingValue ?? s.rating ?? s.imdbRate;
  const rating =
    typeof rawRating === "number" && Number.isFinite(rawRating) && rawRating > 0
      ? rawRating.toFixed(1)
      : typeof rawRating === "string" && rawRating.trim()
      ? rawRating.trim()
      : undefined;

  const genres = Array.isArray(s.genre)
    ? s.genre.filter((g: unknown): g is string => typeof g === "string")
    : Array.isArray(s.genres)
    ? s.genres.filter((g: unknown): g is string => typeof g === "string")
    : undefined;

  const description =
    (typeof s.description === "string" && s.description) ||
    (typeof s.intro === "string" && s.intro) ||
    undefined;

  return {
    id,
    provider: "moviebox",
    title,
    mediaType,
    year,
    posterUrl,
    seasonCount: mediaType === "series" && seasonCount !== undefined ? Math.floor(seasonCount) : undefined,
    rating,
    genres,
    description,
  };
}

export function mapSearchToCatalog(payload: any): {
  items: MovieBoxCatalogItem[];
  hasMore: boolean;
  totalCount?: number;
} {
  const data = payload?.data ?? payload ?? {};
  const resultsSubjects = Array.isArray(data.results)
    ? (data.results.find((r: any) => Array.isArray(r?.subjects) && r.subjects.length > 0)?.subjects ??
        data.results[0]?.subjects)
    : undefined;
  const rawList: any[] = Array.isArray(resultsSubjects)
    ? resultsSubjects
    : Array.isArray(data.list)
    ? data.list
    : [];

  const items: MovieBoxCatalogItem[] = [];
  for (const s of rawList) {
    const mapped = mapSubjectToCatalogItem(s);
    if (mapped) items.push(mapped);
  }

  const pager = data.pager ?? payload?.pager ?? {};
  const hasMore = Boolean(pager.hasMore);
  const totalCount = readNumber(pager.totalCount);

  return { items, hasMore, totalCount };
}

export function mapDetailsToMediaDetails(payload: any): MovieBoxMediaDetails | null {
  const subject = payload?.data?.subject ?? payload?.subject ?? payload;
  if (!subject || typeof subject !== "object") return null;
  const id = readId(subject.subjectId ?? subject.id);
  if (!id) return null;

  const title = typeof subject.title === "string" ? subject.title : "Unknown";
  const originalTitle =
    typeof subject.originalTitle === "string" && subject.originalTitle.trim()
      ? subject.originalTitle.trim()
      : undefined;
  const mediaType = resolveProviderMediaType(subject, payload);
  const year = extract4DigitYear(subject.releaseDate ?? subject.year);
  const description =
    (typeof subject.description === "string" && subject.description.trim()) ||
    (typeof subject.intro === "string" && subject.intro.trim()) ||
    undefined;
  const tagline = typeof subject.tagline === "string" && subject.tagline.trim() ? subject.tagline.trim() : undefined;

  const rawRating = subject.imdbRatingValue ?? subject.rating;
  const imdbRating =
    typeof rawRating === "number" && Number.isFinite(rawRating) && rawRating > 0
      ? rawRating.toFixed(1)
      : typeof rawRating === "string" && rawRating.trim()
      ? rawRating.trim()
      : undefined;

  const country =
    typeof subject.countryName === "string"
      ? subject.countryName
      : typeof subject.country === "string"
      ? subject.country
      : undefined;
  const director = typeof subject.director === "string" ? subject.director : undefined;
  const stars = typeof subject.stars === "string" ? subject.stars : undefined;
  const prints = typeof subject.prints === "string" ? subject.prints : undefined;
  const audios = typeof subject.audios === "string" ? subject.audios : undefined;

  const posterUrl =
    (typeof subject.cover?.url === "string" && subject.cover.url) ||
    (typeof subject.coverUrl === "string" && subject.coverUrl) ||
    undefined;

  const backdropUrl =
    (typeof subject.backdrop?.url === "string" && subject.backdrop.url) ||
    (typeof subject.stills?.url === "string" && subject.stills.url) ||
    undefined;

  const duration = formatDuration(subject.duration);

  const genres = Array.isArray(subject.genre)
    ? subject.genre.filter((g: unknown): g is string => typeof g === "string")
    : Array.isArray(subject.genres)
    ? subject.genres.filter((g: unknown): g is string => typeof g === "string")
    : [];

  const seasons: MovieBoxSeason[] = [];
  if (mediaType === "series") {
    const rawSeasons =
      subject.seasons?.seasons ??
      subject.seasons ??
      payload?.seasons?.seasons ??
      payload?.seasons ??
      payload?.data?.seasons?.seasons ??
      payload?.data?.seasons;

    if (Array.isArray(rawSeasons)) {
      for (const s of rawSeasons) {
        const seNum = readNumber(s?.se ?? s?.seasonNumber ?? s?.season) ?? 1;
        const episodes: MovieBoxEpisode[] = [];

        if (Array.isArray(s?.episodes)) {
          for (const epObj of s.episodes) {
            const epNum = readNumber(epObj?.ep ?? epObj?.episodeNumber ?? epObj?.number);
            if (epNum === undefined) continue;
            const providerEpisodeId = readId(epObj?.episodeId ?? epObj?.providerEpisodeId ?? epObj?.id);
            episodes.push({
              id: `${id}_s${seNum}_e${epNum}`,
              providerEpisodeId,
              subjectId: id,
              season: seNum,
              number: epNum,
              title:
                (typeof epObj?.title === "string" && epObj.title.trim()) ||
                `Episode ${epNum}`,
              overview:
                typeof epObj?.overview === "string" && epObj.overview.trim()
                  ? epObj.overview.trim()
                  : undefined,
              thumbnailUrl:
                (typeof epObj?.thumbnail?.url === "string" && epObj.thumbnail.url) ||
                (typeof epObj?.thumbnailUrl === "string" && epObj.thumbnailUrl) ||
                (typeof epObj?.cover?.url === "string" && epObj.cover.url) ||
                undefined,
              duration: formatDuration(epObj?.duration),
            });
          }
        } else if (Array.isArray(s?.episodeNumbers)) {
          for (const epNumRaw of s.episodeNumbers) {
            const epNum = readNumber(epNumRaw);
            if (epNum !== undefined && epNum > 0) {
              episodes.push({
                id: `${id}_s${seNum}_e${epNum}`,
                providerEpisodeId: undefined,
                subjectId: id,
                season: seNum,
                number: epNum,
                title: `Episode ${epNum}`,
              });
            }
          }
        } else if (typeof s?.maxEp === "number" && s.maxEp > 0) {
          for (let epNum = 1; epNum <= s.maxEp; epNum++) {
            episodes.push({
              id: `${id}_s${seNum}_e${epNum}`,
              providerEpisodeId: undefined,
              subjectId: id,
              season: seNum,
              number: epNum,
              title: `Episode ${epNum}`,
            });
          }
        }

        episodes.sort((a, b) => a.number - b.number);
        seasons.push({
          number: seNum,
          maxEpisode: episodes.length > 0 ? Math.max(...episodes.map((e) => e.number)) : 0,
          episodes,
        });
      }
      seasons.sort((a, b) => a.number - b.number);
    }
  }

  const dubs: MovieBoxAudioTrackOption[] = [];
  if (Array.isArray(subject.dubs)) {
    for (const d of subject.dubs) {
      const dubSubjectId = readId(d?.subjectId ?? d?.id) || "";
      const rawLang =
        (typeof d?.lanName === "string" && d.lanName.trim()) ||
        (typeof d?.language === "string" && d.language.trim()) ||
        (typeof d?.lang === "string" && d.lang.trim()) ||
        "Unknown";
      const language = rawLang;
      const label =
        (typeof d?.title === "string" && d.title.trim()) ||
        (typeof d?.name === "string" && d.name.trim()) ||
        (typeof d?.lanName === "string" && d.lanName.trim()) ||
        language;
      const explicitCode =
        (typeof d?.languageCode === "string" && d.languageCode.trim()) ||
        (typeof d?.langCode === "string" && d.langCode.trim()) ||
        (typeof d?.lan === "string" && d.lan.trim()) ||
        (typeof d?.lang === "string" && d.lang.trim()) ||
        undefined;
      if (dubSubjectId || language !== "Unknown") {
        dubs.push({
          subjectId: dubSubjectId,
          language,
          label,
          languageCode: explicitCode,
        });
      }
    }
  }

  return {
    id,
    provider: "moviebox",
    title,
    originalTitle,
    mediaType,
    year,
    description,
    tagline,
    imdbRating,
    country,
    director,
    stars,
    prints,
    audios,
    posterUrl,
    backdropUrl,
    duration,
    genres,
    seasons,
    dubs,
  };
}

export function mapCaptionsToOptions(payload: any): MovieBoxSubtitleOption[] {
  const captions = payload?.extCaptions ?? payload?.data?.extCaptions;
  if (!Array.isArray(captions)) return [];

  const seenUrls = new Set<string>();
  const results: MovieBoxSubtitleOption[] = [];

  for (const cap of captions) {
    const url = typeof cap?.url === "string" ? cap.url : "";
    if (!url || url.includes("aa348f2541d13ffe")) continue;
    const size = readNumber(cap?.size) ?? 0;
    if (size > 0 && size <= 50) continue;

    const rawName =
      (typeof cap?.lanName === "string" && cap.lanName.trim() ? cap.lanName.trim() : undefined) ||
      (typeof cap?.lan === "string" ? cap.lan.trim() : undefined) ||
      "Unknown";
    if (rawName.toLowerCase() === "in" && (size === 0 || size <= 100)) continue;

    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const lowerClean = url.split(/[?#]/)[0]?.toLowerCase() || "";
    const format: "srt" | "vtt" | "unknown" = lowerClean.endsWith(".vtt")
      ? "vtt"
      : lowerClean.endsWith(".srt")
      ? "srt"
      : "unknown";
    const explicitCode =
      (typeof cap?.lan === "string" && cap.lan.trim()) ||
      (typeof cap?.languageCode === "string" && cap.languageCode.trim()) ||
      undefined;
    results.push({
      id: readId(cap?.id) || `${rawName}_${results.length}`,
      name: rawName,
      languageCode: explicitCode,
      url,
      format,
      upstreamCookie:
        (typeof cap?.signCookie === "string" && cap.signCookie.trim()) ||
        (typeof cap?.cookie === "string" && cap.cookie.trim()) ||
        undefined,
    });
  }
  return results;
}

export function placeholderStreamCount(payload: any): number {
  const streams = payload?.data?.streams ?? payload?.streams;
  if (!Array.isArray(streams)) return 0;
  return streams.filter(
    (s: any) => typeof s?.url === "string" && isDeprecationNoticeUrl(s.url)
  ).length;
}

function detectFormat(url: string, formatHint?: string): "mp4" | "dash" | "hls" | "unknown" {
  const clean = url.split("?")[0]?.toLowerCase() || "";
  if (clean.endsWith(".mpd") || clean.includes("/dash/") || formatHint?.toUpperCase() === "DASH") {
    return "dash";
  }
  if (clean.endsWith(".m3u8") || clean.includes("/hls/") || formatHint?.toUpperCase() === "HLS") {
    return "hls";
  }
  if (clean.endsWith(".mp4") || formatHint?.toUpperCase() === "MP4") {
    return "mp4";
  }
  return "unknown";
}

export function mapPlayInfoToStreams(payload: any): MovieBoxStreamVariant[] {
  const data = payload?.data ?? payload ?? {};
  const streams = Array.isArray(data.streams) ? data.streams : [];
  const variants: MovieBoxStreamVariant[] = [];

  for (const stream of streams) {
    const streamId = readId(stream?.id);
    const formatType = typeof stream?.format === "string" ? stream.format : "MP4";
    const codec =
      (typeof stream?.codecName === "string" && stream.codecName) ||
      (typeof stream?.codec === "string" && stream.codec) ||
      undefined;
    const sizeBytes = readNumber(stream?.size);
    const resolutionsStr =
      (typeof stream?.resolutions === "string" && stream.resolutions) ||
      (typeof data?.displayResolutions === "string" && data.displayResolutions) ||
      "1080,720,480";
    const signCookie = typeof stream?.signCookie === "string" ? stream.signCookie : "";
    const streamUrl = typeof stream?.url === "string" ? stream.url : "";
    const directValidUrl =
      !isDeprecationNoticeUrl(streamUrl) && streamUrl.startsWith("http")
        ? streamUrl
        : undefined;
    const manifestUrl = directValidUrl || resolveDashManifestFromPolicy(signCookie);
    if (!manifestUrl) continue;

    const format = detectFormat(manifestUrl, formatType);
    const hasSignedCookie = Boolean(signCookie.trim());
    const language =
      (typeof stream?.language === "string" && stream.language) ||
      (typeof stream?.lanName === "string" && stream.lanName) ||
      undefined;

    const resNumbers: number[] = Array.from(
      new Set<number>(
        String(resolutionsStr)
          .split(",")
          .map((r: string) => Number.parseInt(r.trim(), 10))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      )
    ).sort((a, b) => b - a);
    const resList = resNumbers.length > 0 ? resNumbers : [1080];
    const highestRes = resList[0] || 1080;

    for (const res of resList) {
      const scaledSize =
        sizeBytes !== undefined
          ? res >= highestRes
            ? sizeBytes
            : Math.floor(sizeBytes * Math.min(1, Math.max(0.15, Math.pow(res / highestRes, 1.6))))
          : undefined;
      variants.push({
        id: `${streamId || "playinfo"}_${res}`,
        resourceId: streamId,
        label: `${res}p ${codec || formatType}`,
        quality: `${res}p`,
        resolution: res,
        format,
        codec,
        language,
        sizeBytes: scaledSize,
        url: manifestUrl,
        requiresCustomHeaders: hasSignedCookie,
        hasSignedCookie,
        browserCompatible: !hasSignedCookie && (format === "mp4" || format === "hls" || format === "dash"),
        notes: hasSignedCookie
          ? "Upstream CDN stream requires provider session cookies; proxied server-side."
          : undefined,
        upstreamCookie: signCookie || undefined,
      });
    }
  }
  return variants;
}

function readResolution(val: unknown): number | undefined {
  const num = readNumber(val);
  if (num !== undefined && num > 0) return Math.floor(num);
  if (typeof val === "string") {
    const match = val.trim().match(/^(\d{3,4})\s*p?$/i);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return undefined;
}

export function mapResourceItemToStream(item: any): {
  variant: MovieBoxStreamVariant | null;
  season?: number;
  episode?: number;
  resourceId?: string;
  resolution?: number;
  codec?: string;
  language?: string;
  deprecationUrl?: string;
} {
  const resourceId = readId(item?.resourceId ?? item?.id);
  const season = readNumber(item?.se);
  const episode = readNumber(item?.ep);
  const resolution = readResolution(item?.resolution);
  const codec =
    (typeof item?.codecName === "string" && item.codecName) ||
    (typeof item?.codec === "string" && item.codec) ||
    undefined;
  const language =
    (typeof item?.language === "string" && item.language) ||
    (typeof item?.lanName === "string" && item.lanName) ||
    undefined;

  const rawUrl =
    (typeof item?.resourceLink === "string" && item.resourceLink) ||
    (typeof item?.url === "string" && item.url) ||
    "";

  if (rawUrl && isDeprecationNoticeUrl(rawUrl)) {
    return {
      variant: null,
      season,
      episode,
      resourceId,
      resolution,
      codec,
      language,
      deprecationUrl: rawUrl,
    };
  }
  if (!rawUrl || !rawUrl.startsWith("http")) {
    return { variant: null, season, episode, resourceId, resolution, codec, language };
  }

  const resNum = resolution ?? 720;
  const sizeBytes = readNumber(item?.size);
  const format = detectFormat(rawUrl);
  const upstreamCookie =
    (typeof item?.signCookie === "string" && item.signCookie.trim()) ||
    (typeof item?.cookie === "string" && item.cookie.trim()) ||
    undefined;

  return {
    season,
    episode,
    resourceId,
    resolution,
    codec,
    language,
    variant: {
      id: `${resourceId || "res"}_${resNum}`,
      resourceId,
      label: `${resNum}p ${codec || format.toUpperCase()}`,
      quality: `${resNum}p`,
      resolution: resNum,
      format,
      codec,
      language,
      sizeBytes,
      url: rawUrl,
      requiresCustomHeaders: Boolean(upstreamCookie),
      hasSignedCookie: Boolean(upstreamCookie),
      browserCompatible: format === "mp4" || format === "hls" || format === "dash",
      upstreamCookie,
    },
  };
}

export function mapDetectorItemsToStreams(
  detailsPayload: any,
  season: number,
  episode: number
): MovieBoxStreamVariant[] {
  const data = detailsPayload?.data ?? detailsPayload ?? {};
  const detectors = Array.isArray(data.resourceDetectors)
    ? data.resourceDetectors
    : Array.isArray(data.subject?.resourceDetectors)
    ? data.subject.resourceDetectors
    : [];
  const results: MovieBoxStreamVariant[] = [];

  for (const detector of detectors) {
    const resList = Array.isArray(detector?.resolutionList) ? detector.resolutionList : [];
    if (resList.length > 0) {
      for (const item of resList) {
        const mapped = mapResourceItemToStream(item);
        if (
          mapped.variant &&
          (mapped.season ?? 0) === season &&
          (mapped.episode ?? 0) === episode
        ) {
          results.push(mapped.variant);
        }
      }
      continue;
    }
    if (typeof detector?.downloadUrl === "string" && detector.downloadUrl.startsWith("http")) {
      const sourceLink = typeof detector?.resourceLink === "string" ? detector.resourceLink : "";
      const resMatch = sourceLink.toUpperCase().match(/(\d{3,4})P/);
      const synthItem = {
        resourceLink: detector.downloadUrl,
        size: detector.firstSize,
        codecName: detector.codecName,
        resourceId: detector.resourceId,
        resolution: resMatch ? Number.parseInt(resMatch[1], 10) : 720,
        se: 0,
        ep: 0,
      };
      const mapped = mapResourceItemToStream(synthItem);
      if (mapped.variant && season === 0 && episode === 0) {
        results.push(mapped.variant);
      }
    }
  }
  return results;
}
