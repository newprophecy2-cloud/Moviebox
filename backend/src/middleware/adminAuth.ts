import { Request, Response, NextFunction } from "express";
import { MovieBoxError } from "../providers/moviebox/errors";
import {
  adminManagementService,
  AdminRole,
  AdminSessionContext,
} from "../services/adminManagementService";

export const ADMIN_SESSION_COOKIE = "pv_admin_session";

function parseCookieHeader(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export function extractAdminToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  return parseCookieHeader(req.headers.cookie, ADMIN_SESSION_COOKIE);
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractAdminToken(req);
  const session = adminManagementService.validateSession(token);
  if (!session) {
    next(
      new MovieBoxError(
        "UNAUTHORIZED",
        "Administrator authentication is required.",
        401,
        false
      )
    );
    return;
  }
  res.locals.adminSession = session;
  next();
}

export function getAdminSession(res: Response): AdminSessionContext {
  return res.locals.adminSession as AdminSessionContext;
}

export function requireRole(allowedRoles: AdminRole[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const session = res.locals.adminSession as AdminSessionContext | undefined;
    if (!session) {
      next(new MovieBoxError("UNAUTHORIZED", "Authentication required.", 401, false));
      return;
    }
    if (!allowedRoles.includes(session.role)) {
      next(
        new MovieBoxError(
          "FORBIDDEN",
          `Role '${session.role}' is not permitted to perform this action.`,
          403,
          false
        )
      );
      return;
    }
    next();
  };
}
