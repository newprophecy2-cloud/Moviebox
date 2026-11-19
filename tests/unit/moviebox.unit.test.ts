import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import {
  buildCanonicalString,
  decodeSigningSecret,
  generateXClientBuild,
  generateXClientToken,
  generateXTrSignature,
  getSigningSecretFormat,
  sortedQueryString,
} from "../../backend/src/providers/moviebox/crypto";
import {
  cleanMovieBoxTitle,
  isDeprecationNoticeUrl,
  languageToCode,
  mapCaptionsToOptions,
  mapDetailsToMediaDetails,
  mapDetectorItemsToStreams,
  mapPlayInfoToStreams,
  mapResourceItemToStream,
  mapSearchToCatalog,
  placeholderStreamCount,
  resolveDashManifestFromPolicy,
  resolveProviderMediaType,
  sanitizeLanguageLabel,
} from "../../backend/src/providers/moviebox/mapper";
import {
  createSessionFromToken,
  isSessionValid,
  parseJwtClaims,
} from "../../backend/src/providers/moviebox/session";
import {
  isPrivateOrReservedIp,
  StreamProxyService,
} from "../../backend/src/services/streamProxyService";
import { redactSensitiveText } from "../../backend/src/services/loggingService";
import { PlaybackService } from "../../backend/src/services/playbackService";
import {
  parseUnifiedStreamId,
  validateDeliveryMode,
  validateEpisodesParams,
  validateSearchParams,
  validateSubjectId,
} from "../../backend/src/utils/validation";
import { MovieBoxError } from "../../backend/src/providers/moviebox/errors";

describe("MovieBox Crypto & Signing Unit Tests", () => {
  it("decodes signing secrets in base64:, hex:, escaped:, and utf8: formats", () => {
    const b64 = decodeSigningSecret("base64:aGVsbG8=");
    assert.equal(b64?.toString("utf8"), "hello");
    assert.equal(getSigningSecretFormat("base64:aGVsbG8="), "base64");

    const hex = decodeSigningSecret("hex:68656c6c6f");
    assert.equal(hex?.toString("utf8"), "hello");
    assert.equal(getSigningSecretFormat("hex:68656c6c6f"), "hex");

    const esc = decodeSigningSecret("escaped:\\x68\\x65\\x6c\\x6c\\x6f");
    assert.equal(esc?.toString("utf8"), "hello");
    assert.equal(getSigningSecretFormat("escaped:\\x68\\x65\\x6c\\x6c\\x6f"), "escaped");

    const utf = decodeSigningSecret("utf8:secret-key");
    assert.equal(utf?.toString("utf8"), "secret-key");
    assert.equal(getSigningSecretFormat("utf8:secret-key"), "utf8");

    assert.equal(decodeSigningSecret("hex:zzzz"), null);
    assert.equal(getSigningSecretFormat("hex:zzzz"), "invalid");
    assert.equal(getSigningSecretFormat(""), "none");
  });

  it("generates deterministic x-client-token, sorted query string, canonical string, and x-tr-signature", () => {
    const ts = 1700000000123;
    const token = generateXClientToken(ts);
    assert.ok(token.startsWith(`${ts},`));
    assert.equal(token.split(",")[1]?.length, 32);

    const sorted = sortedQueryString("https://api6.aoneroom.com/wefeed-mobile-bff/subject-api/get?subjectId=42&a=1");
    assert.equal(sorted, "a=1&subjectId=42");

    const canonical = buildCanonicalString(
      "post",
      "application/json",
      "application/json",
      "https://api6.aoneroom.com/wefeed-mobile-bff/subject-api/search/v2?z=9&a=1",
      '{"keyword":"Naruto"}',
      ts
    );
    const lines = canonical.split("\n");
    assert.equal(lines[0], "POST");
    assert.equal(lines[1], "application/json");
    assert.equal(lines[2], "application/json");
    assert.equal(lines[3], String(Buffer.byteLength('{"keyword":"Naruto"}', "utf8")));
    assert.equal(lines[4], String(ts));
    assert.equal(lines[5]?.length, 32);
    assert.equal(lines[6], "/wefeed-mobile-bff/subject-api/search/v2?a=1&z=9");

    const sig1 = generateXTrSignature(
      "POST",
      "application/json",
      "application/json",
      "https://api6.aoneroom.com/wefeed-mobile-bff/subject-api/search/v2",
      '{"keyword":"Naruto"}',
      ts,
      "utf8:unit-test-secret"
    );
    const sig2 = generateXTrSignature(
      "POST",
      "application/json",
      "application/json",
      "https://api6.aoneroom.com/wefeed-mobile-bff/subject-api/search/v2",
      '{"keyword":"Naruto"}',
      ts,
      "utf8:unit-test-secret"
    );
    assert.ok(sig1?.startsWith(`${ts}|2|`));
    assert.equal(sig1, sig2);

    const buildTag = generateXClientBuild(ts);
    assert.ok(buildTag && /^\d+\.[0-9a-f]{32}$/.test(buildTag));
  });
});

