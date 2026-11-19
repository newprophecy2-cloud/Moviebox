import http from "http";
import https from "https";
import { env } from "../config/env";
import { MOVIEBOX_CONFIG } from "../providers/moviebox/config";
import {
  buildCanonicalString,
  decodeSigningSecret,
  generateXClientBuild,
  generateXClientToken,
  generateXTrSignature,
  getMovieBoxAuthDiagnostics,
  hasAuthorizedSigningCredentials,
  hasRequestSigningSecret,
  MovieBoxAuthDiagnostics,
} from "../providers/moviebox/crypto";
import { isRetryableHttpStatus, MovieBoxError } from "../providers/moviebox/errors";
import { resolveProviderMediaType } from "../providers/moviebox/mapper";
import {
  getMockDetailsPayload,
  getMockSearchPayload,
} from "../providers/moviebox/mockData";
import { createSessionFromToken, isSessionValid } from "../providers/moviebox/session";
import { MovieBoxSession } from "../providers/moviebox/types";
import { getCurrentRequestId } from "../utils/requestContext";
import { loggingService } from "./loggingService";
import { providerConfigStore } from "./providerConfigStore";

export interface MovieBoxSignRequestOptions {
  method: string;
  url: string;
  body?: string;
  timestampMs?: number;
  signingSecretOverride?: string;
  authToken?: string;
}

interface UpstreamResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function getHeaderValue(headers: http.IncomingHttpHeaders, name: string): string | undefined {
  const val = headers[name.toLowerCase()];
  if (Array.isArray(val)) return val[0];
  return typeof val === "string" ? val : undefined;
}

function performHttpRequest(
  rawUrl: string,
  method: "GET" | "POST",
  headers: Record<string, string>,
  body: string | undefined,
  timeoutMs: number,
  allowInsecureHttpForTest: boolean
): Promise<UpstreamResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:" && !(allowInsecureHttpForTest && parsed.protocol === "http:")) {
      reject(
        new MovieBoxError(
          "UPSTREAM_UNAVAILABLE",
          "MovieBox provider requires HTTPS upstream communication.",
          502,
          false
        )
      );
      return;
    }

    const transport = parsed.protocol === "http:" ? http : https;
    const bodyBuffer =
      method === "POST" && body !== undefined ? Buffer.from(body, "utf8") : undefined;
    const reqHeaders: Record<string, string | number> = { ...headers };
    if (bodyBuffer) {
      reqHeaders["Content-Length"] = bodyBuffer.length;
    }

    let settled = false;
    const req = transport.request(
      parsed,
      {
        method,
        headers: reqHeaders,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        res.on("error", (err) => {
          if (settled) return;
          settled = true;
          reject(err);
        });
      }
    );

    req.on("timeout", () => {
      if (settled) return;
      settled = true;
      const timeoutErr = new Error("Upstream request timed out");
      timeoutErr.name = "AbortError";
      req.destroy(timeoutErr);
      reject(timeoutErr);
    });

    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    if (bodyBuffer) {
      req.write(bodyBuffer);
    }
    req.end();
  });
}

export class MovieBoxService {
  private session: MovieBoxSession | null = null;
  private initPromise: Promise<string> | null = null;
  private activeHostIndex = 0;
  private lastSuccessAt: string | null = null;
  private lastError: { code: string; message: string; at: string } | null = null;

  constructor(
    private readonly hostsOverride?: string[],
    private readonly allowInsecureHttpForTest: boolean = false
  ) {
    if (env.movieboxAuthToken) {
      this.session = createSessionFromToken(env.movieboxAuthToken);
    }
  }

  public isEnabled(): boolean {
    if (this.hostsOverride && this.hostsOverride.length > 0) {
      return true;
    }
    return providerConfigStore.getConfig().enabled;
  }

  public isMockMode(): boolean {
    if (env.isProduction) return false;
    if (this.hostsOverride && this.hostsOverride.length > 0) return false;
    return env.movieboxMockMode || providerConfigStore.getConfig().mock_mode;
  }

  public getRequestTimeoutMs(): number {
    if (this.hostsOverride && this.hostsOverride.length > 0) {
      return MOVIEBOX_CONFIG.requestTimeoutMs;
    }
    return providerConfigStore.getConfig().request_timeout_ms || MOVIEBOX_CONFIG.requestTimeoutMs;
  }

