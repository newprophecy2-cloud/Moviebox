import { env } from "../config/env";
import { movieBoxClient } from "../providers/moviebox/client";
import { MovieBoxError, PLACEHOLDER_ONLY_MESSAGE } from "../providers/moviebox/errors";
import {
  mapCaptionsToOptions,
  mapDetailsToMediaDetails,
  mapDetectorItemsToStreams,
  mapPlayInfoToStreams,
  mapResourceItemToStream,
  placeholderStreamCount,
  sanitizeLanguageLabel,
} from "../providers/moviebox/mapper";
import { getMockPlaybackResult } from "../providers/moviebox/mockData";
import {
  MovieBoxAudioTrackOption,
  MovieBoxMediaDetails,
  MovieBoxPlaybackResult,
  MovieBoxStreamVariant,
  MovieBoxSubtitleOption,
  NormalizedAudioTrack,
  NormalizedStreamVariant,
  NormalizedSubtitleTrack,
  NormalizedUnifiedStreamResponse,
  StreamDeliveryMode,
} from "../providers/moviebox/types";
import {
  ParsedStreamIdentifier,
  parseUnifiedStreamId,
  validateDeliveryMode,
} from "../utils/validation";
import { cacheService } from "./cacheService";
import { DetailsService, detailsService } from "./detailsService";
import { redactSensitiveText } from "./loggingService";
import { MovieBoxService } from "./moviebox.service";
import { ProviderConfigStore, providerConfigStore } from "./providerConfigStore";
import { StreamProxyService, streamProxyService } from "./streamProxyService";

const PLAYBACK_CACHE_TTL_MS = 120_000;

export interface StreamResolverTelemetry {
  last_resolver_status: "idle" | "resolved" | "error";
  last_resolved_at: string | null;
  last_media_id: string | null;
  last_delivery_mode: StreamDeliveryMode | null;
  direct_url_availability: "unverified" | "available" | "unavailable";
  direct_url_reason: string;
  last_error_code: string | null;
  last_error_message: string | null;
  total_resolutions: number;
  proxy_resolutions: number;
  direct_resolutions: number;
  direct_unavailable_count: number;
}

interface ResolvedMediaTarget {
  mediaType: "movie" | "episode";
  mediaId: string;
  subjectId: string;
  season: number;
  episode: number;
  details: MovieBoxMediaDetails;
  episodeMeta?: {
    seriesId: string;
    seasonNumber: number;
    episodeNumber: number;
  };
}

export interface PlaybackServiceDeps {
  client?: MovieBoxService;
  details?: DetailsService;
  proxy?: StreamProxyService;
  configStore?: ProviderConfigStore;
}

export class PlaybackService {
  private readonly client: MovieBoxService;
  private readonly detailsSvc: DetailsService;
  private readonly proxySvc: StreamProxyService;
  private readonly configStore: ProviderConfigStore;

  private telemetry: StreamResolverTelemetry = {
    last_resolver_status: "idle",
    last_resolved_at: null,
    last_media_id: null,
    last_delivery_mode: null,
    direct_url_availability: "unverified",
    direct_url_reason: "No live stream resolution has run yet.",
    last_error_code: null,
    last_error_message: null,
    total_resolutions: 0,
    proxy_resolutions: 0,
    direct_resolutions: 0,
    direct_unavailable_count: 0,
  };

  constructor(deps: PlaybackServiceDeps = {}) {
    this.client = deps.client ?? movieBoxClient;
    this.detailsSvc = deps.details ?? detailsService;
    this.proxySvc = deps.proxy ?? streamProxyService;
    this.configStore = deps.configStore ?? providerConfigStore;
  }

  public getResolverTelemetry(): StreamResolverTelemetry {
    return { ...this.telemetry };
  }