describe("MovieBox Session Management Unit Tests", () => {
  function makeJwt(claims: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    return `${header}.${payload}.sig`;
  }

  it("parses JWT claims and enforces expiry buffer", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const validJwt = makeJwt({ userId: 99123, exp: nowSec + 3600 });
    const parsed = parseJwtClaims(validJwt);
    assert.equal(parsed.userId, "99123");
    assert.equal(parsed.expiresAt, nowSec + 3600);

    const session = createSessionFromToken(validJwt);
    assert.equal(isSessionValid(session), true);

    const nearlyExpiredJwt = makeJwt({ uid: "abc", exp: nowSec + 10 });
    const nearlyExpiredSession = createSessionFromToken(nearlyExpiredJwt);
    assert.equal(isSessionValid(nearlyExpiredSession), false);

    const expiredJwt = makeJwt({ uid: "abc", exp: nowSec - 10 });
    assert.equal(isSessionValid(createSessionFromToken(expiredJwt)), false);
    assert.equal(isSessionValid(null), false);
  });
});

describe("MovieBox Mapper Unit Tests", () => {
  it("cleans provider title suffixes and maps language labels", () => {
    assert.equal(cleanMovieBoxTitle("[Dual] Naruto S01-09 - Hindi Dub (1080p)"), "Naruto");
    assert.equal(cleanMovieBoxTitle("Inception (2010)"), "Inception (2010)");
    assert.equal(languageToCode("Español"), "es");
    assert.equal(languageToCode("in_id"), "id");
    assert.equal(sanitizeLanguageLabel("jpn"), "Japanese");
  });

  it("detects deprecation placeholders and resolves DASH manifests from sign cookies", () => {
    assert.equal(
      isDeprecationNoticeUrl("https://macdn.aoneroom.com/other/notice.mp4"),
      true
    );
    assert.equal(
      isDeprecationNoticeUrl("https://cdn.aoneroom.com/media/1c7de0bd3393702d9191801f15f88f8d.mp4"),
      true
    );
    assert.equal(
      isDeprecationNoticeUrl("https://cdn.aoneroom.com/media/stream_1080.mp4"),
      false
    );

    const b64Prefix = Buffer.from("https://cdn.aoneroom.com/dash/12345/*").toString("base64url");
    assert.equal(
      resolveDashManifestFromPolicy(`urlprefix=${b64Prefix}:key=1`),
      "https://cdn.aoneroom.com/dash/12345/index.mpd"
    );

    const policyJson = Buffer.from(
      JSON.stringify({ Statement: [{ Resource: "https://cdn.inmoviebox.com/dash/999/*" }] })
    ).toString("base64");
    assert.equal(
      resolveDashManifestFromPolicy(`CloudFront-Policy=${policyJson}; CloudFront-Signature=xyz`),
      "https://cdn.inmoviebox.com/dash/999/index.mpd"
    );
  });

  it("maps search payloads accurately without fabricating missing metadata", () => {
    const mapped = mapSearchToCatalog({
      data: {
        results: [
          {
            subjects: [
              {
                subjectId: "1001",
                title: "Solo Film",
                subjectType: 1,
                releaseDate: "2023-05-01",
                season: 1,
                genre: ["Action"],
              },
              {
                subjectId: "2002",
                title: "Ongoing Series",
                subjectType: 2,
                releaseDate: "2020-01-01",
                season: 4,
                imdbRatingValue: 8.7,
              },
            ],
          },
        ],
        pager: { hasMore: true, totalCount: 42 },
      },
    });

    assert.equal(mapped.hasMore, true);
    assert.equal(mapped.totalCount, 42);
    assert.equal(mapped.items[0]?.mediaType, "movie");
    assert.equal(mapped.items[0]?.seasonCount, undefined);
    assert.equal(mapped.items[1]?.mediaType, "series");
    assert.equal(mapped.items[1]?.seasonCount, 4);
    assert.equal(mapped.items[1]?.rating, "8.7");
  });

  it("maps movie and series details cleanly and preserves undefined when providerEpisodeId is absent", () => {
    const movie = mapDetailsToMediaDetails({
      subject: {
        subjectId: "mv-1",
        title: "Test Movie",
        subjectType: 1,
        duration: 5400,
        seasons: [{ se: 1, maxEp: 1 }],
      },
    });
    assert.ok(movie);
    assert.equal(movie.mediaType, "movie");
    assert.equal(movie.seasons.length, 0);
    assert.equal(movie.duration, "90 min");

    const series = mapDetailsToMediaDetails({
      subject: {
        subjectId: "sr-1",
        title: "Test Series",
        subjectType: 2,
      },
      seasons: {
        seasons: [
          {
            se: 2,
            episodes: [
              { ep: 2, title: "Second" },
              { ep: 1, episodeId: "prov-ep-1", title: "First" },
            ],
          },
          { se: 1, maxEp: 2 },
        ],
      },
    });
    assert.ok(series);
    assert.equal(series.mediaType, "series");
    assert.equal(series.seasons.length, 2);
    assert.equal(series.seasons[0]?.number, 1);
    assert.equal(series.seasons[0]?.episodes[0]?.providerEpisodeId, undefined);
    assert.equal(series.seasons[1]?.number, 2);
    assert.equal(series.seasons[1]?.episodes[0]?.number, 1);
    assert.equal(series.seasons[1]?.episodes[0]?.providerEpisodeId, "prov-ep-1");
    assert.equal(series.seasons[1]?.episodes[1]?.providerEpisodeId, undefined);

    // Does NOT default missing or unknown subjectType to movie
    assert.equal(resolveProviderMediaType({ subjectId: "12345" }), "unresolved");
    assert.equal(resolveProviderMediaType({ subjectId: "12345", subjectType: 99 }), "unresolved");
    assert.equal(resolveProviderMediaType({ subjectId: "12345", subjectType: "movie" }), "movie");
    assert.equal(resolveProviderMediaType({ subjectId: "12345", subjectType: "series" }), "series");

    const unresolved = mapDetailsToMediaDetails({
      subject: {
        subjectId: "9999999999999999999",
        title: "Unknown Type Entry",
      },
    });
    assert.ok(unresolved);
    assert.equal(unresolved.mediaType, "unresolved");
  });

  it("maps streams, placeholder counts, detectors, and captions accurately", () => {
    const playInfo = {
      streams: [
        {
          id: "s1",
          url: "https://cdn.aoneroom.com/video/movie.mp4",
          format: "MP4",
          codecName: "h264",
          resolutions: "720,1080",
          size: 1000000,
          signCookie: "CloudFront-Key=abc",
        },
        {
          id: "s2",
          url: "https://macdn.aoneroom.com/other/notice.mp4",
        },
      ],
    };
    assert.equal(placeholderStreamCount(playInfo), 1);
    const variants = mapPlayInfoToStreams(playInfo);
    assert.equal(variants.length, 2);
    assert.equal(variants[0]?.resolution, 1080);
    assert.equal(variants[0]?.requiresCustomHeaders, true);
    assert.equal(variants[1]?.resolution, 720);

    const resItem = mapResourceItemToStream({
      resourceId: "r99",
      se: 1,
      ep: 3,
      resolution: "1080p",
      resourceLink: "https://cdn.inmoviebox.com/hls/ep3.m3u8",
    });
    assert.equal(resItem.season, 1);
    assert.equal(resItem.episode, 3);
    assert.equal(resItem.variant?.format, "hls");

    const detectorStreams = mapDetectorItemsToStreams(
      {
        resourceDetectors: [
          {
            resolutionList: [
              { resourceId: "d1", se: 1, ep: 2, resolution: 720, resourceLink: "https://cdn.aoneroom.com/a.mp4" },
            ],
          },
        ],
      },
      1,
      2
    );
    assert.equal(detectorStreams.length, 1);

    const captions = mapCaptionsToOptions({
      extCaptions: [
        { id: "c1", lanName: "English", lan: "en", size: 2048, url: "https://cdn.aoneroom.com/sub.vtt" },
        { id: "c2", lan: "in", size: 50, url: "https://cdn.aoneroom.com/tiny.srt" },
        { id: "c3", lan: "en", size: 2048, url: "https://cdn.aoneroom.com/aa348f2541d13ffe.vtt" },
      ],
    });
    assert.equal(captions.length, 1);
    assert.equal(captions[0]?.format, "vtt");
  });
});

