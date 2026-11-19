import { FormEvent, useState } from "react";
import { Search } from "lucide-react";
import { publicApi } from "../services/apiClient";
import {
  ApiErrorPayload,
  EpisodesResponseData,
  SearchResultItem,
  SeriesDetailsData,
} from "../types/admin";

export function EpisodesPage() {
  const [query, setQuery] = useState("");
  const [seriesMatches, setSeriesMatches] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedSeries, setSelectedSeries] = useState<SeriesDetailsData | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(undefined);
  const [episodesData, setEpisodesData] = useState<EpisodesResponseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearchSeries = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await publicApi.search(query.trim(), 1, "series");
      if (res.ok && "data" in res.body) {
        setSeriesMatches(res.body.data.results);
      } else {
        setSeriesMatches([]);
        setError((res.body as ApiErrorPayload).message);
      }
    } finally {
      setSearching(false);
    }
  };

  const loadSeriesAndEpisodes = async (seriesId: string, season?: number) => {
    setLoading(true);
    setError(null);
    try {
      const detailsRes = await publicApi.details(seriesId);
      if (!detailsRes.ok || !("data" in detailsRes.body)) {
        setError((detailsRes.body as ApiErrorPayload).message);
        setSelectedSeries(null);
        setEpisodesData(null);
        return;
      }
      if (detailsRes.body.data.media_type !== "series") {
        setError("Selected subject is a movie. Episode listing applies to series only.");
        setSelectedSeries(null);
        setEpisodesData(null);
        return;
      }

      const series = detailsRes.body.data;
      setSelectedSeries(series);
      const targetSeason = season ?? series.seasons[0]?.season_number;
      setSelectedSeason(targetSeason);

      const epRes = await publicApi.episodes(series.id, targetSeason);
      if (epRes.ok && "data" in epRes.body) {
        setEpisodesData(epRes.body.data);
      } else {
        setEpisodesData(null);
        setError((epRes.body as ApiErrorPayload).message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSeasonChange = async (seasonNum: number) => {
    if (!selectedSeries) return;
    setSelectedSeason(seasonNum);
    setLoading(true);
    setError(null);
    try {
      const epRes = await publicApi.episodes(selectedSeries.id, seasonNum);
      if (epRes.ok && "data" in epRes.body) {
        setEpisodesData(epRes.body.data);
      } else {
        setEpisodesData(null);
        setError((epRes.body as ApiErrorPayload).message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Episode Manager</h1>
        <p className="mt-1 text-sm text-slate-400">
          Search series, browse seasons, inspect composite episode IDs vs upstream <span className="font-mono text-slate-300">provider_episode_id</span>, and audit missing metadata.
        </p>
      </div>

      <form
        onSubmit={handleSearchSeries}
        className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex flex-wrap items-end gap-3"
      >
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="ep-search" className="block text-xs font-medium text-slate-300 mb-1.5">
            Search Series
          </label>
          <input
            id="ep-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter series title or keyword..."
            className="w-full px-3.5 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Search className="w-3.5 h-3.5" />
          <span>{searching ? "Searching..." : "Search Series"}</span>
        </button>
      </form>

      {seriesMatches.length > 0 && (
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-800 text-xs font-medium text-slate-300">
            Series Matches ({seriesMatches.length})
          </div>
          <div className="divide-y divide-slate-800/70">
            {seriesMatches.map((s) => (
              <div
                key={s.id}
                className="px-4 py-3 flex items-center justify-between gap-4 text-xs hover:bg-slate-800/30"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-100 truncate">{s.title}</div>
                  <div className="text-slate-400 font-mono mt-0.5">
                    {s.id} · {s.year || "Unknown year"} · {s.season_count ?? "?"} seasons
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadSeriesAndEpisodes(s.id)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-300 bg-blue-950/50 hover:bg-blue-900/60 border border-blue-800/70 rounded-lg whitespace-nowrap shrink-0"
                >
                  Open Episodes
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-rose-950/40 border border-rose-800/70 rounded-xl p-4 text-xs text-rose-200">
          {error}
        </div>
      )}

      {selectedSeries && (
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                {selectedSeries.title}
              </h2>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                Series ID: {selectedSeries.id} · {selectedSeries.seasons.length} season(s)
              </div>
            </div>

            {selectedSeries.seasons.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 bg-[#0B0F17] p-1 rounded-lg border border-slate-800">
                {selectedSeries.seasons.map((s) => (
                  <button
                    key={s.season_number}
                    type="button"
                    onClick={() => void handleSeasonChange(s.season_number)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      selectedSeason === s.season_number
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Season {s.season_number} ({s.episode_count})
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading episodes...</div>
          ) : !episodesData || episodesData.episodes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No episodes returned for this season.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0F1522] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Ep #</th>
                    <th className="py-2.5 px-4 font-medium">Normalized ID</th>
                    <th className="py-2.5 px-4 font-medium">Provider Episode ID</th>
                    <th className="py-2.5 px-4 font-medium">Title</th>
                    <th className="py-2.5 px-4 font-medium">Missing Metadata Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {episodesData.episodes.map((ep) => {
                    const missing: string[] = [];
                    if (!ep.provider_episode_id) missing.push("provider_episode_id");
                    if (!ep.overview) missing.push("overview");
                    if (!ep.thumbnail) missing.push("thumbnail");
                    if (!ep.duration) missing.push("duration");

                    return (
                      <tr key={ep.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-200">
                          S{String(ep.season_number).padStart(2, "0")}E{String(ep.episode_number).padStart(2, "0")}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-blue-300">{ep.id}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-400">
                          {ep.provider_episode_id || "null"}
                        </td>
                        <td className="py-2.5 px-4 text-slate-100">{ep.title}</td>
                        <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">
                          {missing.length > 0 ? `Missing: ${missing.join(", ")}` : "Complete"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
