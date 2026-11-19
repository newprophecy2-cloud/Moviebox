import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { MovieBoxError } from "../providers/moviebox/errors";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) {
    return;
  }

  const requestId =
    typeof res.locals.requestId === "string" ? res.locals.requestId : "req-unknown";

  if (err instanceof MovieBoxError) {
    let safeStatus = err.statusCode;
    if (err.code === "PROVIDER_AUTH_REQUIRED") {
      safeStatus = 424;
    } else if (err.code === "UPSTREAM_TIMEOUT") {
      safeStatus = 504;
    } else if (
      [401, 403, 407].includes(err.statusCode) &&
      err.code !== "UNAUTHORIZED" &&
      err.code !== "FORBIDDEN" &&
      err.code !== "STREAM_PROXY_ERROR" &&
      err.code !== "PROXY_TOKEN_INVALID" &&
      err.code !== "PROXY_TOKEN_EXPIRED"
    ) {
      safeStatus = 424;
    }

    res.locals.errorCode = err.code;
    res.locals.errorMessage = err.message;

    res.status(safeStatus).json({
      status: "error",
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      request_id: requestId,
    });
    return;
  }

  const message =
    !env.isProduction && err instanceof Error
      ? err.message
      : "An unexpected server error occurred.";

  res.locals.errorCode = "INTERNAL_ERROR";
  res.locals.errorMessage = message;

  console.error(`[Backend Error] ${requestId}:`, err instanceof Error ? err.message : "Unknown error");

  res.status(500).json({
    status: "error",
    code: "INTERNAL_ERROR",
    message,
    retryable: false,
    request_id: requestId,
  });
}