describe("Input Validation & Unified ID Parsing Unit Tests", () => {
  it("parses movie IDs and composite episode IDs while rejecting malformed suffixes", () => {
    const movie = parseUnifiedStreamId("movie_12345");
    assert.deepEqual(movie, { kind: "subject", rawId: "movie_12345", subjectId: "movie_12345" });

    const ep = parseUnifiedStreamId("series-99_s2_e14");
    assert.deepEqual(ep, {
      kind: "episode",
      rawId: "series-99_s2_e14",
      seriesId: "series-99",
      season: 2,
      episode: 14,
    });

    assert.throws(() => parseUnifiedStreamId("series-99_s2"), MovieBoxError);
    assert.throws(() => parseUnifiedStreamId("series-99_s0_e1"), MovieBoxError);
    assert.throws(() => parseUnifiedStreamId("../bad"), MovieBoxError);
    assert.throws(() => validateSubjectId("bad/id"), MovieBoxError);
    assert.deepEqual(validateSearchParams({ q: "Naruto", page: "2", type: "series" }), {
      q: "Naruto",
      page: 2,
      type: "series",
    });
    assert.throws(() => validateSearchParams({ q: "   " }), MovieBoxError);
    assert.throws(() => validateEpisodesParams({ season: "0" }), MovieBoxError);

    // Delivery mode validation
    assert.equal(validateDeliveryMode(undefined, "proxy"), "proxy");
    assert.equal(validateDeliveryMode(undefined, "direct"), "direct");
    assert.equal(validateDeliveryMode("proxy", "direct"), "proxy");
    assert.equal(validateDeliveryMode("DIRECT", "proxy"), "direct");
    assert.throws(
      () => validateDeliveryMode("torrent", "proxy"),
      (err: unknown) => err instanceof MovieBoxError && err.code === "INVALID_DELIVERY_MODE" && err.statusCode === 400
    );
    assert.throws(
      () => validateDeliveryMode("", "proxy"),
      (err: unknown) => err instanceof MovieBoxError && err.code === "INVALID_DELIVERY_MODE"
    );
  });
});

