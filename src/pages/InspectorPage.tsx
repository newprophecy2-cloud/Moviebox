import { FormEvent, useState } from "react";
import { Film, Search } from "lucide-react";
import { JsonViewer } from "../components/JsonViewer";
import { publicApi } from "../services/apiClient";
import {
  ApiErrorPayload,
  MediaDetailsData,
  SearchResultItem,
  TimedApiResponse,
} from "../types/admin";

export function InspectorPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);

  const [subjectId, setSubjectId] = useState("");
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [response, setResponse] = useState<TimedApiResponse<{ status: "success"; data: MediaDetailsData }> | null>(
    null
  );

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await publicApi.search(searchQuery.trim(), 1, "all");
      if (res.ok && "data" in res.body) {
        setSearchResults(res.body.data.results);
      } else {
        setSearchResults([]);
      }
    } finally {
      setSearching(false);
    }
  };

  const inspectId = async (targetId: string) => {
    const clean = targetId.trim();
    if (!clean) return;
    setSubjectId(clean);
    setLoadingDetails(true);
    try {
      const res = await publicApi.details(clean);
      setResponse(res as TimedApiResponse<{ status: "success"; data: MediaDetailsData }>);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleInspectSubmit = (e: FormEvent) => {
    e.preventDefault();
    void inspectId(subjectId);
  };

  const detailsData =
    response && response.ok && "data" in response.body ? response.body.data : null;
  const errorData =
    response && !response.ok ? (response.body as ApiErrorPayload) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Media Details Inspector</h1>
        <p className="mt-1 text-sm text-slate-400">
          Inspect normalized Route 2 (<span className="font-mono text-slate-300">/api/v1/details/:id</span>) responses and verify missing fields.
        </p>
      </div>

      {/* Direct ID Lookup + Quick Search */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form
          onSubmit={handleInspectSubmit}
          className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex items-end gap-3"
        >
          <div className="flex-1 min-w-0">
            <label htmlFor="inspect-id" className="block text-xs font-medium text-slate-300 mb-1.5">
              Inspect by MovieBox Subject ID
            </label>
            <input
              id="inspect-id"
              type="text"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="e.g. mock-series-101 or upstream subjectId"
              className="w-full px-3.5 py-2 text-sm font-mono bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loadingDetails || !subjectId.trim()}
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {loadingDetails ? "Loading..." : "Inspect Details"}
          </button>
        </form>

        <form
          onSubmit={handleSearch}
          className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex items-end gap-3"
        >
          <div className="flex-1 min-w-0">
            <label htmlFor="quick-search" className="block text-xs font-medium text-slate-300 mb-1.5">
              Or Search Catalog for Subject ID
            </label>
            <input
              id="quick-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title..."
              className="w-full px-3.5 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !searchQuery.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{searching ? "Searching..." : "Search"}</span>
          </button>
        </form>
      </div>

      {searchResults.length > 0 && (
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-800 text-xs font-medium text-slate-300">
            Search Results ({searchResults.length}) — click a row to inspect
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F1522] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-4 font-medium">ID</th>
                  <th className="py-2 px-4 font-medium">Title</th>
                  <th className="py-2 px-4 font-medium">Type</th>
                  <th className="py-2 px-4 font-medium">Year</th>
                  <th className="py-2 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {searchResults.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-4 font-mono text-slate-300">{item.id}</td>
                    <td className="py-2 px-4 text-slate-100 font-medium">{item.title}</td>
                    <td className="py-2 px-4 text-slate-300 capitalize">{item.media_type}</td>
                    <td className="py-2 px-4 font-mono tabular-nums text-slate-400">{item.year || "—"}</td>
                    <td className="py-2 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => void inspectId(item.id)}
                        className="text-blue-400 hover:text-blue-300 font-medium"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {errorData && (
        <div className="bg-rose-950/40 border border-rose-800/70 rounded-xl p-4 text-xs text-rose-200 space-y-1">
          <div className="font-mono font-semibold">
            HTTP {response?.status} · {errorData.code}
          </div>
          <div>{errorData.message}</div>
        </div>
      )}

      {detailsData && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <div className="xl:col-span-3 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row gap-5">
              <div className="w-28 h-40 shrink-0 rounded-lg overflow-hidden border border-slate-800 bg-[#0B0F17] flex items-center justify-center">
                {detailsData.poster ? (
                  <img
                    src={detailsData.poster}
                    alt={`${detailsData.title} poster`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center px-2">
                    <Film className="w-6 h-6 text-slate-600 mx-auto" />
                    <span className="mt-1 block text-[11px] text-slate-500">No poster</span>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="text-xs text-slate-400">
                  <span className="capitalize">{detailsData.media_type}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono">{detailsData.id}</span>
                  <span aria-hidden="true"> · </span>
                  <span className="font-mono tabular-nums">{response?.durationMs} ms</span>
                </div>
                <h2 className="font-display text-xl font-bold text-white">{detailsData.title}</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {detailsData.description || <span className="text-slate-500 italic">Missing description</span>}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pt-4 border-t border-slate-800 text-xs">
              <div>
                <dt className="text-slate-400">Original Title</dt>
                <dd className="mt-0.5 text-slate-200">
                  {detailsData.original_title || <span className="text-slate-500">null (missing)</span>}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Release Year</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-slate-200">
                  {detailsData.year || <span className="text-slate-500">null (missing)</span>}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Rating</dt>
                <dd className="mt-0.5 font-mono tabular-nums text-slate-200">
                  {detailsData.rating || <span className="text-slate-500">null (missing)</span>}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Genres</dt>
                <dd className="mt-0.5 text-slate-200">
                  {detailsData.genres.length > 0 ? (
                    detailsData.genres.join(" · ")
                  ) : (
                    <span className="text-slate-500">[] (none returned)</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Audio Languages</dt>
                <dd className="mt-0.5 text-slate-200">
                  {detailsData.audio_languages.length > 0 ? (
                    detailsData.audio_languages.join(" · ")
                  ) : (
                    <span className="text-slate-500">[] (none returned)</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Backdrop URL</dt>
                <dd className="mt-0.5 font-mono text-slate-300 truncate">
                  {detailsData.backdrop || <span className="text-slate-500">null (missing)</span>}
                </dd>
              </div>

              {detailsData.media_type === "movie" ? (
                <div>
                  <dt className="text-slate-400">Movie Duration</dt>
                  <dd className="mt-0.5 font-mono text-slate-200">
                    {detailsData.duration || <span className="text-slate-500">null (missing)</span>}
                  </dd>
                </div>
              ) : (
                <div className="sm:col-span-2">
                  <dt className="text-slate-400 mb-1.5">
                    Seasons ({detailsData.seasons.length})
                  </dt>
                  <dd className="text-slate-200 font-mono text-xs">
                    {detailsData.seasons.length > 0
                      ? detailsData.seasons
                          .map((s) => `Season ${s.season_number}: ${s.episode_count} episodes`)
                          .join("  |  ")
                      : "[] (no season metadata returned)"}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="xl:col-span-2">
            <JsonViewer data={response?.body} title="Normalized Route 2 Payload" maxHeightClass="max-h-[540px]" />
          </div>
        </div>
      )}
    </div>
  );
}
