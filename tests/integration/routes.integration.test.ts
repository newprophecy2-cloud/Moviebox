import { after, before, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApiApp } from "../../backend/src/app";
import { dbManager } from "../../backend/src/db/database";
import { movieBoxClient } from "../../backend/src/providers/moviebox/client";
import { cacheService } from "../../backend/src/services/cacheService";
import { providerConfigStore } from "../../backend/src/services/providerConfigStore";
import { StreamProxyService } from "../../backend/src/services/streamProxyService";

type UpstreamScenario = {
  searchMode?: "normal" | "empty" | "paginated" | "timeout";
  detailsMode?: "normal" | "missing" | "malformed" | "timeout";
  playbackMode?:
    | "normal"
    | "cookie_only"
    | "same_quality_multi"
    | "placeholder_only"
    | "empty_sources"
    | "blocked_host"
    | "timeout";
};

function makeFakeJwt(uid: string = "test-user-1"): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ uid, exp: Math.floor(Date.now() / 1000) + 7200 })
  ).toString("base64url");
  return `${header}.${payload}.test-signature`;
}

describe("ProphecyVerse MovieBox Provider Server Integration Tests", () => {
  let apiServer: http.Server;
  let apiBaseUrl: string;
  let upstreamServer: http.Server;
  let upstreamPort: number;
  let scenario: UpstreamScenario = {};
  let capturedUpstreamHeaders: Array<Record<string, unknown>> = [];

  before(async () => {
    // Local TCP HTTP upstream simulator representing MovieBox BFF endpoints + media range server
    upstreamServer = http.createServer((req, res) => {
      capturedUpstreamHeaders.push({
        url: req.url,
        method: req.method,
        "x-tr-signature": req.headers["x-tr-signature"],
        "x-client-token": req.headers["x-client-token"],
        authorization: req.headers["authorization"],
      });

      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on("end", () => {
        const bodyStr = Buffer.concat(chunks).toString("utf8");
        const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
        const path = parsedUrl.pathname;

        // Media asset endpoint supporting HTTP byte-range (206 Partial Content) for proxy tests
        if (path === "/media/range-sample.mp4") {
          const payload = Buffer.from("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ");
          res.setHeader("Content-Type", "video/mp4");
          res.setHeader("Accept-Ranges", "bytes");
          const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : "";
          const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/i);
          if (match) {
            const start = Number.parseInt(match[1], 10);
            const end = match[2]
              ? Math.min(Number.parseInt(match[2], 10), payload.length - 1)
              : payload.length - 1;
            if (start >= payload.length || end < start) {
              res.statusCode = 416;
              res.setHeader("Content-Range", `bytes */${payload.length}`);
              res.end();
              return;
            }
            const slice = payload.subarray(start, end + 1);
            res.statusCode = 206;
            res.setHeader("Content-Range", `bytes ${start}-${end}/${payload.length}`);
            res.setHeader("Content-Length", String(slice.length));
            res.end(req.method === "HEAD" ? undefined : slice);
            return;
          }
          res.setHeader("Content-Length", String(payload.length));
          res.end(req.method === "HEAD" ? undefined : payload);
          return;
        }

        res.setHeader("Content-Type", "application/json");

        if (path === "/wefeed-mobile-bff/user-api/visitor-login") {
          res.end(
            JSON.stringify({ code: 0, data: { token: makeFakeJwt("visitor-77"), uid: "visitor-77" } })
          );
          return;
        }

        if (path === "/wefeed-mobile-bff/subject-api/search/v2") {
          if (scenario.searchMode === "timeout") {
            return; // intentionally hang to trigger timeout
          }
          if (scenario.searchMode === "empty") {
            res.end(
              JSON.stringify({
                code: 0,
                data: { results: [{ subjects: [] }], pager: { hasMore: false, totalCount: 0 } },
              })
            );
            return;
          }
          const reqBody = bodyStr ? JSON.parse(bodyStr) : {};
          const page = Number(reqBody.page || 1);
          const subjectType = Number(reqBody.subjectType || 0);
          const allSubjects = [
            {
              subjectId: "mv-100",
              title: "Inception Orbit",
              subjectType: 1,
              releaseDate: "2024-02-10",
              cover: { url: "https://cdn.aoneroom.com/posters/mv100.jpg" },
              imdbRatingValue: 8.6,
              genre: ["Sci-Fi", "Thriller"],
            },
            {
              subjectId: "sr-200",
              title: "Naruto Chronicles",
              subjectType: 2,
              releaseDate: "2002-10-03",
              season: 2,
              cover: { url: "https://cdn.aoneroom.com/posters/sr200.jpg" },
              imdbRatingValue: 8.9,
              genre: ["Animation", "Action"],
            },
          ];
          const filtered =
            subjectType === 1 || subjectType === 2
              ? allSubjects.filter((s) => s.subjectType === subjectType)
              : allSubjects;

          res.end(
            JSON.stringify({
              code: 0,
              data: {
                results: [{ subjects: filtered }],
                pager: {
                  hasMore: scenario.searchMode === "paginated" && page === 1,
                  totalCount: scenario.searchMode === "paginated" ? 30 : filtered.length,
                },
              },
            })
          );
          return;
        }

        if (path === "/wefeed-mobile-bff/subject-api/get") {
          if (scenario.detailsMode === "timeout") {
            return;
          }
          if (scenario.detailsMode === "missing") {
            res.statusCode = 404;
            res.end(JSON.stringify({ code: 404, message: "Not found" }));
            return;
          }
          if (scenario.detailsMode === "malformed") {
            res.end(JSON.stringify({ code: 0, data: { subject: { badField: true } } }));
            return;
          }

          const subjectId = parsedUrl.searchParams.get("subjectId");
          if (subjectId === "mv-100") {
            res.end(
              JSON.stringify({
                code: 0,
                data: {
                  subject: {
                    subjectId: "mv-100",
                    title: "Inception Orbit",
                    originalTitle: "Inception Orbit",
                    subjectType: 1,
                    releaseDate: "2024-02-10",
                    duration: 7200,
                    description: "A deep-space heist movie.",
                    imdbRatingValue: 8.6,
                    genre: ["Sci-Fi", "Thriller"],
                    cover: { url: "https://cdn.aoneroom.com/posters/mv100.jpg" },
                    backdrop: { url: "https://cdn.aoneroom.com/backdrops/mv100.jpg" },
                    dubs: [{ subjectId: "mv-100", lanName: "English", title: "English" }],
                  },
                },
              })
            );
            return;
          }
          if (subjectId === "sr-200" || subjectId === "3325889774849773352") {
            res.end(
              JSON.stringify({
                code: 0,
                data: {
                  subject: {
                    subjectId,
                    title: subjectId === "3325889774849773352" ? "Naruto" : "Naruto Chronicles",
                    originalTitle: "NARUTO",
                    subjectType: 2,
                    releaseDate: "2002-10-03",
                    description: "Shinobi saga.",
                    imdbRatingValue: 8.9,
                    genre: ["Animation", "Action"],
                    cover: { url: "https://cdn.aoneroom.com/posters/sr200.jpg" },
                    dubs: [
                      { subjectId, lanName: "Japanese", title: "Japanese" },
                      { subjectId: `${subjectId}-en`, lanName: "English", title: "English Dub" },
                    ],
                  },
                },
              })
            );
            return;
          }
          if (subjectId === "977486567826752424") {
            res.end(
              JSON.stringify({
                code: 0,
                data: {
                  subject: {
                    subjectId: "977486567826752424",
                    title: "Inception [Hindi]",
                    originalTitle: "Inception",
                    subjectType: 1,
                    releaseDate: "2010-09-01",
                    duration: "2h 28m",
                    description: "Dream heist.",
                    imdbRatingValue: 8.8,
                    genre: ["Action", "Sci-Fi"],
                    dubs: [{ subjectId: "977486567826752424", lanName: "Hindi", title: "Hindi" }],
                  },
                },
              })
            );
            return;
          }
          if (subjectId === "9999999999999999999") {
            res.end(
              JSON.stringify({
                code: 0,
                data: {
                  subject: {
                    subjectId: "9999999999999999999",
                    title: "Missing Type Entry",
                  },
                },
              })
            );
            return;
          }
          res.statusCode = 404;
          res.end(JSON.stringify({ code: 404, message: "Subject not found" }));
          return;
        }

        if (path === "/wefeed-mobile-bff/subject-api/season-info") {
          const subjectId = parsedUrl.searchParams.get("subjectId");
          if (subjectId === "sr-200" || subjectId === "3325889774849773352") {
            res.end(
              JSON.stringify({
                code: 0,
                data: {
                  seasons: [
                    {
                      se: 1,
                      episodes: [
                        { ep: 2, title: "My Name is Konohamaru!", duration: 1380 },
                        { ep: 1, episodeId: "up-ep-1", title: "Enter: Naruto Uzumaki!", duration: 1400 },
                      ],
                    },
                    {
                      se: 2,
                      episodes: [],
                    },
                  ],
                },
              })
            );
            return;
          }
          res.end(JSON.stringify({ code: 0, data: { seasons: [] } }));
          return;
        }

        if (path === "/wefeed-mobile-bff/subject-api/play-info/v2") {
          if (scenario.playbackMode === "timeout") {
            return;
          }
          if (scenario.playbackMode === "placeholder_only") {
            res.end(
              JSON.stringify({
                code: 0,
                data: {
                  streams: [{ id: "ph-1", url: "https://macdn.aoneroom.com/other/notice.mp4" }],
                },
              })
            );
            return;
          }
          if (
            scenario.playbackMode === "empty_sources" ||
            scenario.playbackMode === "same_quality_multi"
          ) {
            res.end(JSON.stringify({ code: 0, data: { streams: [] } }));
            return;
          }
          if (scenario.playbackMode === "cookie_only") {
            res.end(
              JSON.stringify({
                code: 0,
                data: {
                  streams: [
                    {
                      id: "st-cookie-only",
                      url: "https://cdn.aoneroom.com/streams/locked.m3u8",
                      format: "HLS",
                      codecName: "h264",
                      resolutions: "1080",
                      signCookie: "CloudFront-Key=locked-only",
                    },
                  ],
                },
              })
            );
            return;
          }
          if (scenario.playbackMode === "blocked_host") {
            res.end(
              JSON.stringify({
                code: 0,
                data: {
                  streams: [
                    {
                      id: "bad-host-1",
                      url: "https://untrusted-cdn.example.net/video.mp4",
                      format: "MP4",
                      resolutions: "1080",
                    },
                  ],
                },
              })
            );
            return;
          }
          res.end(
            JSON.stringify({
              code: 0,
              data: {
                streams: [
                  {
                    id: "st-primary",
                    url: "https://cdn.aoneroom.com/streams/video.m3u8",
                    format: "HLS",
                    codecName: "h264",
                    resolutions: "480,720,1080",
                    size: 950000000,
                    signCookie: "CloudFront-Key=demo",
                    language: "Japanese",
                  },
                ],
              },
            })
          );
          return;
        }

        if (
          path === "/wefeed-mobile-bff/subject-api/resource/v2" ||
          path === "/wefeed-mobile-bff/subject-api/resource"
        ) {
          if (scenario.playbackMode === "timeout") {
            return;
          }
          if (
            scenario.playbackMode === "empty_sources" ||
            scenario.playbackMode === "placeholder_only" ||
            scenario.playbackMode === "blocked_host" ||
            scenario.playbackMode === "cookie_only"
          ) {
            res.end(JSON.stringify({ code: 0, data: { list: [] } }));
            return;
          }
          const se = Number(parsedUrl.searchParams.get("se") || 0);
          const ep = Number(parsedUrl.searchParams.get("epFrom") || 0);
          if (scenario.playbackMode === "same_quality_multi") {
            res.end(
              JSON.stringify({
                code: 0,
                data: {
                  list: [
                    {
                      resourceId: `res-mirror-1-${se}-${ep}`,
                      se,
                      ep,
                      resolution: 720,
                      codecName: "h264",
                      resourceLink: `https://cdn.inmoviebox.com/mp4/mirror1_s${se}e${ep}_720.mp4`,
                      size: 450000000,
                    },
                    {
                      resourceId: `res-mirror-2-${se}-${ep}`,
                      se,
                      ep,
                      resolution: 720,
                      codecName: "h264",
                      resourceLink: `https://cdn.inmoviebox.com/mp4/mirror2_s${se}e${ep}_720.mp4`,
                      size: 420000000,
                    },
                  ],
                },
              })
            );
            return;
          }
          res.end(
            JSON.stringify({
              code: 0,
              data: {
                list: [
                  {
                    resourceId: `res-${se}-${ep}`,
                    se,
                    ep,
                    resolution: 720,
                    codecName: "h265",
                    resourceLink: `https://cdn.inmoviebox.com/mp4/s${se}e${ep}_720.mp4`,
                    size: 420000000,
                  },
                ],
              },
            })
          );
          return;
        }

        if (path === "/wefeed-mobile-bff/subject-api/get-ext-captions") {
          res.end(
            JSON.stringify({
              code: 0,
              data: {
                extCaptions: [
                  {
                    id: "cap-en",
                    lanName: "English",
                    lan: "en",
                    size: 4096,
                    url: "https://cdn.aoneroom.com/subs/en.vtt",
                  },
                ],
              },
            })
          );
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ code: 404, message: "Unknown upstream route" }));
      });
    });

    await new Promise<void>((resolve) => upstreamServer.listen(0, "127.0.0.1", resolve));
    upstreamPort = (upstreamServer.address() as { port: number }).port;

    // Forward MovieBoxService.performUpstreamRequest to the local TCP test server while keeping all signing/header/timeout logic intact
    mock.method(
      movieBoxClient as unknown as { performUpstreamRequest: Function },
      "performUpstreamRequest",
      (
        rawUrl: string,
        method: "GET" | "POST",
        headers: Record<string, string>,
        body: string | undefined,
        timeoutMs: number
      ) => {
        const parsed = new URL(rawUrl);
        const localUrl = `http://127.0.0.1:${upstreamPort}${parsed.pathname}${parsed.search}`;
        return new Promise((resolve, reject) => {
          const req = http.request(localUrl, { method, headers, timeout: timeoutMs }, (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
            res.on("end", () => {
              resolve({
                status: res.statusCode ?? 0,
                headers: res.headers,
                body: Buffer.concat(chunks).toString("utf8"),
              });
            });
          });
          req.on("timeout", () => {
            const err = new Error("Upstream request timed out");
            err.name = "AbortError";
            req.destroy(err);
            reject(err);
          });
          req.on("error", reject);
          if (method === "POST" && body !== undefined) {
            req.write(body);
          }
          req.end();
        });
      }
    );

    const app = createApiApp({ dbUrl: ":memory:" });
    apiServer = http.createServer(app);
    await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
    const port = (apiServer.address() as { port: number }).port;
    apiBaseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    mock.restoreAll();
    dbManager.close();
    await new Promise<void>((resolve) => apiServer.close(() => resolve()));
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
  });

  beforeEach(() => {
    scenario = {};
    capturedUpstreamHeaders = [];
    cacheService.clear();
    movieBoxClient.invalidateSession(true);
    providerConfigStore.updateConfig(
      {
        enabled: true,
        mock_mode: false,
        api_hosts: ["https://api6.aoneroom.com"],
        media_hosts: ["aoneroom.com", "inmoviebox.com", "hakunaymatata.com"],
        request_timeout_ms: 2500,
        cache_ttl_ms: 300_000,
        default_stream_delivery: "proxy",
        proxy_delivery_enabled: true,
        direct_delivery_enabled: true,
      },
      "test-reset"
    );
  });

  // --- SEARCH ROUTE ---
  it("SEARCH: supports movie, series, pagination, empty results, invalid query, and upstream timeout", async () => {
    const mvRes = await fetch(`${apiBaseUrl}/api/v1/search?q=Inception&type=movie&page=1`);
    assert.equal(mvRes.status, 200);
    const mvJson = (await mvRes.json()) as any;
    assert.equal(mvJson.status, "success");
    assert.equal(mvJson.data.results.length, 1);
    assert.equal(mvJson.data.results[0].media_type, "movie");
    assert.equal(mvJson.data.results[0].season_count, null);
    assert.ok(capturedUpstreamHeaders.some((h) => Boolean(h["x-tr-signature"])));

    const srRes = await fetch(`${apiBaseUrl}/api/v1/search?q=Naruto&type=series&page=1`);
    assert.equal(srRes.status, 200);
    const srJson = (await srRes.json()) as any;
    assert.equal(srJson.data.results.length, 1);
    assert.equal(srJson.data.results[0].media_type, "series");
    assert.equal(srJson.data.results[0].season_count, 2);

    scenario.searchMode = "paginated";
    cacheService.clear();
    const pg1 = (await (await fetch(`${apiBaseUrl}/api/v1/search?q=all&page=1`)).json()) as any;
    assert.equal(pg1.data.has_more, true);
    assert.equal(pg1.data.total_results, 30);
    const pg2 = (await (await fetch(`${apiBaseUrl}/api/v1/search?q=all&page=2`)).json()) as any;
    assert.equal(pg2.data.page, 2);
    assert.equal(pg2.data.has_more, false);

    scenario.searchMode = "empty";
    cacheService.clear();
    const emptyJson = (await (await fetch(`${apiBaseUrl}/api/v1/search?q=nothinghere`)).json()) as any;
    assert.equal(emptyJson.data.total_results, 0);
    assert.deepEqual(emptyJson.data.results, []);

    const badRes = await fetch(`${apiBaseUrl}/api/v1/search?q=`);
    assert.equal(badRes.status, 400);
    const badJson = (await badRes.json()) as any;
    assert.equal(badJson.code, "INVALID_INPUT");

    scenario.searchMode = "timeout";
    cacheService.clear();
    providerConfigStore.updateConfig({ request_timeout_ms: 1000 }, "test");
    const timeoutRes = await fetch(`${apiBaseUrl}/api/v1/search?q=slow`);
    assert.equal(timeoutRes.status, 504);
    const timeoutJson = (await timeoutRes.json()) as any;
    assert.equal(timeoutJson.code, "UPSTREAM_TIMEOUT");
  });

  // --- DETAILS ROUTE ---
  it("DETAILS: separates movie and series schemas and handles invalid, missing, and malformed responses", async () => {
    const movieRes = await fetch(`${apiBaseUrl}/api/v1/details/mv-100`);
    assert.equal(movieRes.status, 200);
    const movieJson = (await movieRes.json()) as any;
    assert.equal(movieJson.data.media_type, "movie");
    assert.equal(movieJson.data.duration, "120 min");
    assert.equal("seasons" in movieJson.data, false);

    const seriesRes = await fetch(`${apiBaseUrl}/api/v1/details/sr-200`);
    assert.equal(seriesRes.status, 200);
    const seriesJson = (await seriesRes.json()) as any;
    assert.equal(seriesJson.data.media_type, "series");
    assert.equal("duration" in seriesJson.data, false);
    assert.equal(seriesJson.data.seasons.length, 2);
    assert.equal(seriesJson.data.seasons[0].season_number, 1);
    assert.equal(seriesJson.data.seasons[0].episode_count, 2);

    const invalidRes = await fetch(`${apiBaseUrl}/api/v1/details/bad*id`);
    assert.equal(invalidRes.status, 400);
    assert.equal(((await invalidRes.json()) as any).code, "INVALID_INPUT");

    scenario.detailsMode = "missing";
    const missingRes = await fetch(`${apiBaseUrl}/api/v1/details/unknown-999`);
    assert.equal(missingRes.status, 404);
    assert.equal(((await missingRes.json()) as any).code, "MEDIA_NOT_FOUND");

    scenario.detailsMode = "malformed";
    const malformedRes = await fetch(`${apiBaseUrl}/api/v1/details/bad-payload`);
    assert.equal(malformedRes.status, 404);
    assert.equal(((await malformedRes.json()) as any).code, "MEDIA_NOT_FOUND");
  });

  // --- EPISODES ROUTE ---
  it("EPISODES: enumerates sorted episodes, rejects movies with NOT_A_SERIES, and handles empty/invalid seasons", async () => {
    const validRes = await fetch(`${apiBaseUrl}/api/v1/details/sr-200/episodes?season=1`);
    assert.equal(validRes.status, 200);
    const validJson = (await validRes.json()) as any;
    assert.equal(validJson.data.season, 1);
    assert.equal(validJson.data.total_episodes, 2);
    assert.equal(validJson.data.episodes[0].episode_number, 1);
    assert.equal(validJson.data.episodes[0].id, "sr-200_s1_e1");
    assert.equal(validJson.data.episodes[0].provider_episode_id, "up-ep-1");
    assert.equal(validJson.data.episodes[1].episode_number, 2);
    assert.equal(validJson.data.episodes[1].provider_episode_id, null);

    const emptySeasonRes = await fetch(`${apiBaseUrl}/api/v1/details/sr-200/episodes?season=2`);
    assert.equal(emptySeasonRes.status, 200);
    const emptySeasonJson = (await emptySeasonRes.json()) as any;
    assert.equal(emptySeasonJson.data.total_episodes, 0);
    assert.deepEqual(emptySeasonJson.data.episodes, []);

    const invalidSeasonRes = await fetch(`${apiBaseUrl}/api/v1/details/sr-200/episodes?season=0`);
    assert.equal(invalidSeasonRes.status, 400);
    assert.equal(((await invalidSeasonRes.json()) as any).code, "INVALID_INPUT");

    const missingSeasonRes = await fetch(`${apiBaseUrl}/api/v1/details/sr-200/episodes?season=9`);
    assert.equal(missingSeasonRes.status, 404);
    assert.equal(((await missingSeasonRes.json()) as any).code, "MEDIA_NOT_FOUND");

    const movieEpRes = await fetch(`${apiBaseUrl}/api/v1/details/mv-100/episodes`);
    assert.equal(movieEpRes.status, 400);
    assert.equal(((await movieEpRes.json()) as any).code, "NOT_A_SERIES");
  });

  // --- UNIFIED STREAM DELIVERY MODES ---
  it("STREAM: supports proxy and direct delivery for movies & episodes, validates delivery param, never falls back, and preserves same-quality resources", async () => {
    // 1. Movie playback with missing delivery defaults to proxy
    const mvDefaultRes = await fetch(`${apiBaseUrl}/api/v1/stream/mv-100`);
    assert.equal(mvDefaultRes.status, 200);
    const mvDefaultJson = (await mvDefaultRes.json()) as any;
    assert.equal(mvDefaultJson.data.media_type, "movie");
    assert.equal(mvDefaultJson.data.media_id, "mv-100");
    assert.equal(mvDefaultJson.data.delivery_mode, "proxy");
    assert.equal(mvDefaultJson.data.stream.delivery_mode, "proxy");
    assert.equal(mvDefaultJson.data.stream.quality, "1080p");
    assert.ok(mvDefaultJson.data.stream.stream_url.startsWith("/api/v1/stream-proxy?token="));
    assert.equal(mvDefaultJson.data.streams.length, 4); // 1080, 720, 480 HLS + 720 MP4
    assert.equal(mvDefaultJson.data.stream.subtitles.length, 1);
    assert.ok(mvDefaultJson.data.stream.subtitles[0].url.startsWith("/api/v1/stream-proxy?token="));

    // 2. Movie playback with explicit ?delivery=proxy
    const mvProxyRes = await fetch(`${apiBaseUrl}/api/v1/stream/mv-100?delivery=proxy`);
    assert.equal(mvProxyRes.status, 200);
    const mvProxyJson = (await mvProxyRes.json()) as any;
    assert.equal(mvProxyJson.data.delivery_mode, "proxy");
    assert.ok(mvProxyJson.data.stream.stream_url.startsWith("/api/v1/stream-proxy?token="));

    // 3. Movie playback with ?delivery=direct returns only authorized headerless HTTPS variants
    const mvDirectRes = await fetch(`${apiBaseUrl}/api/v1/stream/mv-100?delivery=direct`);
    assert.equal(mvDirectRes.status, 200);
    const mvDirectJson = (await mvDirectRes.json()) as any;
    assert.equal(mvDirectJson.data.delivery_mode, "direct");
    assert.equal(mvDirectJson.data.stream.delivery_mode, "direct");
    assert.equal(mvDirectJson.data.stream.provider_resource_id, "res-0-0");
    assert.equal(mvDirectJson.data.stream.stream_url, "https://cdn.inmoviebox.com/mp4/s0e0_720.mp4");
    // Cookie-protected HLS variants are excluded in direct mode
    assert.equal(mvDirectJson.data.streams.length, 1);

    // 4. Episode playback via composite ID with proxy and direct
    const epProxyRes = await fetch(`${apiBaseUrl}/api/v1/stream/sr-200_s1_e1?delivery=proxy`);
    assert.equal(epProxyRes.status, 200);
    const epProxyJson = (await epProxyRes.json()) as any;
    assert.equal(epProxyJson.data.media_type, "episode");
    assert.equal(epProxyJson.data.series_id, "sr-200");
    assert.equal(epProxyJson.data.season_number, 1);
    assert.equal(epProxyJson.data.episode_number, 1);
    assert.equal(epProxyJson.data.delivery_mode, "proxy");
    assert.equal(epProxyJson.data.stream.audio_tracks.length, 2);

    const epDirectRes = await fetch(`${apiBaseUrl}/api/v1/stream/sr-200_s1_e1?delivery=direct`);
    assert.equal(epDirectRes.status, 200);
    const epDirectJson = (await epDirectRes.json()) as any;
    assert.equal(epDirectJson.data.delivery_mode, "direct");
    assert.equal(epDirectJson.data.stream.provider_resource_id, "res-1-1");
    assert.equal(epDirectJson.data.stream.stream_url, "https://cdn.inmoviebox.com/mp4/s1e1_720.mp4");

    // 5. Invalid delivery mode returns HTTP 400 INVALID_DELIVERY_MODE
    const invalidDeliveryRes = await fetch(`${apiBaseUrl}/api/v1/stream/mv-100?delivery=torrent`);
    assert.equal(invalidDeliveryRes.status, 400);
    const invalidDeliveryJson = (await invalidDeliveryRes.json()) as any;
    assert.equal(invalidDeliveryJson.code, "INVALID_DELIVERY_MODE");
    assert.ok(invalidDeliveryJson.request_id);

    // 6. Direct URL unavailable returns HTTP 404 DIRECT_URL_UNAVAILABLE and never falls back to proxy
    scenario.playbackMode = "cookie_only";
    cacheService.clear();
    const unavailableDirectRes = await fetch(
      `${apiBaseUrl}/api/v1/stream/mv-100?delivery=direct&refresh=1`
    );
    assert.equal(unavailableDirectRes.status, 404);
    assert.equal(((await unavailableDirectRes.json()) as any).code, "DIRECT_URL_UNAVAILABLE");

    // 7. Same-quality multi-resource streams are NOT collapsed into one variant
    scenario.playbackMode = "same_quality_multi";
    cacheService.clear();
    const multiRes = await fetch(`${apiBaseUrl}/api/v1/stream/mv-100?delivery=direct&refresh=1`);
    assert.equal(multiRes.status, 200);
    const multiJson = (await multiRes.json()) as any;
    assert.equal(multiJson.data.streams.length, 2);
    assert.equal(multiJson.data.streams[0].quality, "720p");
    assert.equal(multiJson.data.streams[1].quality, "720p");
    assert.notEqual(
      multiJson.data.streams[0].provider_resource_id,
      multiJson.data.streams[1].provider_resource_id
    );

    // 8. Missing episode, bare series ID, placeholder-only, empty sources, blocked host, timeout, disabled
    const missingEpRes = await fetch(`${apiBaseUrl}/api/v1/stream/sr-200_s1_e99`);
    assert.equal(missingEpRes.status, 404);
    assert.equal(((await missingEpRes.json()) as any).code, "MEDIA_NOT_FOUND");

    const bareSeriesRes = await fetch(`${apiBaseUrl}/api/v1/stream/sr-200`);
    assert.equal(bareSeriesRes.status, 400);
    assert.equal(((await bareSeriesRes.json()) as any).code, "EPISODE_REQUIRED");

    // 8b. Long numeric movie ID resolves directly as movie (proxy & direct);
    // long numeric series ID (3325889774849773352) returns EPISODE_REQUIRED and composite resolves episode;
    // missing provider subjectType returns 422 MEDIA_TYPE_UNRESOLVED instead of guessing
    const numericMovieProxy = await fetch(`${apiBaseUrl}/api/v1/stream/977486567826752424?delivery=proxy`);
    assert.equal(numericMovieProxy.status, 200);
    const numericMovieProxyJson = (await numericMovieProxy.json()) as any;
    assert.equal(numericMovieProxyJson.data.media_type, "movie");
    assert.equal(numericMovieProxyJson.data.media_id, "977486567826752424");
    assert.equal(numericMovieProxyJson.data.delivery_mode, "proxy");

    const numericMovieDirect = await fetch(`${apiBaseUrl}/api/v1/stream/977486567826752424?delivery=direct`);
    assert.equal(numericMovieDirect.status, 200);
    const numericMovieDirectJson = (await numericMovieDirect.json()) as any;
    assert.equal(numericMovieDirectJson.data.media_type, "movie");
    assert.equal(numericMovieDirectJson.data.delivery_mode, "direct");

    const numericSeriesBare = await fetch(`${apiBaseUrl}/api/v1/stream/3325889774849773352`);
    assert.equal(numericSeriesBare.status, 400);
    const numericSeriesBareJson = (await numericSeriesBare.json()) as any;
    assert.equal(numericSeriesBareJson.code, "EPISODE_REQUIRED");
    assert.ok(numericSeriesBareJson.message.includes("3325889774849773352_s{season}_e{episode}"));

    const numericSeriesEp = await fetch(`${apiBaseUrl}/api/v1/stream/3325889774849773352_s1_e1?delivery=direct`);
    assert.equal(numericSeriesEp.status, 200);
    const numericSeriesEpJson = (await numericSeriesEp.json()) as any;
    assert.equal(numericSeriesEpJson.data.media_type, "episode");
    assert.equal(numericSeriesEpJson.data.series_id, "3325889774849773352");
    assert.equal(numericSeriesEpJson.data.delivery_mode, "direct");

    const unresolvedRes = await fetch(`${apiBaseUrl}/api/v1/stream/9999999999999999999`);
    assert.equal(unresolvedRes.status, 422);
    assert.equal(((await unresolvedRes.json()) as any).code, "MEDIA_TYPE_UNRESOLVED");

    scenario.playbackMode = "placeholder_only";
    cacheService.clear();
    const phRes = await fetch(`${apiBaseUrl}/api/v1/stream/mv-100?refresh=true`);
    assert.equal(phRes.status, 503);
    assert.equal(((await phRes.json()) as any).code, "PLACEHOLDER_ONLY");

    scenario.playbackMode = "empty_sources";
    cacheService.clear();
    const emptyRes = await fetch(`${apiBaseUrl}/api/v1/stream/mv-100?refresh=true`);
    assert.equal(emptyRes.status, 404);
    assert.equal(((await emptyRes.json()) as any).code, "STREAM_NOT_FOUND");

    scenario.playbackMode = "blocked_host";
    cacheService.clear();
    const blockedHostRes = await fetch(`${apiBaseUrl}/api/v1/stream/mv-100?refresh=true`);
    assert.equal(blockedHostRes.status, 502);
    assert.equal(((await blockedHostRes.json()) as any).code, "STREAM_PROXY_ERROR");

    scenario.playbackMode = "timeout";
    cacheService.clear();
    providerConfigStore.updateConfig({ request_timeout_ms: 1000 }, "test");
    const streamTimeoutRes = await fetch(`${apiBaseUrl}/api/v1/stream/mv-100?refresh=true`);
    assert.equal(streamTimeoutRes.status, 504);
    assert.equal(((await streamTimeoutRes.json()) as any).code, "UPSTREAM_TIMEOUT");

    providerConfigStore.updateConfig({ enabled: false }, "test");
    const disabledRes = await fetch(`${apiBaseUrl}/api/v1/stream/mv-100`);
    assert.equal(disabledRes.status, 503);
    assert.equal(((await disabledRes.json()) as any).code, "PROVIDER_DISABLED");
  });

  // --- PROXY TOKEN ERRORS & BYTE-RANGE STREAMING ---
  it("PROXY: distinguishes PROXY_TOKEN_INVALID vs PROXY_TOKEN_EXPIRED and supports Range 206 Partial Content", async () => {
    // 1. Invalid proxy token -> 403 PROXY_TOKEN_INVALID
    const invalidProxyRes = await fetch(`${apiBaseUrl}/api/v1/stream-proxy?token=v1.invalid.sig`);
    assert.equal(invalidProxyRes.status, 403);
    assert.equal(((await invalidProxyRes.json()) as any).code, "PROXY_TOKEN_INVALID");

    // 2. Expired proxy token -> 403 PROXY_TOKEN_EXPIRED
    const expiredProxyHelper = new StreamProxyService({
      mediaHostsOverride: ["aoneroom.com"],
      proxyTtlSecondsOverride: -30,
      publicBaseUrlOverride: null,
    });
    const expiredUrl = expiredProxyHelper.createProxyUrl(
      "https://cdn.aoneroom.com/streams/video.mp4",
      "media"
    );
    assert.ok(expiredUrl);
    const expiredProxyRes = await fetch(`${apiBaseUrl}${expiredUrl}`);
    assert.equal(expiredProxyRes.status, 403);
    assert.equal(((await expiredProxyRes.json()) as any).code, "PROXY_TOKEN_EXPIRED");

    // 3. Byte-range streaming via isolated local test proxy bound to 127.0.0.1 upstream media server
    const rangeProxy = new StreamProxyService({
      allowInsecureHttpForTest: true,
      allowPrivateIpForTest: true,
      mediaHostsOverride: ["127.0.0.1"],
      dnsLookupFn: async () => [{ address: "127.0.0.1", family: 4 }],
      publicBaseUrlOverride: null,
    });
    const signedRangeUrl = rangeProxy.createProxyUrl(
      `http://127.0.0.1:${upstreamPort}/media/range-sample.mp4`,
      "media",
      "signCookie=hidden-from-client"
    );
    assert.ok(signedRangeUrl);
    const express = (await import("express")).default;
    const rangeApp = express();
    rangeApp.get("/api/v1/stream-proxy", (req, res) => rangeProxy.handle(req, res));
    const rangeServer = http.createServer(rangeApp);
    await new Promise<void>((resolve) => rangeServer.listen(0, "127.0.0.1", resolve));
    try {
      const rPort = (rangeServer.address() as { port: number }).port;
      const rangeRes = await fetch(`http://127.0.0.1:${rPort}${signedRangeUrl}`, {
        headers: { Range: "bytes=0-9" },
      });
      assert.equal(rangeRes.status, 206);
      assert.equal(rangeRes.headers.get("accept-ranges"), "bytes");
      assert.equal(rangeRes.headers.get("content-range"), "bytes 0-9/36");
      const bytesText = await rangeRes.text();
      assert.equal(bytesText, "0123456789");
    } finally {
      await new Promise<void>((resolve) => rangeServer.close(() => resolve()));
    }
  });

  // --- HEALTH, ADMIN CONFIG, STREAM DELIVERY TELEMETRY & LOG REDACTION ---
  it("ADMIN & HEALTH: exposes /health + /api/health, stream delivery settings, telemetry, and redacts sensitive logs", async () => {
    // 1. Unauthenticated access rejected
    const unauthRes = await fetch(`${apiBaseUrl}/api/admin/overview`);
    assert.equal(unauthRes.status, 401);

    // 2. Super admin login
    const loginRes = await fetch(`${apiBaseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "prophecy-admin-dev" }),
    });
    assert.equal(loginRes.status, 200);
    const setCookie = loginRes.headers.get("set-cookie");
    assert.ok(setCookie && setCookie.includes("pv_admin_session="));
    const adminCookie = setCookie.split(";")[0]!;

    // 3. Create viewer user and verify RBAC restriction
    const createViewerRes = await fetch(`${apiBaseUrl}/api/admin/system/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ username: "viewer1", password: "ViewerPass123!", role: "viewer" }),
    });
    assert.equal(createViewerRes.status, 201);

    const viewerLoginRes = await fetch(`${apiBaseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "viewer1", password: "ViewerPass123!" }),
    });
    assert.equal(viewerLoginRes.status, 200);
    const viewerCookie = viewerLoginRes.headers.get("set-cookie")!.split(";")[0]!;

    const forbiddenConfigRes = await fetch(`${apiBaseUrl}/api/admin/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: viewerCookie },
      body: JSON.stringify({ request_timeout_ms: 8000 }),
    });
    assert.equal(forbiddenConfigRes.status, 403);

    // 4. Disable provider via admin route -> public route returns PROVIDER_DISABLED
    const disableRes = await fetch(`${apiBaseUrl}/api/admin/provider/disable`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    assert.equal(disableRes.status, 200);

    const pubDisabled = await fetch(`${apiBaseUrl}/api/v1/search?q=Naruto`);
    assert.equal(pubDisabled.status, 503);
    assert.equal(((await pubDisabled.json()) as any).code, "PROVIDER_DISABLED");

    await fetch(`${apiBaseUrl}/api/admin/provider/enable`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });

    // 5. Update stream delivery config & verify persistence + telemetry
    const updateCfgRes = await fetch(`${apiBaseUrl}/api/admin/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        request_timeout_ms: 7500,
        cache_ttl_ms: 60000,
        default_stream_delivery: "direct",
        proxy_delivery_enabled: true,
        direct_delivery_enabled: true,
      }),
    });
    assert.equal(updateCfgRes.status, 200);
    const cfgJson = (await updateCfgRes.json()) as any;
    assert.equal(cfgJson.data.config.default_stream_delivery, "direct");
    assert.equal(cfgJson.data.config.proxy_delivery_enabled, true);
    assert.equal(cfgJson.data.config.direct_delivery_enabled, true);
    assert.ok(cfgJson.data.stream_delivery_telemetry);

    // Default omitted delivery now honors admin setting ('direct')
    const defaultDirectRes = await fetch(`${apiBaseUrl}/api/v1/stream/mv-100`);
    assert.equal(defaultDirectRes.status, 200);
    assert.equal(((await defaultDirectRes.json()) as any).data.delivery_mode, "direct");

    // 6. Trigger sensitive query token & stream error and verify DB logs redact tokens
    await fetch(`${apiBaseUrl}/api/v1/search?q=Naruto&token=super-secret-jwt-value`);
    await fetch(`${apiBaseUrl}/api/v1/stream/mv-100?delivery=invalidmode`);
    const streamErrLogsRes = await fetch(`${apiBaseUrl}/api/admin/logs?category=stream_errors&limit=20`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(streamErrLogsRes.status, 200);
    const streamErrJson = (await streamErrLogsRes.json()) as any;
    assert.ok(streamErrJson.data.items.some((r: any) => r.error_code === "INVALID_DELIVERY_MODE"));

    const logsRes = await fetch(`${apiBaseUrl}/api/admin/logs?category=api&limit=30`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(logsRes.status, 200);
    const logsJson = (await logsRes.json()) as any;
    const rawLogsText = JSON.stringify(logsJson.data.items);
    assert.equal(rawLogsText.includes("super-secret-jwt-value"), false);
    assert.ok(rawLogsText.includes("token=[REDACTED]"));

    // 7. Verify BOTH /health (Render) and /api/health
    const rootHealthRes = await fetch(`${apiBaseUrl}/health`);
    assert.equal(rootHealthRes.status, 200);
    const rootHealthJson = (await rootHealthRes.json()) as any;
    assert.equal(rootHealthJson.ok, true);
    assert.equal(rootHealthJson.status, "success");
    assert.equal(rootHealthJson.data.service, "prophecyverse-moviebox-provider");

    const apiHealthRes = await fetch(`${apiBaseUrl}/api/health`);
    assert.equal(apiHealthRes.status, 200);
    const apiHealthJson = (await apiHealthRes.json()) as any;
    assert.equal(apiHealthJson.data.database_connected, true);
  });
});
