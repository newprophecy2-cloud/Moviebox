import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const isMediaDelivery =
    req.path.startsWith("/v1/stream-proxy") || req.path.startsWith("/v1/mock-media");
  const isAdminUiPolling = req.path.startsWith("/admin") || req.path === "/health";
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";
  const bucketKey = isMediaDelivery
    ? `media:${clientIp}`
    : isAdminUiPolling
    ? `admin:${clientIp}`
    : `api:${clientIp}`;
  const now = Date.now();
  const windowMs = env.rateLimitWindowMs;
  const max = isMediaDelivery
    ? Math.max(env.rateLimitMaxRequests * 20, 2400)
    : isAdminUiPolling
    ? Math.max(env.rateLimitMaxRequests * 5, 600)
    : env.rateLimitMaxRequests;

  let bucket = buckets.get(bucketKey);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(bucketKey, bucket);
  }

  bucket.count += 1;
  res.setHeader("X-RateLimit-Limit", String(max));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));

  if (bucket.count > max) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    const requestId =
      typeof res.locals.requestId === "string" ? res.locals.requestId : "req-rate-limit";
    res.locals.errorCode = "RATE_LIMIT_EXCEEDED";
    res.locals.errorMessage = "Too many requests. Please slow down and try again shortly.";
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({
      status: "error",
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please slow down and try again shortly.",
      retryable: true,
      request_id: requestId,
    });
    return;
  }

  if (buckets.size > 5000) {
    for (const [key, b] of buckets.entries()) {
      if (now > b.resetAt) buckets.delete(key);
    }
  }

  next();
}
