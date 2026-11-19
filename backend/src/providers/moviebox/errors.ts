export type MovieBoxErrorCode =
  | "INVALID_INPUT"
  | "INVALID_DELIVERY_MODE"
  | "MEDIA_NOT_FOUND"
  | "MEDIA_TYPE_UNRESOLVED"
  | "RESOURCE_NOT_FOUND"
  | "NOT_A_SERIES"
  | "EPISODE_REQUIRED"
  | "STREAM_NOT_FOUND"
  | "DIRECT_URL_UNAVAILABLE"
  | "PROXY_TOKEN_INVALID"
  | "PROXY_TOKEN_EXPIRED"
  | "PROVIDER_DISABLED"
  | "PROVIDER_AUTH_REQUIRED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_UNAVAILABLE"
  | "SOURCE_NOT_AVAILABLE"
  | "PLACEHOLDER_ONLY"
  | "STREAM_PROXY_ERROR"
  | "PARSE_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMIT_EXCEEDED"
  | "INTERNAL_ERROR";

export const PLACEHOLDER_ONLY_MESSAGE =
  "MovieBox is serving a placeholder clip instead of playable media for this title.";

export class MovieBoxError extends Error {
  public readonly code: MovieBoxErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(
    code: MovieBoxErrorCode,
    message: string,
    statusCode: number,
    retryable: boolean = false
  ) {
    super(message);
    this.name = "MovieBoxError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export function isRetryableHttpStatus(status: number): boolean {
  return [403, 406, 407, 429, 500, 502, 503, 504].includes(status);
}
