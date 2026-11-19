import { Router, Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { movieBoxClient } from "../providers/moviebox/client";
import { catalogService } from "../services/catalogService";
import { detailsService } from "../services/detailsService";
import { episodeService } from "../services/episodeService";
import { playbackService } from "../services/playbackService";
import { streamProxyService } from "../services/streamProxyService";
import {
  validateEpisodesParams,
  validateSearchParams,
  validateSubjectId,
} from "../utils/validation";

const router = Router();

// ROUTE 1 — SEARCH
router.get("/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, page, type } = validateSearchParams(req.query as Record<string, unknown>);
    const data = await catalogService.search(q, page, type);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
});

// ROUTE 3 — EPISODES (registered before :id catch-all for clarity)
router.get("/details/:id/episodes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = validateSubjectId(req.params.id, "id");
    const { season } = validateEpisodesParams(req.query as Record<string, unknown>);
    const data = await episodeService.getEpisodes(id, season);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
});

// ROUTE 2 — DETAILS
router.get("/details/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = validateSubjectId(req.params.id, "id");
    const data = await detailsService.getNormalizedDetails(id);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
});

// ROUTE 4 — UNIFIED STREAM RESOLVER (Movies & Episodes, Proxy & Direct Delivery)
router.get("/stream/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const forceRefresh = req.query.refresh === "true" || req.query.refresh === "1";
    const rawId = typeof req.params.id === "string" ? req.params.id : "";
    const data = await playbackService.resolveUnifiedStream(rawId, forceRefresh, req.query.delivery);
    res.json({ status: "success", data });
  } catch (err) {
    next(err);
  }
});

// SIGNED SAME-ORIGIN STREAM PROXY
router.all("/stream-proxy", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await streamProxyService.handle(req, res);
  } catch (err) {
    next(err);
  }
});

router.all("/stream-proxy/dir/:token/*", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await streamProxyService.handleDirSegment(req, res);
  } catch (err) {
    next(err);
  }
});

// NON-PRODUCTION MOCK MEDIA FIXTURES (strictly disabled in production or live mode)
router.get("/mock-media/:subjectId/:asset", (req: Request, res: Response) => {
  if (env.isProduction || !movieBoxClient.isMockMode()) {
    res.status(404).json({
      status: "error",
      code: "RESOURCE_NOT_FOUND",
      message: "Mock media endpoint is disabled.",
      retryable: false,
      request_id: res.locals.requestId,
    });
    return;
  }

  const subjectId = validateSubjectId(req.params.subjectId, "subjectId");
  const asset = req.params.asset;

  if (asset === "playlist.m3u8") {
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
    res.send(
      [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:6",
        "#EXT-X-MEDIA-SEQUENCE:0",
        "#EXTINF:5.0,",
        `/api/v1/mock-media/${encodeURIComponent(subjectId)}/seg-0.ts`,
        "#EXT-X-ENDLIST",
      ].join("\n")
    );
    return;
  }

  if (asset === "seg-0.ts") {
    const packet = Buffer.alloc(188, 0xff);
    packet[0] = 0x47;
    packet[1] = 0x40;
    packet[2] = 0x00;
    packet[3] = 0x10;
    res.setHeader("Content-Type", "video/mp2t");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", String(packet.length));
    res.send(req.method === "HEAD" ? undefined : packet);
    return;
  }

  if (asset === "sample.mp4") {
    const sampleBytes = Buffer.from("000000186674797069736f6d0000020069736f6d69736f32", "hex");
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Accept-Ranges", "bytes");
    const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : "";
    const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/i);
    if (match) {
      const start = Number.parseInt(match[1], 10);
      const end = match[2]
        ? Math.min(Number.parseInt(match[2], 10), sampleBytes.length - 1)
        : sampleBytes.length - 1;
      if (start >= sampleBytes.length || end < start) {
        res.status(416).setHeader("Content-Range", `bytes */${sampleBytes.length}`).end();
        return;
      }
      const slice = sampleBytes.subarray(start, end + 1);
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${sampleBytes.length}`);
      res.setHeader("Content-Length", String(slice.length));
      res.end(req.method === "HEAD" ? undefined : slice);
      return;
    }
    res.setHeader("Content-Length", String(sampleBytes.length));
    res.end(req.method === "HEAD" ? undefined : sampleBytes);
    return;
  }

  if (asset === "subtitles-en.vtt") {
    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.send("WEBVTT\n\n00:00:00.200 --> 00:00:04.500\nProphecyVerse Mock English Subtitle\n");
    return;
  }

  if (asset === "subtitles-es.srt") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send("1\n00:00:00,200 --> 00:00:04,500\nSubtitulo de prueba ProphecyVerse\n");
    return;
  }

  res.status(404).json({
    status: "error",
    code: "RESOURCE_NOT_FOUND",
    message: "Requested mock media asset not found.",
    retryable: false,
    request_id: res.locals.requestId,
  });
});

export default router;
