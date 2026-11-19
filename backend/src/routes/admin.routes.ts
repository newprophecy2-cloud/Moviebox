import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { env } from "../config/env";
import {
  ADMIN_SESSION_COOKIE,
  extractAdminToken,
  getAdminSession,
  requireAdminAuth,
  requireRole,
} from "../middleware/adminAuth";
import { MovieBoxError } from "../providers/moviebox/errors";
import { adminManagementService } from "../services/adminManagementService";
import { loggingService } from "../services/loggingService";
import { providerHealthService } from "../services/providerHealthService";
import { streamProxyService } from "../services/streamProxyService";
import { providerConfigUpdateSchema } from "../utils/validation";

const router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
});

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(32),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "operator", "viewer"]),
});

router.post("/auth/login", (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new MovieBoxError("INVALID_INPUT", "Username and password are required.", 400, false);
    }

    const { token, user } = adminManagementService.login(
      parsed.data.username,
      parsed.data.password
    );

    res.cookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.isProduction,
      maxAge: env.adminSessionTtlSeconds * 1000,
      path: "/",
    });

    res.json({
      status: "success",
      data: {
        user,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/auth/logout", (req: Request, res: Response) => {
  const token = extractAdminToken(req);
  const session = adminManagementService.validateSession(token) ?? undefined;
  adminManagementService.logout(token, session);
  res.clearCookie(ADMIN_SESSION_COOKIE, { path: "/" });
  res.json({ status: "success", data: { logged_out: true } });
});

router.get("/auth/me", requireAdminAuth, (_req: Request, res: Response) => {
  res.json({
    status: "success",
    data: {
      user: getAdminSession(res),
    },
  });
});

// All routes below require valid server-side admin authentication
router.use(requireAdminAuth);

router.get("/overview", (_req: Request, res: Response) => {
  res.json({
    status: "success",
    data: adminManagementService.getOverview(),
  });
});

router.get("/provider", (_req: Request, res: Response) => {
  res.json({
    status: "success",
    data: adminManagementService.getProviderDetails(),
  });
});

router.post(
  "/provider/enable",
  requireRole(["super_admin", "admin", "operator"]),
  (_req: Request, res: Response) => {
    const config = adminManagementService.setProviderEnabled(true, getAdminSession(res));
    res.json({ status: "success", data: { enabled: config.enabled, config } });
  }
);

router.post(
  "/provider/disable",
  requireRole(["super_admin", "admin", "operator"]),
  (_req: Request, res: Response) => {
    const config = adminManagementService.setProviderEnabled(false, getAdminSession(res));
    res.json({ status: "success", data: { enabled: config.enabled, config } });
  }
);

router.post(
  "/provider/test",
  requireRole(["super_admin", "admin", "operator"]),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = getAdminSession(res);
      const check = await providerHealthService.runConnectionTest();
      loggingService.recordAudit({
        actor: actor.username,
        role: actor.role,
        action: "PROVIDER_CONNECTION_TEST",
        target: "moviebox",
        details: { status: check.status, latency_ms: check.latency_ms, error_code: check.error_code },
      });
      res.json({ status: "success", data: check });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/provider/health/refresh",
  requireRole(["super_admin", "admin", "operator"]),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const check = await providerHealthService.runConnectionTest();
      res.json({ status: "success", data: check });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/provider/cache/clear",
  requireRole(["super_admin", "admin", "operator"]),
  (_req: Request, res: Response) => {
    const stats = adminManagementService.clearCache(getAdminSession(res));
    res.json({ status: "success", data: stats });
  }
);

router.get("/config", (_req: Request, res: Response) => {
  res.json({
    status: "success",
    data: adminManagementService.getConfigView(),
  });
});

router.put(
  "/config",
  requireRole(["super_admin", "admin"]),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = providerConfigUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message || "Invalid configuration payload.";
        throw new MovieBoxError("INVALID_INPUT", msg, 400, false);
      }
      const data = adminManagementService.updateConfig(parsed.data, getAdminSession(res));
      res.json({ status: "success", data });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/playback/verify-proxy",
  requireRole(["super_admin", "admin", "operator", "viewer"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawUrl = typeof req.body?.stream_url === "string" ? req.body.stream_url.trim() : "";
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(rawUrl, "https://proxy.invalid");
      } catch {
        throw new MovieBoxError("INVALID_INPUT", "Malformed stream URL.", 400, false);
      }

      const isRelativeOrConfiguredPublic =
        rawUrl.startsWith("/") ||
        (env.publicBaseUrl !== null && parsedUrl.origin === env.publicBaseUrl);

      if (
        !isRelativeOrConfiguredPublic ||
        (parsedUrl.pathname !== "/api/v1/stream-proxy" &&
          !parsedUrl.pathname.startsWith("/api/v1/mock-media/"))
      ) {
        throw new MovieBoxError(
          "INVALID_INPUT",
          "Only same-origin stream-proxy or mock-media paths can be verified.",
          400,
          false
        );
      }

      if (parsedUrl.pathname === "/api/v1/stream-proxy") {
        const token = parsedUrl.searchParams.get("token") || "";
        const decoded = streamProxyService.decodeTokenWithStatus(token);
        if (!decoded.valid) {
          res.json({
            status: "success",
            data: {
              token_valid: false,
              expired: decoded.code === "PROXY_TOKEN_EXPIRED",
              error_code: decoded.code,
              expires_at: null,
              kind: null,
            },
          });
          return;
        }
        res.json({
          status: "success",
          data: {
            token_valid: true,
            expired: false,
            error_code: null,
            expires_at: new Date(decoded.payload.exp * 1000).toISOString(),
            kind: decoded.payload.kind,
          },
        });
        return;
      }

      res.json({
        status: "success",
        data: {
          token_valid: true,
          expired: false,
          error_code: null,
          expires_at: null,
          kind: "mock_media",
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/logs", (req: Request, res: Response) => {
  const categoryRaw = typeof req.query.category === "string" ? req.query.category : "api";
  const allowed = [
    "api",
    "provider",
    "playback",
    "stream_errors",
    "errors",
    "timeouts",
    "rate_limits",
    "audit",
  ] as const;
  const category = allowed.includes(categoryRaw as (typeof allowed)[number])
    ? (categoryRaw as (typeof allowed)[number])
    : "api";
  const requestId = typeof req.query.request_id === "string" ? req.query.request_id : undefined;
  const limit = Number.parseInt(String(req.query.limit || "100"), 10);

  const items = loggingService.queryLogs({
    category,
    requestId,
    limit: Number.isFinite(limit) ? limit : 100,
  });

  res.json({
    status: "success",
    data: {
      category,
      total: items.length,
      items,
    },
  });
});

router.get("/system", (_req: Request, res: Response) => {
  res.json({
    status: "success",
    data: adminManagementService.getSystemInfo(),
  });
});

router.post("/system/password", (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new MovieBoxError("INVALID_INPUT", "Valid current and new password required.", 400, false);
    }
    adminManagementService.changeOwnPassword(
      getAdminSession(res),
      parsed.data.current_password,
      parsed.data.new_password
    );
    res.json({ status: "success", data: { updated: true } });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/system/users",
  requireRole(["super_admin", "admin"]),
  (_req: Request, res: Response) => {
    res.json({
      status: "success",
      data: {
        users: adminManagementService.listUsers(),
      },
    });
  }
);

router.post(
  "/system/users",
  requireRole(["super_admin"]),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message || "Invalid user payload.";
        throw new MovieBoxError("INVALID_INPUT", msg, 400, false);
      }
      const user = adminManagementService.createUser(getAdminSession(res), parsed.data);
      res.status(201).json({ status: "success", data: { user } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