describe("StreamProxyService Security & Manifest Rewriting Unit Tests", () => {
  it("blocks private, loopback, CGNAT, link-local, and IPv6-mapped IP addresses", () => {
    assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("10.0.0.15"), true);
    assert.equal(isPrivateOrReservedIp("172.16.0.1"), true);
    assert.equal(isPrivateOrReservedIp("192.168.1.1"), true);
    assert.equal(isPrivateOrReservedIp("169.254.169.254"), true);
    assert.equal(isPrivateOrReservedIp("100.64.0.1"), true);
    assert.equal(isPrivateOrReservedIp("::1"), true);
    assert.equal(isPrivateOrReservedIp("::ffff:127.0.0.1"), true);
    assert.equal(isPrivateOrReservedIp("fe80::1"), true);
    assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
    assert.equal(isPrivateOrReservedIp("1.1.1.1"), false);
  });

  it("enforces host allowlists, blocks raw IPs, validates signed tokens, and rewrites HLS/DASH manifests", async () => {
    const proxy = new StreamProxyService({ mediaHostsOverride: ["aoneroom.com"] });
    assert.equal(proxy.isTargetUrlAllowed("https://cdn.aoneroom.com/media/video.mp4"), true);
    assert.equal(proxy.isTargetUrlAllowed("http://cdn.aoneroom.com/media/video.mp4"), false);
    assert.equal(proxy.isTargetUrlAllowed("https://evil.example.com/media/video.mp4"), false);
    assert.equal(proxy.isTargetUrlAllowed("https://127.0.0.1/media/video.mp4"), false);
    assert.equal(proxy.isTargetUrlAllowed("https://user:pass@cdn.aoneroom.com/media/video.mp4"), false);

    const signed = proxy.createProxyUrl("https://cdn.aoneroom.com/hls/master.m3u8", "media", "k=v");
    assert.ok(signed && signed.startsWith("/api/v1/stream-proxy?token="));
    const token = new URL(`http://localhost${signed}`).searchParams.get("token")!;
    const decoded = proxy.decodeToken(token);
    assert.equal(decoded?.target, "https://cdn.aoneroom.com/hls/master.m3u8");

    // Tampered token must fail
    const tampered = `${token.slice(0, -2)}AA`;
    assert.equal(proxy.decodeToken(tampered), null);

    // HLS rewrite
    const rewrittenHls = proxy.rewriteHlsManifest(
      '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nseg-1.ts\n',
      "https://cdn.aoneroom.com/hls/master.m3u8"
    );
    assert.ok(rewrittenHls.includes('URI="/api/v1/stream-proxy?token='));
    assert.ok(rewrittenHls.includes("\n/api/v1/stream-proxy?token="));

    // DASH rewrite with SegmentTemplate
    const rewrittenDash = proxy.rewriteDashManifest(
      '<MPD><Period><AdaptationSet><SegmentTemplate media="video/$Number$.m4s" initialization="video/init.mp4"/></AdaptationSet></Period></MPD>',
      "https://cdn.aoneroom.com/dash/100/index.mpd"
    );
    assert.ok(rewrittenDash.includes('/api/v1/stream-proxy/dir/'));
    assert.ok(rewrittenDash.includes('/$Number$.m4s'));

    // Directory traversal rejection over HTTP
    const dirToken = proxy.createDirProxyToken("https://cdn.aoneroom.com/dash/100/video/");
    assert.ok(dirToken);
    const app = express();
    app.get("/api/v1/stream-proxy/dir/:token/*", (req, res) => proxy.handleDirSegment(req, res));
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const addr = server.address() as { port: number };
      const rawGetStatus = (reqPath: string) =>
        new Promise<number>((resolve, reject) => {
          const req = http.request(
            { host: "127.0.0.1", port: addr.port, path: reqPath, method: "GET" },
            (res) => {
              res.resume();
              resolve(res.statusCode ?? 0);
            }
          );
          req.on("error", reject);
          req.end();
        });

      const traversalStatus = await rawGetStatus(
        `/api/v1/stream-proxy/dir/${encodeURIComponent(dirToken)}/%2e%2e/secret.mp4`
      );
      assert.equal(traversalStatus, 403);
      const schemeStatus = await rawGetStatus(
        `/api/v1/stream-proxy/dir/${encodeURIComponent(dirToken)}/https://evil.com/x`
      );
      assert.equal(schemeStatus, 403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("distinguishes PROXY_TOKEN_EXPIRED vs PROXY_TOKEN_INVALID and applies PUBLIC_BASE_URL without localhost", () => {
    const proxy = new StreamProxyService({
      mediaHostsOverride: ["aoneroom.com"],
      publicBaseUrlOverride: "https://provider-demo.onrender.com",
    });

    const signed = proxy.createProxyUrl("https://cdn.aoneroom.com/hls/master.m3u8", "media");
    assert.ok(signed && signed.startsWith("https://provider-demo.onrender.com/api/v1/stream-proxy?token="));

    const rewrittenHls = proxy.rewriteHlsManifest(
      "#EXTM3U\nseg-1.ts\n",
      "https://cdn.aoneroom.com/hls/master.m3u8"
    );
    assert.ok(rewrittenHls.includes("https://provider-demo.onrender.com/api/v1/stream-proxy?token="));

    // Invalid token
    const invalidResult = proxy.decodeTokenWithStatus("v1.bad.token");
    assert.equal(invalidResult.valid, false);
    if (!invalidResult.valid) {
      assert.equal(invalidResult.code, "PROXY_TOKEN_INVALID");
    }

    // Expired token (using negative TTL override)
    const expiredProxy = new StreamProxyService({
      mediaHostsOverride: ["aoneroom.com"],
      proxyTtlSecondsOverride: -60,
    });
    const expiredUrl = expiredProxy.createProxyUrl("https://cdn.aoneroom.com/media/clip.mp4", "media");
    assert.ok(expiredUrl);
    const expiredToken = new URL(`https://example.invalid${expiredUrl}`).searchParams.get("token")!;
    const expiredResult = proxy.decodeTokenWithStatus(expiredToken);
    assert.equal(expiredResult.valid, false);
    if (!expiredResult.valid) {
      assert.equal(expiredResult.code, "PROXY_TOKEN_EXPIRED");
    }
  });

  it("redacts signed proxy URLs, cookies, and CDN query parameters from log text", () => {
    const redacted = redactSensitiveText(
      "Failed /api/v1/stream-proxy?token=abc.def.ghi&Signature=xyz123 signCookie=secretcookie Cookie: session=123"
    );
    assert.ok(redacted);
    assert.equal(redacted.includes("abc.def.ghi"), false);
    assert.equal(redacted.includes("xyz123"), false);
    assert.equal(redacted.includes("secretcookie"), false);
    assert.equal(redacted.includes("session=123"), false);
    assert.ok(redacted.includes("[REDACTED]"));
  });

  it("preserves same-quality resources independently, preserves unfabricated audio metadata, and blocks unauthorized direct delivery", async () => {
    const fakeClient = {
      assertEnabled: () => {},
      isMockMode: () => false,
      getSubjectDetails: async () => ({
        subject: {
          subjectId: "mv-multi",
          title: "Multi Resource Movie",
          subjectType: 1,
          dubs: [
            { subjectId: "mv-multi", lanName: "Original Audio", title: "Original Audio" },
          ],
        },
      }),
      getPlayInfo: async () => ({ streams: [] }),
      getEpisodeResourcesV2: async () => ({
        list: [
          {
            resourceId: "res-a",
            resolution: 720,
            codecName: "h264",
            resourceLink: "https://cdn.aoneroom.com/a/720.mp4",
            signCookie: "CloudFront-Policy=locked",
          },
          {
            resourceId: "res-b",
            resolution: 720,
            codecName: "h264",
            resourceLink: "https://cdn.aoneroom.com/b/720.mp4",
          },
        ],
      }),
      getResourcesPage: async () => ({ list: [] }),
      getExtCaptions: async () => ({ extCaptions: [] }),
    } as any;

    const fakeDetails = {
      getRawDetails: async () => ({
        id: "mv-multi",
        provider: "moviebox" as const,
        title: "Multi Resource Movie",
        mediaType: "movie" as const,
        genres: [],
        seasons: [],
        dubs: [{ subjectId: "mv-multi", language: "Original Audio", label: "Original Audio" }],
      }),
    } as any;

    const fakeConfigStore = {
      getConfig: () => ({
        cache_ttl_ms: 0,
        default_stream_delivery: "proxy" as const,
        proxy_delivery_enabled: true,
        direct_delivery_enabled: true,
      }),
    } as any;

    const proxy = new StreamProxyService({ mediaHostsOverride: ["aoneroom.com"] });
    const service = new PlaybackService({
      client: fakeClient,
      details: fakeDetails,
      proxy,
      configStore: fakeConfigStore,
    });

    // Proxy mode keeps BOTH 720p resources independently
    const proxyRes = await service.resolveUnifiedStream("mv-multi", true, "proxy");
    assert.equal(proxyRes.delivery_mode, "proxy");
    assert.equal(proxyRes.streams.length, 2);
    assert.deepEqual(
      proxyRes.streams.map((s) => s.provider_resource_id).sort(),
      ["res-a", "res-b"]
    );
    // Does not invent missing language_code
    assert.equal(proxyRes.stream.audio_tracks[0]?.label, "Original Audio");
    assert.equal(proxyRes.stream.audio_tracks[0]?.language_code, null);

    // Direct mode returns ONLY res-b (res-a requires signCookie)
    const directRes = await service.resolveUnifiedStream("mv-multi", true, "direct");
    assert.equal(directRes.delivery_mode, "direct");
    assert.equal(directRes.streams.length, 1);
    assert.equal(directRes.streams[0]?.provider_resource_id, "res-b");
    assert.equal(directRes.streams[0]?.stream_url, "https://cdn.aoneroom.com/b/720.mp4");
    assert.equal(service.getResolverTelemetry().direct_url_availability, "available");
  });

  it("classifies numeric movie IDs, series IDs, composite episode IDs, and unresolved metadata without ID heuristics", async () => {
    const metadataById: Record<string, any> = {
      "977486567826752424": {
        id: "977486567826752424",
        provider: "moviebox" as const,
        title: "Numeric Movie",
        mediaType: "movie" as const,
        genres: [],
        seasons: [],
        dubs: [],
      },
      "3325889774849773352": {
        id: "3325889774849773352",
        provider: "moviebox" as const,
        title: "Numeric Series",
        mediaType: "series" as const,
        genres: [],
        seasons: [
          {
            number: 1,
            maxEpisode: 1,
            episodes: [
              {
                id: "3325889774849773352_s1_e1",
                subjectId: "3325889774849773352",
                season: 1,
                number: 1,
                title: "Episode 1",
              },
            ],
          },
        ],
        dubs: [],
      },
      "8888888888888888888": {
        id: "8888888888888888888",
        provider: "moviebox" as const,
        title: "Unresolved Type",
        mediaType: "unresolved" as const,
        genres: [],
        seasons: [],
        dubs: [],
      },
    };

    const fakeClient = {
      assertEnabled: () => {},
      isMockMode: () => false,
      getSubjectDetails: async (id: string) => ({
        subject: {
          subjectId: id,
          subjectType: metadataById[id]?.mediaType,
        },
      }),
      getPlayInfo: async () => ({ streams: [] }),
      getEpisodeResourcesV2: async (_id: string, se: number, ep: number) => ({
        list: [
          {
            resourceId: `res-${se}-${ep}`,
            se,
            ep,
            resolution: 1080,
            codecName: "h264",
            resourceLink: `https://cdn.aoneroom.com/video/s${se}e${ep}.mp4`,
          },
        ],
      }),
      getResourcesPage: async () => ({ list: [] }),
      getExtCaptions: async () => ({ extCaptions: [] }),
    } as any;

    const fakeDetails = {
      getRawDetails: async (id: string) => metadataById[id],
    } as any;

    const fakeConfigStore = {
      getConfig: () => ({
        cache_ttl_ms: 0,
        default_stream_delivery: "proxy" as const,
        proxy_delivery_enabled: true,
        direct_delivery_enabled: true,
      }),
    } as any;

    const proxy = new StreamProxyService({ mediaHostsOverride: ["aoneroom.com"], publicBaseUrlOverride: null });
    const service = new PlaybackService({
      client: fakeClient,
      details: fakeDetails,
      proxy,
      configStore: fakeConfigStore,
    });

    // 1. Long numeric movie ID without _s_e resolves directly as movie
    const movieRes = await service.resolveUnifiedStream("977486567826752424", true, "direct");
    assert.equal(movieRes.media_type, "movie");
    assert.equal(movieRes.media_id, "977486567826752424");
    assert.equal(movieRes.delivery_mode, "direct");

    // 2. Long numeric series ID without descriptor returns EPISODE_REQUIRED
    await assert.rejects(
      () => service.resolveUnifiedStream("3325889774849773352", true, "proxy"),
      (err: any) => err instanceof MovieBoxError && err.code === "EPISODE_REQUIRED" && err.statusCode === 400
    );

    // 3. Composite episode ID for numeric series resolves cleanly
    const epRes = await service.resolveUnifiedStream("3325889774849773352_s1_e1", true, "proxy");
    assert.equal(epRes.media_type, "episode");
    assert.equal(epRes.series_id, "3325889774849773352");
    assert.equal(epRes.season_number, 1);
    assert.equal(epRes.episode_number, 1);

    // 4. Unresolved metadata returns MEDIA_TYPE_UNRESOLVED instead of guessing
    await assert.rejects(
      () => service.resolveUnifiedStream("8888888888888888888", true, "proxy"),
      (err: any) => err instanceof MovieBoxError && err.code === "MEDIA_TYPE_UNRESOLVED" && err.statusCode === 422
    );
  });
});
