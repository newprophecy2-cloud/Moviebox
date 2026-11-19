import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { loggingService, RouteCategory } from "../services/loggingService";
import { requestContextStorage } from "../utils/requestContext";

function classifyRoute(path: string): RouteCategory {
  if (path.startsWith("/api/v1/search")) return "search";
  if (/^\/api\/v1\/details\/[^/]+\/episodes/.test(path)) return "episodes";
  if (path.startsWith("/api/v1/details")) return "details";
  if (path.startsWith("/api/v1/stream-proxy")) return "proxy";
  if (path.startsWith("/api/v1/stream")) return "stream";
  if (path.startsWith("/api/health")) return "health";
  if (path.startsWith("/api/admin")) return "admin";
  return "other";
}

function summarizeQuery(req: Request): string | null {
  const entries: string[] = [];
  for (const [k, v] of Object.entries(req.query)) {
    if (k.toLowerCase().includes("token") || k.toLowerCase().includes("secret")) {
      entries.push(`${k}=[REDACTED]`);
    } else if (typeof v === "string") {
      entries.push(`${k}=${v.slice(0, 80)}`);
    }
  }
  return entries.length > 0 ? entries.join("&") : null;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api")) {
    next();
    return;
  }

  const incomingId =
    typeof req.headers["x-request-id"] === "string" &&
    /^[a-zA-Z0-9_-]{4,48}$/.test(req.headers["x-request-id"])
      ? req.headers["x-request-id"]
      : undefined;

  const requestId = incomingId || `req-${crypto.randomUUID().slice(0, 12)}`;
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const start = Date.now();
  const routeType = classifyRoute(req.path);
  const querySummary = summarizeQuery(req);

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const statusCode = res.statusCode;
    const success = statusCode >= 200 && statusCode < 400;

    if (routeType !== "proxy" && routeType !== "health") {
      loggingService.recordApiRequest({
        requestId,
        routeType,
        method: req.method,
        path: req.path,
        querySummary,
        statusCode,
        durationMs,
        success,
        errorCode: typeof res.locals.errorCode === "string" ? res.locals.errorCode : null,
        errorMessage: typeof res.locals.errorMessage === "string" ? res.locals.errorMessage : null,
        clientIp: req.ip || req.socket.remoteAddress,
      });
    }

    console.info(
      `[API] ${requestId} ${req.method} ${req.path} -> ${statusCode} (${durationMs}ms)`
    );
  });

  requestContextStorage.run({ requestId }, () => next());
}