  /**
   * 7-Stage Unified Stream Resolver:
   * 1. Resolve requested media ID
   * 2. Determine movie or episode from provider-backed metadata
   * 3. Fetch provider stream metadata
   * 4. Normalize stream variants (preserving resource IDs & track labels)
   * 5. Select delivery mode
   * 6. Generate signed proxy URL or return authorized provider direct URL
   * 7. Return consistent response JSON
   */
  public async resolveUnifiedStream(
    rawId: string,
    forceRefresh: boolean = false,
    rawDelivery?: unknown
  ): Promise<NormalizedUnifiedStreamResponse> {
    this.client.assertEnabled();
    this.telemetry.total_resolutions += 1;

    let selectedDelivery: StreamDeliveryMode | null = null;
    try {
      // Stage 1: Resolve the requested media ID
      const parsed = this.resolveMediaIdentifier(rawId);

      // Early query parameter validation: validate delivery mode before upstream metadata requests
      selectedDelivery = this.selectDeliveryMode(rawDelivery);

      // Stage 2: Determine movie or episode using provider-backed metadata
      const target = await this.resolveMediaTypeAndMetadata(parsed);

      // Stage 3: Fetch provider stream metadata
      const rawPlayback = await this.fetchProviderStreamMetadata(
        target.subjectId,
        target.season,
        target.episode,
        forceRefresh,
        target.details
      );

      // Stage 4: Normalize stream variants without collapsing distinct resources of equal quality
      const normalized = this.normalizeStreamVariants(rawPlayback);

      // Update observed provider direct delivery capability from actual resolver results
      this.recordObservedDirectCapability(normalized.streams);

      // Stage 6: Apply selected delivery mode (never silently substitute proxy for direct)
      const delivered = this.applyDeliveryMode(normalized, selectedDelivery);

      // Stage 7: Return consistent response JSON
      const response = this.buildUnifiedStreamResponse(
        target.mediaType,
        target.mediaId,
        selectedDelivery,
        delivered,
        target.episodeMeta
      );

      this.telemetry.last_resolver_status = "resolved";
      this.telemetry.last_resolved_at = new Date().toISOString();
      this.telemetry.last_media_id = target.mediaId;
      this.telemetry.last_delivery_mode = selectedDelivery;
      if (selectedDelivery === "direct") {
        this.telemetry.direct_resolutions += 1;
      } else {
        this.telemetry.proxy_resolutions += 1;
      }

      return response;
    } catch (err) {
      const code = err instanceof MovieBoxError ? err.code : "INTERNAL_ERROR";
      const message =
        redactSensitiveText(err instanceof Error ? err.message : "Stream resolution failed.") ||
        "Stream resolution failed.";
      this.telemetry.last_resolver_status = "error";
      this.telemetry.last_resolved_at = new Date().toISOString();
      this.telemetry.last_media_id = rawId ? String(rawId).trim().slice(0, 96) : null;
      this.telemetry.last_delivery_mode = selectedDelivery;
      this.telemetry.last_error_code = code;
      this.telemetry.last_error_message = message;
      if (code === "DIRECT_URL_UNAVAILABLE") {
        this.telemetry.direct_unavailable_count += 1;
      }
      throw err;
    }
  }

  // Stage 1: Resolve requested media ID
  private resolveMediaIdentifier(rawId: string): ParsedStreamIdentifier {
    return parseUnifiedStreamId(rawId);
  }

  // Stage 2: Determine movie or episode from provider-backed metadata
  private async resolveMediaTypeAndMetadata(
    parsed: ParsedStreamIdentifier
  ): Promise<ResolvedMediaTarget> {
    if (parsed.kind === "subject") {
      const details = await this.detailsSvc.getRawDetails(parsed.subjectId);
      if (details.mediaType === "unresolved") {
        throw new MovieBoxError(
          "MEDIA_TYPE_UNRESOLVED",
          `Provider metadata could not establish the media type for '${parsed.subjectId}'.`,
          422,
          false
        );
      }
      if (details.mediaType === "series") {
        throw new MovieBoxError(
          "EPISODE_REQUIRED",
          `Series '${parsed.subjectId}' requires an episode descriptor in the format ${parsed.subjectId}_s{season}_e{episode}.`,
          400,
          false
        );
      }

      return {
        mediaType: "movie",
        mediaId: parsed.subjectId,
        subjectId: parsed.subjectId,
        season: 0,
        episode: 0,
        details,
      };
    }

    const details = await this.detailsSvc.getRawDetails(parsed.seriesId);
    if (details.mediaType === "unresolved") {
      throw new MovieBoxError(
        "MEDIA_TYPE_UNRESOLVED",
        `Provider metadata could not establish the media type for '${parsed.seriesId}'.`,
        422,
        false
      );
    }
    if (details.mediaType !== "series") {
      throw new MovieBoxError(
        "INVALID_INPUT",
        `Media '${parsed.seriesId}' is a movie and cannot be streamed using an episode descriptor.`,
        400,
        false
      );
    }

    const seasonObj = details.seasons.find((s) => s.number === parsed.season);
    const episodeExists = seasonObj?.episodes.some((ep) => ep.number === parsed.episode);
    if (!seasonObj || !episodeExists) {
      throw new MovieBoxError(
        "MEDIA_NOT_FOUND",
        `Episode S${parsed.season}E${parsed.episode} was not found for series '${parsed.seriesId}'.`,
        404,
        false
      );
    }

    return {
      mediaType: "episode",
      mediaId: parsed.rawId,
      subjectId: parsed.seriesId,
      season: parsed.season,
      episode: parsed.episode,
      details,
      episodeMeta: {
        seriesId: parsed.seriesId,
        seasonNumber: parsed.season,
        episodeNumber: parsed.episode,
      },
    };
  }

