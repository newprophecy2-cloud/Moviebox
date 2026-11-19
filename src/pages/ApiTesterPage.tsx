import { useState } from "react";
import { Play } from "lucide-react";
import { JsonViewer } from "../components/JsonViewer";
import { publicApi } from "../services/apiClient";
import { TimedApiResponse } from "../types/admin";

type RouteKey = "search" | "details" | "episodes" | "stream";

export function ApiTesterPage() {
  const [activeRoute, setActiveRoute] = useState<RouteKey>("search");

  // Search inputs
  const [searchQ, setSearchQ] = useState("Naruto");
  const [searchPage, setSearchPage] = useState("1");
  const [searchType, setSearchType] = useState<"all" | "movie" | "series">("all");

  // Details inputs
  const [detailsId, setDetailsId] = useState("mock-series-101");

  // Episodes inputs
  const [episodesId, setEpisodesId] = useState("mock-series-101");
  const [episodesSeason, setEpisodesSeason] = useState("1");

  // Stream inputs
  const [streamId, setStreamId] = useState("mock-series-101_s1_e1");
  const [streamDelivery, setStreamDelivery] = useState<"default" | "proxy" | "direct">("default");
  const [streamRefresh, setStreamRefresh] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TimedApiResponse | null>(null);

  const runTest = async () => {
    setLoading(true);
    try {
      let res: TimedApiResponse;
      if (activeRoute === "search") {
        res = await publicApi.search(
          searchQ,
          Number.parseInt(searchPage, 10) || 1,
          searchType
        );
      } else if (activeRoute === "details") {
        res = await publicApi.details(detailsId.trim());
      } else if (activeRoute === "episodes") {
        const sNum = episodesSeason.trim()
          ? Number.parseInt(episodesSeason.trim(), 10)
          : undefined;
        res = await publicApi.episodes(episodesId.trim(), sNum);
      } else {
        res = await publicApi.stream(
          streamId.trim(),
          streamRefresh,
          streamDelivery === "default" ? undefined : streamDelivery
        );
      }
      setResult(res);
    } catch (err) {
      setResult({
        ok: false,
        status: 0,
        durationMs: 0,
        url: "",
        requestId: null,
        body: {
          status: "error",
          code: "NETWORK_ERROR",
          message: err instanceof Error ? err.message : "Request failed",
          retryable: true,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const previewUrl =
    activeRoute === "search"
      ? `/api/v1/search?q=${encodeURIComponent(searchQ)}&page=${searchPage || "1"}&type=${searchType}`
      : activeRoute === "details"
      ? `/api/v1/details/${encodeURIComponent(detailsId.trim() || ":id")}`
      : activeRoute === "episodes"
      ? `/api/v1/details/${encodeURIComponent(episodesId.trim() || ":id")}/episodes${
          episodesSeason.trim() ? `?season=${episodesSeason.trim()}` : ""
        }`
      : `/api/v1/stream/${encodeURIComponent(streamId.trim() || ":id")}${
          [
            streamDelivery !== "default" ? `delivery=${streamDelivery}` : "",
            streamRefresh ? "refresh=1" : "",
          ]
            .filter(Boolean)
            .join("&")
            ? `?${[
                streamDelivery !== "default" ? `delivery=${streamDelivery}` : "",
                streamRefresh ? "refresh=1" : "",
              ]
                .filter(Boolean)
                .join("&")}`
            : ""
        }`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">API Route Tester</h1>
        <p className="mt-1 text-sm text-slate-400">
          Execute live HTTP requests directly against the four primary public API endpoints.
        </p>
      </div>

      {/* Segmented Route Switcher */}
      <div className="flex flex-wrap gap-1.5 p-1 bg-[#111827] border border-slate-800 rounded-xl w-fit">
        {(
          [
            { id: "search", label: "1. Search" },
            { id: "details", label: "2. Details" },
            { id: "episodes", label: "3. Episodes" },
            { id: "stream", label: "4. Unified Stream" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveRoute(tab.id);
              setResult(null);
            }}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              activeRoute === tab.id
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Request Builder */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-[#0B0F17] border border-slate-800 rounded-lg">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xs font-mono font-semibold text-emerald-400">GET</span>
            <span className="text-xs font-mono text-slate-200 truncate">{previewUrl}</span>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={runTest}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{loading ? "Running..." : "Send Request"}</span>
          </button>
        </div>

        {activeRoute === "search" && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">q (Query)</label>
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">page</label>
              <input
                type="number"
                min={1}
                value={searchPage}
                onChange={(e) => setSearchPage(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">type</label>
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value as "all" | "movie" | "series")}
                className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
              >
                <option value="all">all</option>
                <option value="movie">movie</option>
                <option value="series">series</option>
              </select>
            </div>
          </div>
        )}

        {activeRoute === "details" && (
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              :id (Provider Subject ID)
            </label>
            <input
              type="text"
              value={detailsId}
              onChange={(e) => setDetailsId(e.target.value)}
              className="w-full max-w-md px-3 py-2 text-sm font-mono bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
            />
          </div>
        )}

        {activeRoute === "episodes" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                :id (Series Subject ID)
              </label>
              <input
                type="text"
                value={episodesId}
                onChange={(e) => setEpisodesId(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                season (optional)
              </label>
              <input
                type="text"
                value={episodesSeason}
                onChange={(e) => setEpisodesSeason(e.target.value)}
                placeholder="Leave blank for all seasons"
                className="w-full px-3 py-2 text-sm font-mono bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
              />
            </div>
          </div>
        )}

        {activeRoute === "stream" && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full max-w-md">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                :id (Movie Subject ID or &#123;series_id&#125;_s&#123;season&#125;_e&#123;episode&#125;)
              </label>
              <input
                type="text"
                value={streamId}
                onChange={(e) => setStreamId(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">delivery</label>
              <select
                value={streamDelivery}
                onChange={(e) =>
                  setStreamDelivery(e.target.value as "default" | "proxy" | "direct")
                }
                className="px-3 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
              >
                <option value="default">omit (server default)</option>
                <option value="proxy">proxy</option>
                <option value="direct">direct</option>
              </select>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300 pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={streamRefresh}
                onChange={(e) => setStreamRefresh(e.target.checked)}
                className="rounded border-slate-700 bg-[#0B0F17]"
              />
              <span>Force refresh (?refresh=1)</span>
            </label>
          </div>
        )}
      </div>

      {/* Response Panel */}
      {result && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-6 px-4 py-3 bg-[#111827] border border-slate-800 rounded-xl text-xs">
            <div>
              <span className="text-slate-400">HTTP Status: </span>
              <span
                className={`font-mono font-semibold tabular-nums ${
                  result.ok ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {result.status}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Response Time: </span>
              <span className="font-mono tabular-nums text-slate-200">{result.durationMs} ms</span>
            </div>
            {result.requestId && (
              <div>
                <span className="text-slate-400">Request ID: </span>
                <span className="font-mono text-slate-200">{result.requestId}</span>
              </div>
            )}
          </div>

          <JsonViewer data={result.body} title="Live Backend Response" maxHeightClass="max-h-[540px]" />
        </div>
      )}
    </div>
  );
}
