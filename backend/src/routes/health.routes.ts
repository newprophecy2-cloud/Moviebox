import { Router } from "express";
import { env } from "../config/env";
import { dbManager } from "../db/database";
import { movieBoxClient } from "../providers/moviebox/client";
import { providerConfigStore } from "../services/providerConfigStore";

const router = Router();

router.get("/health", (_req, res) => {
  const runtime = movieBoxClient.getRuntimeStatus();
  const dbStatus = dbManager.getStatus();
  const config = providerConfigStore.getConfig();

  res.json({
    status: "success",
    ok: true,
    data: {
      service: "prophecyverse-moviebox-provider",
      provider: "moviebox",
      enabled: runtime.enabled,
      mock_mode: runtime.mockMode,
      moviebox_configured: movieBoxClient.isConfigured(),
      auth_diagnostics: movieBoxClient.getAuthDiagnostics(),
      database_connected: dbStatus.connected,
      stateless_mode: env.statelessMode,
      default_stream_delivery: config.default_stream_delivery,
      environment: env.nodeEnv,
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