  // Stage 3: Fetch raw provider stream metadata (cached pre-delivery so ?delivery=proxy|direct can switch cleanly)
  private async fetchProviderStreamMetadata(
    subjectId: string,
    season: number,
    episode: number,
    forceRefresh: boolean,
    knownDetails?: MovieBoxMediaDetails
  ): Promise<MovieBoxPlaybackResult> {
    this.client.assertEnabled();
    const isMock = this.client.isMockMode();
    const configuredTtl = this.configStore.getConfig().cache_ttl_ms;
    const ttlMs = Math.min(configuredTtl, PLAYBACK_CACHE_TTL_MS);
    const cacheKey = `playback:raw:${isMock ? "mock" : "live"}:${subjectId}:${season}:${episode}`;

    if (!forceRefresh && ttlMs > 0) {
      return cacheService.getOrFetch(cacheKey, ttlMs, () =>
        this.resolveRawPlayback(subjectId, season, episode, knownDetails)
      );
    }

    const fresh = await this.resolveRawPlayback(subjectId, season, episode, knownDetails);
    if (ttlMs > 0) {
      cacheService.set(cacheKey, fresh, ttlMs);
    }
    return fresh;
  }

  private async resolveRawPlayback(
    subjectId: string,
    season: number,
    episode: number,
    knownDetails?: MovieBoxMediaDetails
  ): Promise<MovieBoxPlaybackResult> {
    if (this.client.isMockMode()) {
      return getMockPlaybackResult(subjectId, season, episode, knownDetails?.mediaType);
    }

    const [detailsRes, playInfoRes, resourcesRes] = await Promise.allSettled([
      this.client.getSubjectDetails(subjectId),
      this.client.getPlayInfo(subjectId, season, episode),
      this.client.getEpisodeResourcesV2(subjectId, season, episode),
    ]);

    const streams: MovieBoxStreamVariant[] = [];
    const seenKeys = new Set<string>();
    let placeholders = 0;
    let audioTracks: MovieBoxAudioTrackOption[] = knownDetails?.dubs ? [...knownDetails.dubs] : [];
    let primaryResourceId: string | undefined;

    // Never deduplicate solely by quality; preserve distinct stream resources and codecs/languages
    const addVariant = (v: MovieBoxStreamVariant) => {
      const resourceKey = v.resourceId || v.id || "nores";
      const dedupeKey = `${resourceKey}::${v.url}::${v.format}::${v.resolution}::${v.codec || ""}::${v.language || ""}`;
      if (seenKeys.has(dedupeKey)) return;
      seenKeys.add(dedupeKey);
      if (!primaryResourceId && v.resourceId) {
        primaryResourceId = v.resourceId;
      }
      streams.push(v);
    };

    if (detailsRes.status === "fulfilled") {
      const parsedDetails = mapDetailsToMediaDetails(detailsRes.value);
      if (parsedDetails?.dubs && parsedDetails.dubs.length > 0) {
        audioTracks = parsedDetails.dubs;
      }
      for (const variant of mapDetectorItemsToStreams(detailsRes.value, season, episode)) {
        addVariant(variant);
      }
    }

    let playInfoError: unknown = null;
    if (playInfoRes.status === "fulfilled") {
      placeholders += placeholderStreamCount(playInfoRes.value);
      for (const variant of mapPlayInfoToStreams(playInfoRes.value)) {
        addVariant(variant);
      }
    } else {
      playInfoError = playInfoRes.reason;
    }

    let resourceItems: any[] = [];
    if (resourcesRes.status === "fulfilled") {
      resourceItems = Array.isArray(resourcesRes.value?.list) ? resourcesRes.value.list : [];
    } else if (streams.length === 0) {
      const page = episode > 0 ? Math.floor((episode - 1) / 20) + 1 : 1;
      try {
        const pageRes = await this.client.getResourcesPage(subjectId, season, episode, 0, page);
        resourceItems = Array.isArray(pageRes?.list) ? pageRes.list : [];
      } catch {
        resourceItems = [];
      }
    }

    for (const item of resourceItems) {
      const mapped = mapResourceItemToStream(item);
      if (
        (season !== 0 || episode !== 0) &&
        (mapped.season !== season || mapped.episode !== episode)
      ) {
        continue;
      }

      if (!primaryResourceId && mapped.resourceId) {
        primaryResourceId = mapped.resourceId;
      }

      if (mapped.variant) {
        addVariant(mapped.variant);
        continue;
      }

      if (mapped.deprecationUrl && mapped.resourceId) {
        placeholders += 1;
        try {
          const recoveredPayload = await this.client.getResourcePosition(
            subjectId,
            mapped.resourceId,
            mapped.deprecationUrl
          );
          const list = Array.isArray(recoveredPayload?.list) ? recoveredPayload.list : [];
          for (const candidate of list) {
            const candidateMapped = mapResourceItemToStream(candidate);
            if (
              candidateMapped.variant &&
              candidateMapped.resourceId === mapped.resourceId &&
              candidateMapped.season === mapped.season &&
              candidateMapped.episode === mapped.episode
            ) {
              const mergedRes =
                candidateMapped.resolution ?? mapped.resolution ?? candidateMapped.variant.resolution;
              const mergedCodec = candidateMapped.codec ?? mapped.codec;
              const mergedLanguage = candidateMapped.language ?? mapped.language;
              addVariant({
                ...candidateMapped.variant,
                id: `${mapped.resourceId}_${mergedRes}`,
                resourceId: mapped.resourceId,
                resolution: mergedRes,
                quality: `${mergedRes}p`,
                codec: mergedCodec,
                language: mergedLanguage,
                label: `${mergedRes}p ${mergedCodec || candidateMapped.variant.format.toUpperCase()}`,
              });
              break;
            }
          }
        } catch {
          // continue checking remaining items
        }
      }
    }

    if (streams.length === 0) {
      if (placeholders > 0) {
        throw new MovieBoxError("PLACEHOLDER_ONLY", PLACEHOLDER_ONLY_MESSAGE, 503, false);
      }
      if (playInfoError instanceof MovieBoxError) {
        throw playInfoError;
      }
      if (detailsRes.status === "rejected" && detailsRes.reason instanceof MovieBoxError) {
        throw detailsRes.reason;
      }
      throw new MovieBoxError(
        "STREAM_NOT_FOUND",
        "No playable stream sources returned by MovieBox for this media.",
        404,
        true
      );
    }

    let subtitles: MovieBoxSubtitleOption[] = [];
    if (primaryResourceId) {
      const siblingIds = audioTracks
        .map((d) => d.subjectId)
        .filter((sid) => sid && sid !== subjectId);
      subtitles = await this.getRawCaptions(
        subjectId,
        primaryResourceId,
        siblingIds,
        season,
        episode
      ).catch(() => []);
    }

    return {
      subjectId,
      season,
      episode,
      resourceId: primaryResourceId,
      streams,
      subtitles,
      audioTracks,
      placeholderCount: placeholders,
      fetchedAt: Date.now(),
    };
  }

