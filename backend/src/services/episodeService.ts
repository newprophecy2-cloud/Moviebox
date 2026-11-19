import { MovieBoxError } from "../providers/moviebox/errors";
import {
  NormalizedEpisodeItem,
  NormalizedEpisodesResponse,
} from "../providers/moviebox/types";
import { detailsService } from "./detailsService";

export class EpisodeService {
  public async getEpisodes(
    seriesId: string,
    seasonFilter?: number
  ): Promise<NormalizedEpisodesResponse> {
    const details = await detailsService.getRawDetails(seriesId);

    if (details.mediaType === "unresolved") {
      throw new MovieBoxError(
        "MEDIA_TYPE_UNRESOLVED",
        `Provider metadata could not establish the media type for '${seriesId}'.`,
        422,
        false
      );
    }

    if (details.mediaType !== "series") {
      throw new MovieBoxError(
        "NOT_A_SERIES",
        "Episode listing is available for series only.",
        400,
        false
      );
    }

    if (seasonFilter !== undefined) {
      const targetSeason = details.seasons.find((s) => s.number === seasonFilter);
      if (!targetSeason) {
        throw new MovieBoxError(
          "MEDIA_NOT_FOUND",
          `Season ${seasonFilter} was not found for series '${seriesId}'.`,
          404,
          false
        );
      }

      const sorted = [...targetSeason.episodes].sort((a, b) => a.number - b.number);
      const episodes: NormalizedEpisodeItem[] = sorted.map((ep) => ({
        id: ep.id,
        provider_episode_id: ep.providerEpisodeId ?? null,
        series_id: details.id,
        season_number: ep.season,
        episode_number: ep.number,
        title: ep.title,
        overview: ep.overview ?? null,
        thumbnail: ep.thumbnailUrl ?? null,
        duration: ep.duration ?? null,
      }));

      return {
        series_id: details.id,
        season: seasonFilter,
        total_episodes: episodes.length,
        episodes,
      };
    }

    const allEpisodes = details.seasons
      .flatMap((s) => s.episodes)
      .sort((a, b) => a.season - b.season || a.number - b.number);

    const episodes: NormalizedEpisodeItem[] = allEpisodes.map((ep) => ({
      id: ep.id,
      provider_episode_id: ep.providerEpisodeId ?? null,
      series_id: details.id,
      season_number: ep.season,
      episode_number: ep.number,
      title: ep.title,
      overview: ep.overview ?? null,
      thumbnail: ep.thumbnailUrl ?? null,
      duration: ep.duration ?? null,
    }));

    return {
      series_id: details.id,
      season: null,
      total_episodes: episodes.length,
      episodes,
    };
  }
}

export const episodeService = new EpisodeService();
