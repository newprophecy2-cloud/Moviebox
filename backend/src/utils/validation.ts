import { z } from "zod";
import { MovieBoxError } from "../providers/moviebox/errors";
import { StreamDeliveryMode } from "../providers/moviebox/types";

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const COMPOSITE_EPISODE_REGEX = /^([a-zA-Z0-9_-]{1,64})_s(\d+)_e(\d+)$/i;

export const searchQuerySchema = z.object({
  q: z
    .string({ error: "Query parameter 'q' is required." })
    .trim()
    .min(1, "Search query must be between 1 and 120 characters.")
    .max(120, "Search query must be between 1 and 120 characters."),
  page: z.coerce.number().int().min(1).max(100).default(1),
  type: z.enum(["all", "movie", "series"]).default("all"),
});

export const episodesQuerySchema = z.object({
  season: z
    .preprocess(
      (val) => (val === undefined || val === null || val === "" ? undefined : val),
      z.coerce.number().int().min(1).max(500).optional()
    ),
});

export const providerConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  api_hosts: z
    .array(
      z
        .string()
        .trim()
        .url()
        .refine((u) => u.startsWith("https://"), "API hosts must use HTTPS.")
    )
    .min(1)
    .max(20)
    .optional(),
  media_hosts: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Invalid media CDN hostname.")
    )
    .min(1)
    .max(30)
    .optional(),
  request_timeout_ms: z.coerce.number().int().min(1000).max(60_000).optional(),
  cache_ttl_ms: z.coerce.number().int().min(0).max(3_600_000).optional(),
  stream_proxy_ttl_seconds: z.coerce.number().int().min(60).max(86_400).optional(),
  stream_proxy_timeout_ms: z.coerce.number().int().min(1000).max(120_000).optional(),
  mock_mode: z.boolean().optional(),
  default_stream_delivery: z.enum(["proxy", "direct"]).optional(),
  proxy_delivery_enabled: z.boolean().optional(),
  direct_delivery_enabled: z.boolean().optional(),
});

export function validateSubjectId(raw: unknown, fieldName: string = "id"): string {
  if (typeof raw !== "string") {
    throw new MovieBoxError("INVALID_INPUT", `Missing or invalid ${fieldName}.`, 400, false);
  }
  const trimmed = raw.trim();
  if (!SAFE_ID_REGEX.test(trimmed)) {
    throw new MovieBoxError(
      "INVALID_INPUT",
      `Invalid ${fieldName} format. Expected alphanumeric identifier.`,
      400,
      false
    );
  }
  return trimmed;
}

export function validateSearchParams(query: Record<string, unknown>): {
  q: string;
  page: number;
  type: "all" | "movie" | "series";
} {
  const parsed = searchQuerySchema.safeParse({
    q: query.q,
    page: query.page ?? 1,
    type: query.type ?? "all",
  });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message || "Invalid search parameters.";
    throw new MovieBoxError("INVALID_INPUT", firstIssue, 400, false);
  }
  return parsed.data;
}

export function validateEpisodesParams(query: Record<string, unknown>): { season?: number } {
  const parsed = episodesQuerySchema.safeParse({ season: query.season });
  if (!parsed.success) {
    throw new MovieBoxError(
      "INVALID_INPUT",
      "Invalid season query parameter. Expected integer between 1 and 500.",
      400,
      false
    );
  }
  return parsed.data;
}

export type ParsedStreamIdentifier =
  | {
      kind: "episode";
      rawId: string;
      seriesId: string;
      season: number;
      episode: number;
    }
  | {
      kind: "subject";
      rawId: string;
      subjectId: string;
    };

export function parseUnifiedStreamId(raw: unknown): ParsedStreamIdentifier {
  if (typeof raw !== "string") {
    throw new MovieBoxError("INVALID_INPUT", "Missing stream identifier.", 400, false);
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 96 || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new MovieBoxError(
      "INVALID_INPUT",
      "Invalid stream identifier format.",
      400,
      false
    );
  }

  const epMatch = trimmed.match(COMPOSITE_EPISODE_REGEX);
  if (epMatch) {
    const seriesId = epMatch[1];
    const season = Number.parseInt(epMatch[2], 10);
    const episode = Number.parseInt(epMatch[3], 10);
    if (
      !Number.isFinite(season) ||
      !Number.isFinite(episode) ||
      season < 1 ||
      season > 500 ||
      episode < 1 ||
      episode > 5000
    ) {
      throw new MovieBoxError(
        "INVALID_INPUT",
        "Episode season and episode numbers must be positive integers within bounds.",
        400,
        false
      );
    }
    return {
      kind: "episode",
      rawId: trimmed,
      seriesId,
      season,
      episode,
    };
  }

  // Catch malformed partial episode suffixes like series_s1 or series_sabc_e1
  if (/_s[0-9a-zA-Z]*$/i.test(trimmed) || /_s[^_]*_e[^_]*$/i.test(trimmed)) {
    throw new MovieBoxError(
      "INVALID_INPUT",
      "Malformed composite episode ID. Expected format: {series_id}_s{season}_e{episode}.",
      400,
      false
    );
  }

  return {
    kind: "subject",
    rawId: trimmed,
    subjectId: validateSubjectId(trimmed, "id"),
  };
}

export function validateDeliveryMode(
  rawDelivery: unknown,
  defaultMode: StreamDeliveryMode
): StreamDeliveryMode {
  if (rawDelivery === undefined) {
    return defaultMode;
  }
  if (typeof rawDelivery !== "string") {
    throw new MovieBoxError(
      "INVALID_DELIVERY_MODE",
      "Invalid delivery mode. Allowed values are 'proxy' or 'direct'.",
      400,
      false
    );
  }
  const normalized = rawDelivery.trim().toLowerCase();
  if (normalized === "proxy" || normalized === "direct") {
    return normalized;
  }
  throw new MovieBoxError(
    "INVALID_DELIVERY_MODE",
    `Invalid delivery mode '${rawDelivery}'. Allowed values are 'proxy' or 'direct'.`,
    400,
    false
  );
}
