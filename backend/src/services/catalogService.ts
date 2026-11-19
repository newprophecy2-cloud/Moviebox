import { movieBoxClient } from "../providers/moviebox/client";
import { mapSearchToCatalog } from "../providers/moviebox/mapper";
import { NormalizedSearchItem, NormalizedSearchResponse } from "../providers/moviebox/types";
import { cacheService } from "./cacheService";
import { providerConfigStore } from "./providerConfigStore";

export class CatalogService {
  public async search(
    query: string,
    page: number = 1,
    type: "all" | "movie" | "series" = "all"
  ): Promise<NormalizedSearchResponse> {
    movieBoxClient.assertEnabled();

    const normalizedQuery = query.trim();
    const subjectType = type === "movie" ? 1 : type === "series" ? 2 : 0;
    const isMock = movieBoxClient.isMockMode();
    const ttlMs = providerConfigStore.getConfig().cache_ttl_ms;
    const cacheKey = `search:${isMock ? "mock" : "live"}:${normalizedQuery.toLowerCase()}:${page}:${type}`;

    const mapped = await cacheService.getOrFetch(cacheKey, ttlMs, async () => {
      const payload = await movieBoxClient.search(normalizedQuery, page, subjectType);
      return mapSearchToCatalog(payload);
    });

    const filteredItems =
      type === "all"
        ? mapped.items
        : mapped.items.filter((item) => item.mediaType === type);

    const results: NormalizedSearchItem[] = filteredItems.map((item) => ({
      id: item.id,
      provider: "moviebox",
      title: item.title,
      media_type: item.mediaType,
      year: item.year ?? null,
      poster: item.posterUrl ?? null,
      season_count: item.mediaType === "series" ? (item.seasonCount ?? null) : null,
      rating: item.rating ?? null,
      genres: item.genres ?? [],
    }));

    return {
      query: normalizedQuery,
      page,
      has_more: mapped.hasMore,
      total_results:
        typeof mapped.totalCount === "number" ? mapped.totalCount : results.length,
      results,
    };
  }
}

export const catalogService = new CatalogService();
