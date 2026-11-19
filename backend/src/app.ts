import express, { Express } from "express";
import { env } from "./config/env";
import { dbManager } from "./db/database";
import { errorHandler } from "./middleware/errorHandler";
import { rateLimiter } from "./middleware/rateLimiter";
import { requestLogger } from "./middleware/requestLogger";
import adminRoutes from "./routes/admin.routes";
import healthRoutes from "./routes/health.routes";
import publicRoutes from "./routes/public.routes";

export function createApiApp(options?: { dbUrl?: string }): Express {
  dbManager.init(options?.dbUrl);

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "0");
    next();
  });

  // Strict CORS allowlist for API endpoints (stream-proxy routes manage media CORS)
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/v1/stream-proxy")) {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (origin && env.corsOrigins.length > 0 && env.corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Methods",
        req.path.startsWith("/admin") ? "GET, POST, PUT, OPTIONS" : "GET, OPTIONS"
      );
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: "64kb" }));
  app.use(requestLogger);
  app.use("/api", rateLimiter);

  app.use("/", healthRoutes);
  app.use("/api", healthRoutes);
  app.use("/api/v1", publicRoutes);
  app.use("/api/admin", adminRoutes);

  // Unknown API endpoints return structured 404 JSON
  app.use("/api/*", (_req, res) => {
    res.status(404).json({
      status: "error",
      code: "RESOURCE_NOT_FOUND",
      message: "Requested API endpoint does not exist.",
      retryable: false,
      request_id: typeof res.locals.requestId === "string" ? res.locals.requestId : "req-not-found",
    });
  });

  app.use(errorHandler);
  return app;
}
