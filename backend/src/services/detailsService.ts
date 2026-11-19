import { movieBoxClient } from "../providers/moviebox/client";
import { MovieBoxError } from "../providers/moviebox/errors";
import { mapDetailsToMediaDetails } from "../providers/moviebox/mapper";
import {
  MovieBoxMediaDetails,
  NormalizedDetailsResponse,
} from "../providers/moviebox/types";
import { cacheService } from "./cacheService";
import { providerConfigStore } from "./providerConfigStore";

export class DetailsService {
  constructor(private readonly client = movieBoxClient) {}

  public async getRawDetails(subjectId: string): Promise<MovieBoxMediaDetails> {
    this.client.assertEnabled();
    const isMock = this.client.isMockMode();
    const ttlMs = providerConfigStore.getConfig().cache_ttl_ms;
    const cacheKey = `details:${isMock ? "mock" : "live"}:${subjectId}`;

    return cacheService.getOrFetch(cacheKey, ttlMs, async () => {
      const payload = await this.client.getDetails(subjectId);
      const details = mapDetailsToMediaDetails(payload);
      if (!details) {
        throw new MovieBoxError(
          "MEDIA_NOT_FOUND",
          `Requested media '${subjectId}' was not found or returned malformed metadata.`,
          404,
          false
        );
      }
      return details;
    });
  }

  public async getNormalizedDetails(subjectId: string): Promise<NormalizedDetailsResponse> {
    const details = await this.getRawDetails(subjectId);

    if (details.mediaType === "unresolved") {
      throw new MovieBoxError(
        "MEDIA_TYPE_UNRESOLVED",
        `Provider metadata could not establish the media type for '${subjectId}'.`,
        422,
        false
      );
    }

    const audioLanguages = Array.from(
      new Set(
        details.dubs
          .map((d) => d.language)
          .filter((lang) => Boolean(lang && lang !== "Unknown"))
      )
    );

    if (details.mediaType === "series") {
      return {
        id: details.id,
        provider: "moviebox",
        media_type: "series",
        title: details.title,
        original_title: details.originalTitle ?? null,
        description: details.description ?? null,
        year: details.year ?? null,
        poster: details.posterUrl ?? null,
        backdrop: details.backdropUrl ?? null,
        rating: details.imdbRating ?? null,
        genres: details.genres,
        seasons: details.seasons.map((s) => ({
          season_number: s.number,
          episode_count: s.episodes.length > 0 ? s.episodes.length : s.maxEpisode,
        })),
        audio_languages: audioLanguages,
      };
    }

    return {
      id: details.id,
      provider: "moviebox",
      media_type: "movie",
      title: details.title,
      original_title: details.originalTitle ?? null,
      description: details.description ?? null,
      year: details.year ?? null,
      poster: details.posterUrl ?? null,
      backdrop: details.backdropUrl ?? null,
      rating: details.imdbRating ?? null,
      duration: details.duration ?? null,
      genres: details.genres,
      audio_languages: audioLanguages,
    };
  }
}

export const detailsService = new DetailsService();