  // Stage 4: Normalize stream variants
  private normalizeStreamVariants(playback: MovieBoxPlaybackResult): MovieBoxPlaybackResult {
    const sortedStreams = [...playback.streams].sort(
      (a, b) =>
        b.resolution - a.resolution ||
        (b.sizeBytes || 0) - (a.sizeBytes || 0) ||
        (a.resourceId || a.id).localeCompare(b.resourceId || b.id)
    );

    return {
      ...playback,
      streams: sortedStreams,
    };
  }

  // Stage 5: Select and validate delivery mode
  private selectDeliveryMode(rawDelivery: unknown): StreamDeliveryMode {
    const config = this.configStore.getConfig();
    const mode = validateDeliveryMode(rawDelivery, config.default_stream_delivery);

    if (mode === "proxy" && !config.proxy_delivery_enabled) {
      throw new MovieBoxError(
        "STREAM_PROXY_ERROR",
        "Proxy stream delivery is currently disabled by administrator.",
        503,
        false
      );
    }
    if (mode === "direct" && !config.direct_delivery_enabled) {
      throw new MovieBoxError(
        "DIRECT_URL_UNAVAILABLE",
        "Authorized direct stream delivery is currently disabled by administrator.",
        404,
        false
      );
    }

    return mode;
  }