  public getHosts(): string[] {
    if (this.hostsOverride && this.hostsOverride.length > 0) {
      return this.hostsOverride;
    }
    const persisted = providerConfigStore.getConfig().api_hosts;
    if (persisted.length > 0) return persisted;
    return env.movieboxHosts.length > 0 ? env.movieboxHosts : [...MOVIEBOX_CONFIG.hostPool];
  }

  public getActiveHostIndex(): number {
    const hosts = this.getHosts();
    return hosts.length > 0 ? this.activeHostIndex % hosts.length : 0;
  }

  public getActiveHost(): string | null {
    const hosts = this.getHosts();
    if (hosts.length === 0) return null;
    return hosts[this.getActiveHostIndex()] ?? null;
  }

  public rotateHost(fromIndex?: number): number {
    const hosts = this.getHosts();
    if (hosts.length === 0) return 0;
    const baseIdx = fromIndex !== undefined ? fromIndex : this.activeHostIndex;
    this.activeHostIndex = (baseIdx + 1) % hosts.length;
    return this.activeHostIndex;
  }

  public getBaseHeaders(timestampMs: number = Date.now()): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": env.movieboxUserAgent,
      Accept: "application/json",
      "Content-Type": "application/json",
      Connection: "keep-alive",
      "x-client-token": generateXClientToken(timestampMs),
      "x-client-status": "0",
    };

    const buildTag = generateXClientBuild(timestampMs);
    if (buildTag) {
      headers["x-client-build"] = buildTag;
    }

    if (env.movieboxClientInfo) {
      try {
        const parsed = JSON.parse(env.movieboxClientInfo) as Record<string, unknown>;
        if (buildTag && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          parsed["X-Client-Build"] = buildTag;
        }
        headers["x-client-info"] = JSON.stringify(parsed);
      } catch {
        headers["x-client-info"] = env.movieboxClientInfo;
      }
    }

    return headers;
  }

  public signRequest(options: MovieBoxSignRequestOptions): Record<string, string> {
    const ts = options.timestampMs ?? Date.now();
    const headers = this.getBaseHeaders(ts);
    const accept = headers.Accept;
    const contentType = headers["Content-Type"];

    const secretRaw = options.signingSecretOverride ?? env.movieboxSigningSecret;
    if (decodeSigningSecret(secretRaw)) {
      const canonical = buildCanonicalString(
        options.method,
        accept,
        contentType,
        options.url,
        options.body,
        ts
      );
      void canonical;
      const signature = generateXTrSignature(
        options.method,
        accept,
        contentType,
        options.url,
        options.body,
        ts,
        secretRaw
      );
      if (signature) {
        headers["x-tr-signature"] = signature;
      }
    }

    if (options.authToken) {
      headers["Authorization"] = `Bearer ${options.authToken}`;
    }

    return headers;
  }

  public isConfigured(): boolean {
    return this.isMockMode() || hasAuthorizedSigningCredentials();
  }

  public getAuthDiagnostics(): MovieBoxAuthDiagnostics {
    return getMovieBoxAuthDiagnostics(this.getHosts().length);
  }

  public getSessionDiagnostics(): {
    hasSession: boolean;
    sessionValid: boolean;
    expiresAt: string | null;
    userIdPresent: boolean;
  } {
    const valid = isSessionValid(this.session);
    return {
      hasSession: Boolean(this.session),
      sessionValid: valid,
      expiresAt: this.session?.expiresAt
        ? new Date(this.session.expiresAt * 1000).toISOString()
        : null,
      userIdPresent: Boolean(this.session?.userId),
    };
  }

  public getRuntimeStatus(): {
    enabled: boolean;
    mockMode: boolean;
    activeHost: string | null;
    hostCount: number;
    lastSuccessAt: string | null;
    lastError: { code: string; message: string; at: string } | null;
    session: ReturnType<MovieBoxService["getSessionDiagnostics"]>;
  } {
    return {
      enabled: this.isEnabled(),
      mockMode: this.isMockMode(),
      activeHost: this.getActiveHost(),
      hostCount: this.getHosts().length,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      session: this.getSessionDiagnostics(),
    };
  }

  public invalidateSession(clearStaticToken: boolean = false): void {
    if (!clearStaticToken && env.movieboxAuthToken) {
      this.session = createSessionFromToken(env.movieboxAuthToken);
      return;
    }
    this.session = null;
  }

  public assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new MovieBoxError(
        "PROVIDER_DISABLED",
        "MovieBox provider is currently disabled by administrator.",
        503,
        false
      );
    }
  }

  public async ensureSession(): Promise<string> {
    this.assertEnabled();

    if (this.isMockMode()) {
      return "mock-session-token";
    }

    if (isSessionValid(this.session)) {
      return this.session!.token;
    }

    if (!hasAuthorizedSigningCredentials()) {
      throw new MovieBoxError(
        "PROVIDER_AUTH_REQUIRED",
        "MovieBox provider signing credentials (MOVIEBOX_SIGNING_SECRET or MOVIEBOX_AUTH_TOKEN) are not configured on the server.",
        424,
        false
      );
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.fetchFreshSession()
      .then((newSession) => {
        this.session = newSession;
        return newSession.token;
      })
      .finally(() => {
        this.initPromise = null;
      });

    return this.initPromise;
  }

  private async fetchFreshSession(): Promise<MovieBoxSession> {
    const val = await this.requestHosts(
      "POST",
      MOVIEBOX_CONFIG.endpoints.visitorLogin,
      "{}",
      undefined,
      this.getRequestTimeoutMs(),
      "visitorLogin"
    );

    const token =
      typeof val?.token === "string" && val.token.trim() ? val.token.trim() : undefined;
    if (!token) {
      throw new MovieBoxError(
        "PROVIDER_AUTH_REQUIRED",
        "MovieBox visitor-login succeeded without returning an authorized session token.",
        502,
        true
      );
    }

    const rawUid = val?.uid ?? val?.userId;
    const explicitUid =
      typeof rawUid === "string"
        ? rawUid
        : typeof rawUid === "number"
        ? String(rawUid)
        : undefined;

    return createSessionFromToken(token, explicitUid);
  }

  private absorbXUserHeader(headers: http.IncomingHttpHeaders): void {
    const xUserRaw = getHeaderValue(headers, "x-user");
    if (!xUserRaw) return;
    try {
      const parsed = JSON.parse(xUserRaw) as Record<string, unknown>;
      const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
      if (!token) return;
      const rawUid = parsed.uid ?? parsed.userId;
      const uid =
        typeof rawUid === "string"
          ? rawUid
          : typeof rawUid === "number"
          ? String(rawUid)
          : undefined;
      this.session = createSessionFromToken(token, uid);
    } catch {
      // ignore malformed x-user header
    }
  }

  public async get(pathAndQuery: string, timeoutMs?: number, operation: string = "get"): Promise<any> {
    return this.request("GET", pathAndQuery, undefined, timeoutMs, operation);
  }

  public async post(
    pathAndQuery: string,
    body: Record<string, unknown>,
    timeoutMs?: number,
    operation: string = "post"
  ): Promise<any> {
    return this.request("POST", pathAndQuery, JSON.stringify(body), timeoutMs, operation);
  }

  private async request(
    method: "GET" | "POST",
    pathAndQuery: string,
    body?: string,
    timeoutMs?: number,
    operation: string = "request"
  ): Promise<any> {
    this.assertEnabled();
    const token = await this.ensureSession();

    try {
      return await this.requestHosts(method, pathAndQuery, body, token, timeoutMs, operation);
    } catch (err) {
      if (
        err instanceof MovieBoxError &&
        (err.statusCode === 401 || err.statusCode === 403 || err.code === "UPSTREAM_UNAVAILABLE") &&
        hasRequestSigningSecret()
      ) {
        this.invalidateSession(true);
        const freshToken = await this.ensureSession();
        return await this.requestHosts(method, pathAndQuery, body, freshToken, timeoutMs, operation);
      }
      throw err;
    }
  }

  private buildSignatureRejectedError(): MovieBoxError {
    const message = hasRequestSigningSecret()
      ? "MovieBox upstream rejected request signature (HTTP 407). Verify server-side MOVIEBOX_SIGNING_SECRET and build/client configuration."
      : "MovieBox upstream requires a signed request (HTTP 407). Configure MOVIEBOX_SIGNING_SECRET on the server in addition to MOVIEBOX_AUTH_TOKEN.";
    return new MovieBoxError("PROVIDER_AUTH_REQUIRED", message, 407, false);
  }

  protected performUpstreamRequest(
    rawUrl: string,
    method: "GET" | "POST",
    headers: Record<string, string>,
    body: string | undefined,
    timeoutMs: number
  ): Promise<UpstreamResponse> {
    return performHttpRequest(
      rawUrl,
      method,
      headers,
      body,
      timeoutMs,
      this.allowInsecureHttpForTest
    );
  }

  private async requestHosts(
    method: "GET" | "POST",
    pathAndQuery: string,
    body?: string,
    authToken?: string,
    timeoutMs: number = this.getRequestTimeoutMs(),
    operation: string = "request"
  ): Promise<any> {
    const hosts = this.getHosts();
    const startIdx = this.getActiveHostIndex();
    let backoffMs: number = MOVIEBOX_CONFIG.retryBackoffMs;
    let lastError: MovieBoxError | null = null;
    let authRejectedError: MovieBoxError | null = null;
    const reqId = getCurrentRequestId();

    for (let i = 0; i < hosts.length; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        backoffMs = MOVIEBOX_CONFIG.retryBackoffMs;
      }

      const idx = (startIdx + i) % hosts.length;
      const base = hosts[idx];
      const url = `${base}${pathAndQuery}`;

      const headers = this.signRequest({
        method,
        url,
        body,
        authToken,
      });

      const attemptStart = Date.now();
      try {
        const res = await this.performUpstreamRequest(url, method, headers, body, timeoutMs);
        const durationMs = Date.now() - attemptStart;
        this.absorbXUserHeader(res.headers);

        if (isRetryableHttpStatus(res.status)) {
          this.rotateHost(idx);

          if (res.status === 407) {
            const sigErr = this.buildSignatureRejectedError();
            authRejectedError = sigErr;
            lastError = sigErr;
            loggingService.recordProviderCall({
              requestId: reqId,
              operation,
              host: base,
              statusCode: res.status,
              durationMs,
              success: false,
              errorCode: sigErr.code,
              message: sigErr.message,
            });
            continue;
          }

          if (res.status === 429) {
            const retryAfterRaw = getHeaderValue(res.headers, "retry-after");
            const retrySecs = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) : NaN;
            backoffMs = Number.isFinite(retrySecs)
              ? Math.min(retrySecs * 1000, MOVIEBOX_CONFIG.maxRateLimitDelayMs)
              : 400;
            lastError = new MovieBoxError(
              "UPSTREAM_RATE_LIMITED",
              "MovieBox upstream rate limit reached. Please retry shortly.",
              429,
              true
            );
            loggingService.recordProviderCall({
              requestId: reqId,
              operation,
              host: base,
              statusCode: 429,
              durationMs,
              success: false,
              errorCode: "UPSTREAM_RATE_LIMITED",
              message: lastError.message,
            });
            continue;
          }

          lastError = new MovieBoxError(
            "UPSTREAM_UNAVAILABLE",
            `MovieBox host returned status ${res.status}`,
            res.status,
            true
          );
          loggingService.recordProviderCall({
            requestId: reqId,
            operation,
            host: base,
            statusCode: res.status,
            durationMs,
            success: false,
            errorCode: "UPSTREAM_UNAVAILABLE",
            message: lastError.message,
          });
          continue;
        }

        const ok = res.status >= 200 && res.status < 300;
        if (!ok) {
          if (res.status === 404) {
            const notFound = new MovieBoxError(
              "MEDIA_NOT_FOUND",
              "Requested MovieBox media resource not found.",
              404,
              false
            );
            loggingService.recordProviderCall({
              requestId: reqId,
              operation,
              host: base,
              statusCode: 404,
              durationMs,
              success: false,
              errorCode: notFound.code,
              message: notFound.message,
            });
            throw notFound;
          }
          if (res.status === 401) {
            const unauth = new MovieBoxError(
              "PROVIDER_AUTH_REQUIRED",
              "MovieBox upstream session expired or unauthorized (HTTP 401).",
              401,
              true
            );
            loggingService.recordProviderCall({
              requestId: reqId,
              operation,
              host: base,
              statusCode: 401,
              durationMs,
              success: false,
              errorCode: unauth.code,
              message: unauth.message,
            });
            throw unauth;
          }
          const httpErr = new MovieBoxError(
            "UPSTREAM_UNAVAILABLE",
            `MovieBox upstream error (HTTP ${res.status})`,
            502,
            res.status >= 500
          );
          loggingService.recordProviderCall({
            requestId: reqId,
            operation,
            host: base,
            statusCode: res.status,
            durationMs,
            success: false,
            errorCode: httpErr.code,
            message: httpErr.message,
          });
          throw httpErr;
        }

        let parsed: any;
        try {
          parsed = JSON.parse(res.body);
        } catch {
          lastError = new MovieBoxError(
            "PARSE_ERROR",
            "Invalid JSON returned by MovieBox upstream.",
            502,
            true
          );
          loggingService.recordProviderCall({
            requestId: reqId,
            operation,
            host: base,
            statusCode: res.status,
            durationMs,
            success: false,
            errorCode: "PARSE_ERROR",
            message: lastError.message,
          });
          continue;
        }

        if (
          typeof parsed?.code === "number" &&
          parsed.code !== 0 &&
          parsed.code !== 200 &&
          (parsed.data === undefined || parsed.data === null)
        ) {
          if (parsed.code === 407) {
            const sigErr = this.buildSignatureRejectedError();
            authRejectedError = sigErr;
            lastError = sigErr;
            loggingService.recordProviderCall({
              requestId: reqId,
              operation,
              host: base,
              statusCode: 407,
              durationMs,
              success: false,
              errorCode: sigErr.code,
              message: sigErr.message,
            });
            continue;
          }
          if (parsed.code === 401 || parsed.code === 403) {
            const authErr = new MovieBoxError(
              "PROVIDER_AUTH_REQUIRED",
              `MovieBox upstream rejected session (code ${parsed.code}).`,
              parsed.code,
              true
            );
            loggingService.recordProviderCall({
              requestId: reqId,
              operation,
              host: base,
              statusCode: parsed.code,
              durationMs,
              success: false,
              errorCode: authErr.code,
              message: authErr.message,
            });
            throw authErr;
          }
          lastError = new MovieBoxError(
            "UPSTREAM_UNAVAILABLE",
            typeof parsed.message === "string" && parsed.message
              ? `MovieBox upstream error: ${parsed.message}`
              : `MovieBox upstream error code ${parsed.code}`,
            502,
            true
          );
          loggingService.recordProviderCall({
            requestId: reqId,
            operation,
            host: base,
            statusCode: res.status,
            durationMs,
            success: false,
            errorCode: "UPSTREAM_UNAVAILABLE",
            message: lastError.message,
          });
          continue;
        }

        this.activeHostIndex = idx;
        this.lastSuccessAt = new Date().toISOString();
        loggingService.recordProviderCall({
          requestId: reqId,
          operation,
          host: base,
          statusCode: res.status,
          durationMs,
          success: true,
        });
        return parsed?.data !== undefined && parsed?.data !== null ? parsed.data : parsed;
      } catch (err: any) {
        const durationMs = Date.now() - attemptStart;
        if (err instanceof MovieBoxError && !err.retryable && err.statusCode === 404) {
          this.lastError = { code: err.code, message: err.message, at: new Date().toISOString() };
          throw err;
        }
        if (err instanceof MovieBoxError && err.statusCode === 401) {
          this.lastError = { code: err.code, message: err.message, at: new Date().toISOString() };
          throw err;
        }
        this.rotateHost(idx);
        if (err?.name === "AbortError") {
          lastError = new MovieBoxError(
            "UPSTREAM_TIMEOUT",
            "MovieBox upstream request timed out.",
            504,
            true
          );
        } else if (err instanceof MovieBoxError) {
          lastError = err;
        } else {
          lastError = new MovieBoxError(
            "UPSTREAM_UNAVAILABLE",
            "Unable to reach MovieBox upstream hosts.",
            502,
            true
          );
        }
        loggingService.recordProviderCall({
          requestId: reqId,
          operation,
          host: base,
          statusCode: null,
          durationMs,
          success: false,
          errorCode: lastError.code,
          message: lastError.message,
        });
      }
    }

    const finalErr =
      authRejectedError ||
      lastError ||
      new MovieBoxError("UPSTREAM_UNAVAILABLE", "All MovieBox API hosts exhausted.", 503, true);
    this.lastError = { code: finalErr.code, message: finalErr.message, at: new Date().toISOString() };
    throw finalErr;
  }

  // --- MovieBox Upstream API Endpoints ---

  public async search(query: string, page: number = 1, subjectType: number = 0): Promise<any> {
    this.assertEnabled();
    if (this.isMockMode()) {
      return getMockSearchPayload(query, subjectType);
    }
    return this.post(
      MOVIEBOX_CONFIG.endpoints.search,
      {
        keyword: query,
        page,
        perPage: MOVIEBOX_CONFIG.perPageSearch,
        subjectType,
      },
      undefined,
      "search"
    );
  }

  public async getSubjectDetails(subjectId: string): Promise<any> {
    this.assertEnabled();
    if (this.isMockMode()) {
      const payload = getMockDetailsPayload(subjectId);
      if (!payload) {
        throw new MovieBoxError("MEDIA_NOT_FOUND", "Subject not found.", 404, false);
      }
      return payload;
    }
    const path = `${MOVIEBOX_CONFIG.endpoints.details}?subjectId=${encodeURIComponent(subjectId)}`;
    return this.get(path, undefined, "details");
  }

  public async getDetails(subjectId: string): Promise<any> {
    this.assertEnabled();
    if (this.isMockMode()) {
      const payload = getMockDetailsPayload(subjectId);
      if (!payload) {
        throw new MovieBoxError("MEDIA_NOT_FOUND", "Subject not found.", 404, false);
      }
      return payload;
    }
    const details = await this.getSubjectDetails(subjectId);

    const subjectObj = details?.data?.subject ?? details?.subject ?? details;
    if (
      resolveProviderMediaType(subjectObj, details) === "series" &&
      details &&
      typeof details === "object"
    ) {
      try {
        const seasonPath = `${MOVIEBOX_CONFIG.endpoints.seasonInfo}?subjectId=${encodeURIComponent(subjectId)}`;
        const seasonInfo = await this.get(seasonPath, undefined, "seasonInfo");
        details.seasons = seasonInfo;
      } catch {
        // Keep base details even if season-info fails
      }
    }
    return details;
  }

  public async getPlayInfo(
    subjectId: string,
    season: number = 0,
    episode: number = 0
  ): Promise<any> {
    this.assertEnabled();
    const params = new URLSearchParams({ subjectId });
    if (season > 0 || episode > 0) {
      params.set("se", String(season));
      params.set("ep", String(episode));
    }
    return this.get(`${MOVIEBOX_CONFIG.endpoints.playInfoV2}?${params.toString()}`, undefined, "playInfoV2");
  }

  public async getEpisodeResourcesV2(
    subjectId: string,
    season: number,
    episode: number
  ): Promise<any> {
    this.assertEnabled();
    const params = new URLSearchParams({
      subjectId,
      page: "1",
      perPage: String(MOVIEBOX_CONFIG.perPageResources),
      all: "0",
      startPosition: "1",
      endPosition: "1",
      pagerMode: "2",
      resolution: "0",
      se: String(season),
      epFrom: String(episode),
      epTo: String(episode),
      isVip: "true",
    });
    return this.get(`${MOVIEBOX_CONFIG.endpoints.resourceV2}?${params.toString()}`, undefined, "resourceV2");
  }

  public async getResourcesPage(
    subjectId: string,
    season: number = 0,
    episode: number = 0,
    resolution: number = 0,
    page: number = 1
  ): Promise<any> {
    this.assertEnabled();
    const params = new URLSearchParams({
      subjectId,
      page: String(page),
      perPage: String(MOVIEBOX_CONFIG.perPageResources),
    });
    if (season > 0 || episode > 0) {
      params.set("se", String(season));
      params.set("ep", String(episode));
    }
    if (resolution > 0) {
      params.set("resolution", String(resolution));
    }
    return this.get(`${MOVIEBOX_CONFIG.endpoints.resourceV1}?${params.toString()}`, undefined, "resourceV1");
  }

  public async getResourcePosition(
    subjectId: string,
    resourceId: string,
    failedUrl: string
  ): Promise<any> {
    this.assertEnabled();
    const params = new URLSearchParams({
      subjectId,
      resourceId,
      failUrl: failedUrl,
      failCode: "404",
      resourceNum: "0",
      isVip: "true",
    });
    return this.get(
      `${MOVIEBOX_CONFIG.endpoints.resourcePositionV2}?${params.toString()}`,
      undefined,
      "resourcePositionV2"
    );
  }

  public async getExtCaptions(subjectId: string, resourceId: string): Promise<any> {
    this.assertEnabled();
    const params = new URLSearchParams({ subjectId, resourceId });
    return this.get(
      `${MOVIEBOX_CONFIG.endpoints.extCaptions}?${params.toString()}`,
      MOVIEBOX_CONFIG.captionTimeoutMs,
      "extCaptions"
    );
  }
}

export const movieBoxService = new MovieBoxService();
