import { FormEvent, useCallback, useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { adminApi, ApiClientError } from "../services/apiClient";

type LogCategory =
  | "api"
  | "provider"
  | "playback"
  | "stream_errors"
  | "errors"
  | "timeouts"
  | "rate_limits"
  | "audit";

const CATEGORIES: Array<{ id: LogCategory; label: string }> = [
  { id: "api", label: "API Requests" },
  { id: "provider", label: "Provider Calls" },
  { id: "playback", label: "Playback Resolution" },
  { id: "stream_errors", label: "Stream Errors" },
  { id: "errors", label: "Errors" },
  { id: "timeouts", label: "Timeouts" },
  { id: "rate_limits", label: "Rate Limits" },
  { id: "audit", label: "Admin Audit" },
];

export function LogsPage() {
  const [category, setCategory] = useState<LogCategory>("api");
  const [requestIdFilter, setRequestIdFilter] = useState("");
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cat: LogCategory, reqId: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminApi.getLogs(cat, reqId, 120);
        setItems(res.items);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Failed to load logs.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load(category, requestIdFilter);
  }, [category, load]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    void load(category, requestIdFilter);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Logs & Diagnostics</h1>
          <p className="mt-1 text-sm text-slate-400">
            Searchable server-side SQLite logs with automatic token, cookie, and secret redaction.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(category, requestIdFilter)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#111827] hover:bg-slate-800 border border-slate-700 rounded-lg whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Category Filter + Request ID Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 p-1 bg-[#111827] border border-slate-800 rounded-xl">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                category === c.id ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <input
            type="text"
            value={requestIdFilter}
            onChange={(e) => setRequestIdFilter(e.target.value)}
            placeholder="Filter by request_id..."
            className="px-3 py-1.5 text-xs font-mono bg-[#111827] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg whitespace-nowrap shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search</span>
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-rose-950/40 border border-rose-800/70 rounded-xl p-4 text-xs text-rose-200">
          {error}
        </div>
      )}

      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading log entries...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No log entries match this filter.
          </div>
        ) : category === "provider" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F1522] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Request ID</th>
                  <th className="py-2.5 px-4 font-medium">Operation</th>
                  <th className="py-2.5 px-4 font-medium">Host</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Duration</th>
                  <th className="py-2.5 px-4 font-medium">Result</th>
                  <th className="py-2.5 px-4 font-medium text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {items.map((row, i) => (
                  <tr key={String(row.id ?? i)} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-mono text-slate-300">{String(row.request_id || "—")}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-200">{String(row.operation)}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">{String(row.host)}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300">
                      {row.status_code !== null ? String(row.status_code) : "—"}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300 text-right">
                      {String(row.duration_ms)} ms
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 max-w-xs truncate">
                      {row.success === 1 ? (
                        <span className="text-emerald-400">OK</span>
                      ) : (
                        <span className="text-rose-400">
                          {String(row.error_code || "ERR")}: {String(row.message || "")}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 text-right whitespace-nowrap">
                      {new Date(String(row.created_at)).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : category === "audit" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F1522] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Actor</th>
                  <th className="py-2.5 px-4 font-medium">Role</th>
                  <th className="py-2.5 px-4 font-medium">Action</th>
                  <th className="py-2.5 px-4 font-medium">Target</th>
                  <th className="py-2.5 px-4 font-medium">Details</th>
                  <th className="py-2.5 px-4 font-medium text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {items.map((row, i) => (
                  <tr key={String(row.id ?? i)} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-medium text-slate-200">{String(row.actor)}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">{String(row.role)}</td>
                    <td className="py-2.5 px-4 font-mono text-blue-300">{String(row.action)}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-300">{String(row.target)}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-400 max-w-sm truncate">
                      {row.details_json ? String(row.details_json) : "—"}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 text-right whitespace-nowrap">
                      {new Date(String(row.created_at)).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F1522] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Request ID</th>
                  <th className="py-2.5 px-4 font-medium">Type</th>
                  <th className="py-2.5 px-4 font-medium">Path</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Duration</th>
                  <th className="py-2.5 px-4 font-medium">Error</th>
                  <th className="py-2.5 px-4 font-medium text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {items.map((row, i) => (
                  <tr key={String(row.id ?? i)} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                      {String(row.request_id)}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-400">{String(row.route_type)}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-200 whitespace-nowrap">
                      {String(row.method)} {String(row.path)}
                      {row.query_summary ? `?${String(row.query_summary)}` : ""}
                    </td>
                    <td
                      className={`py-2.5 px-4 font-mono tabular-nums ${
                        Number(row.status_code) >= 400 ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      {String(row.status_code)}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300 text-right">
                      {String(row.duration_ms)} ms
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 max-w-xs truncate">
                      {row.error_code
                        ? `${String(row.error_code)}: ${String(row.error_message || "")}`
                        : "—"}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 text-right whitespace-nowrap">
                      {new Date(String(row.created_at)).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