  private isAuthorizedDirectVariant(variant: MovieBoxStreamVariant): boolean {
    if (variant.requiresCustomHeaders || variant.hasSignedCookie || variant.upstreamCookie) {
      return false;
    }
    if (env.streamReferer) {
      return false;
    }
    try {
      const parsed = new URL(variant.url);
      return parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  private isAuthorizedDirectSubtitle(subtitle: MovieBoxSubtitleOption): boolean {
    if (subtitle.upstreamCookie || env.streamReferer) {
      return false;
    }
    try {
      const parsed = new URL(subtitle.url);
      return parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  private recordObservedDirectCapability(variants: MovieBoxStreamVariant[]): void {
    if (this.client.isMockMode()) {
      this.telemetry.direct_url_availability = "unverified";
      this.telemetry.direct_url_reason =
        "Provider is running in non-production mock mode; real provider direct capability is unverified.";
      return;
    }

    const hasDirect = variants.some((variant) => this.isAuthorizedDirectVariant(variant));
    if (hasDirect) {
      this.telemetry.direct_url_availability = "available";
      this.telemetry.direct_url_reason =
        "Provider returned at least one HTTPS stream variant without signed cookies or custom headers.";
      return;
    }

    const hasCookieProtected = variants.some(
      (variant) => variant.hasSignedCookie || variant.requiresCustomHeaders || Boolean(variant.upstreamCookie)
    );
    this.telemetry.direct_url_availability = "unavailable";
    this.telemetry.direct_url_reason = hasCookieProtected
      ? "Provider stream variants require signed cookies or server-side Referer headers; direct client delivery is unavailable."
      : "No authorized HTTPS direct stream variant was exposed by the provider.";
  }

  // Stage 6: Generate signed proxy URL or return authorized provider direct URL
  private applyDeliveryMode(
    playback: MovieBoxPlaybackResult,
    deliveryMode: StreamDeliveryMode
  ): MovieBoxPlaybackResult {
    if (deliveryMode === "direct") {
      const directStreams = playback.streams
        .filter((stream) => this.isAuthorizedDirectVariant(stream))
        .map((stream) => ({
          ...stream,
          requiresCustomHeaders: false,
        }));

      if (directStreams.length === 0) {
        throw new MovieBoxError(
          "DIRECT_URL_UNAVAILABLE",
          "Authorized direct playback URL is unavailable for this media because the provider requires signed cookies or server-side headers.",
          404,
          false
        );
      }

      const directSubtitles = playback.subtitles.filter((sub) =>
        this.isAuthorizedDirectSubtitle(sub)
      );

      return {
        ...playback,
        streams: directStreams,
        subtitles: directSubtitles,
      };
    }

    const blockedHosts = new Set<string>();
    const proxiedStreams = playback.streams
      .map((stream): MovieBoxStreamVariant | null => {
        if (this.client.isMockMode() && stream.url.startsWith("/api/v1/mock-media/")) {
          return {
            ...stream,
            browserCompatible: true,
            requiresCustomHeaders: false,
          };
        }
        const proxyMeta = this.proxySvc.createProxyUrlWithMeta(
          stream.url,
          "media",
          stream.upstreamCookie
        );
        if (!proxyMeta) {
          try {
            blockedHosts.add(new URL(stream.url).hostname);
          } catch {
            blockedHosts.add("invalid-url");
          }
          return null;
        }
        return {
          ...stream,
          url: proxyMeta.url,
          expiresAt: proxyMeta.expiresAt,
          browserCompatible: true,
          requiresCustomHeaders: false,
        };
      })
      .filter((stream): stream is MovieBoxStreamVariant => Boolean(stream));

    if (proxiedStreams.length === 0) {
      const hostsLabel = Array.from(blockedHosts).join(", ") || "unknown";
      throw new MovieBoxError(
        "STREAM_PROXY_ERROR",
        `Resolved MovieBox stream host(s) [${hostsLabel}] are not permitted by proxy allowlist or proxy signing is unavailable.`,
        502,
        false
      );
    }

    const proxiedSubtitles = playback.subtitles
      .map((subtitle) => {
        if (
          subtitle.url.includes("/api/v1/stream-proxy?token=") ||
          (this.client.isMockMode() && subtitle.url.startsWith("/api/v1/mock-media/"))
        ) {
          return subtitle;
        }
        const url = this.proxySvc.createProxyUrl(
          subtitle.url,
          "subtitle",
          subtitle.upstreamCookie
        );
        return url ? { ...subtitle, url } : null;
      })
      .filter((subtitle): subtitle is MovieBoxSubtitleOption => Boolean(subtitle));

    return {
      ...playback,
      streams: proxiedStreams,
      subtitles: proxiedSubtitles,
    };
  }

  // Stage 7: Return consistent response JSON
  private buildUnifiedStreamResponse(
    mediaType: "movie" | "episode",
    mediaId: string,
    deliveryMode: StreamDeliveryMode,
    playback: MovieBoxPlaybackResult,
    episodeMeta?: {
      seriesId: string;
      seasonNumber: number;
      episodeNumber: number;
    }
  ): NormalizedUnifiedStreamResponse {
    const normalizedStreams: NormalizedStreamVariant[] = playback.streams.map((s) => ({
      id: s.id,
      resource_id: s.resourceId ?? null,
      provider_resource_id: s.resourceId ?? null,
      delivery_mode: deliveryMode,
      quality: s.quality,
      resolution: s.resolution,
      format: s.format,
      codec: s.codec ?? null,
      language: s.language ?? null,
      size_bytes: s.sizeBytes ?? null,
      stream_url: s.url,
      browser_compatible: s.browserCompatible,
      expires_at: s.expiresAt ?? null,
    }));

    const primary = normalizedStreams[0];
    if (!primary) {
      throw new MovieBoxError(
        "STREAM_NOT_FOUND",
        "No verified playable stream variant is available.",
        404,
        true
      );
    }

    // Preserve provider audio-track labels and explicit language metadata without fabricating codes
    const audioTracks: NormalizedAudioTrack[] = playback.audioTracks.map((a) => ({
      subject_id: a.subjectId,
      language: a.language,
      label: a.label,
      language_code: a.languageCode ?? null,
    }));

    const subtitles: NormalizedSubtitleTrack[] = playback.subtitles.map((sub) => ({
      id: sub.id,
      name: sub.name,
      language_code: sub.languageCode ?? null,
      format: sub.format,
      url: sub.url,
    }));

    return {
      media_type: mediaType,
      media_id: mediaId,
      delivery_mode: deliveryMode,
      ...(episodeMeta
        ? {
            series_id: episodeMeta.seriesId,
            season_number: episodeMeta.seasonNumber,
            episode_number: episodeMeta.episodeNumber,
          }
        : {}),
      stream: {
        ...primary,
        audio_tracks: audioTracks,
        subtitles,
      },
      streams: normalizedStreams,
    };
  }

  public async getPlayback(
    subjectId: string,
    season: number = 0,
    episode: number = 0,
    forceRefresh: boolean = false,
    rawDelivery?: unknown
  ): Promise<MovieBoxPlaybackResult> {
    const selectedDelivery = this.selectDeliveryMode(rawDelivery);
    const rawPlayback = await this.fetchProviderStreamMetadata(
      subjectId,
      season,
      episode,
      forceRefresh
    );
    const normalized = this.normalizeStreamVariants(rawPlayback);
    this.recordObservedDirectCapability(normalized.streams);
    return this.applyDeliveryMode(normalized, selectedDelivery);
  }

  private async getRawCaptions(
    subjectId: string,
    resourceId: string,
    siblingIds: string[] = [],
    season: number = 0,
    episode: number = 0
  ): Promise<MovieBoxSubtitleOption[]> {
    if (this.client.isMockMode()) {
      return getMockPlaybackResult(subjectId, season, episode).subtitles;
    }
    if (!subjectId || !resourceId) {
      return [];
    }

    const cacheKey = `captions:raw:${subjectId}:${resourceId}`;
    const ttlMs = this.configStore.getConfig().cache_ttl_ms;
    const cached = cacheService.get<MovieBoxSubtitleOption[]>(cacheKey);
    if (cached && (cached.length > 0 || siblingIds.length === 0)) {
      return cached;
    }

    const allCaptions: MovieBoxSubtitleOption[] = [];
    const seenUrls = new Set<string>();

    const appendUnique = (items: MovieBoxSubtitleOption[]) => {
      for (const item of items) {
        if (!seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          allCaptions.push(item);
        }
      }
    };

    const primaryPromise = this.client
      .getExtCaptions(subjectId, resourceId)
      .then((res) => mapCaptionsToOptions(res))
      .catch((err) => {
        if (err instanceof MovieBoxError && err.code === "PROVIDER_AUTH_REQUIRED") {
          throw err;
        }
        return [] as MovieBoxSubtitleOption[];
      });

    const siblingPromises = siblingIds
      .filter((sid) => sid && sid !== subjectId)
      .slice(0, 3)
      .map(async (sibId) => {
        try {
          const page = episode > 0 ? Math.floor((episode - 1) / 20) + 1 : 1;
          const resPage = await this.client.getResourcesPage(sibId, season, episode, 0, page);
          const list = Array.isArray(resPage?.list) ? resPage.list : [];
          const match = list.find((item: any) => {
            const se = Number(item?.se ?? 0);
            const ep = Number(item?.ep ?? 0);
            return (season === 0 && episode === 0) || (se === season && ep === episode);
          });
          const sibResourceId = match?.resourceId ?? match?.id;
          if (!sibResourceId) return [];
          const capRes = await this.client.getExtCaptions(sibId, String(sibResourceId));
          return mapCaptionsToOptions(capRes);
        } catch {
          return [];
        }
      });

    const [primarySubs, ...siblingSubs] = await Promise.all([
      primaryPromise,
      ...siblingPromises,
    ]);

    appendUnique(primarySubs);
    for (const list of siblingSubs) {
      appendUnique(list);
    }

    const seenLangs = new Set<string>();
    const deduplicated: MovieBoxSubtitleOption[] = [];
    for (const sub of allCaptions) {
      const normLang = sanitizeLanguageLabel(sub.name).toLowerCase();
      if (!seenLangs.has(normLang)) {
        seenLangs.add(normLang);
        deduplicated.push(sub);
      }
    }

    deduplicated.sort((a, b) => {
      const cleanA = sanitizeLanguageLabel(a.name);
      const cleanB = sanitizeLanguageLabel(b.name);
      const aEng = cleanA.toLowerCase() === "english";
      const bEng = cleanB.toLowerCase() === "english";
      if (aEng && !bEng) return -1;
      if (!aEng && bEng) return 1;
      return cleanA.localeCompare(cleanB);
    });

    if (deduplicated.length > 0 && ttlMs > 0) {
      cacheService.set(cacheKey, deduplicated, ttlMs);
    }

    return deduplicated;
  }

  public async getCaptions(
    subjectId: string,
    resourceId: string,
    siblingIds: string[] = [],
    season: number = 0,
    episode: number = 0
  ): Promise<MovieBoxSubtitleOption[]> {
    const rawCaptions = await this.getRawCaptions(
      subjectId,
      resourceId,
      siblingIds,
      season,
      episode
    );
    return rawCaptions
      .map((subtitle) => {
        if (this.client.isMockMode() && subtitle.url.startsWith("/api/v1/mock-media/")) {
          return subtitle;
        }
        const url = this.proxySvc.createProxyUrl(
          subtitle.url,
          "subtitle",
          subtitle.upstreamCookie
        );
        return url ? { ...subtitle, url } : null;
      })
      .filter((subtitle): subtitle is MovieBoxSubtitleOption => Boolean(subtitle));
  }
}

export const playbackService = new PlaybackService();
