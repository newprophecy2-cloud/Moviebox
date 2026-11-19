import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { StatusIndicator } from "../components/StatusIndicator";
import { adminApi, ApiClientError } from "../services/apiClient";
import { OverviewData } from "../types/admin";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "None recorded";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getOverview();
      setData(res);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load overview metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-800/60 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="h-28 bg-[#111827] border border-slate-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-[#111827] border border-rose-800/70 rounded-xl p-6">
        <p className="text-sm text-rose-300">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-4 px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const providerTone = !data.provider.enabled
    ? "muted"
    : data.provider.mock_mode
    ? "warning"
    : data.provider.configured
    ? "success"
    : "error";

  const providerLabel = !data.provider.enabled
    ? "Disabled"
    : data.provider.mock_mode
    ? "Mock Mode (Non-Prod)"
    : data.provider.configured
    ? "Active"
    : "Unconfigured";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">System & Provider Overview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Live runtime metrics aggregated from SQLite request logs, provider calls, and cache state.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-200 bg-[#111827] hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* Primary Status Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-400">Backend Runtime</div>
          <div className="mt-2 flex items-center justify-between">
            <StatusIndicator tone="success" label="Healthy" />
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {formatUptime(data.backend.uptime_seconds)}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500">
            Env: {data.backend.environment} · SQLite {data.backend.database.connected ? "Connected" : "Offline"}
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-400">MovieBox Provider</div>
          <div className="mt-2 flex items-center justify-between">
            <StatusIndicator tone={providerTone} label={providerLabel} />
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {data.provider.host_count} hosts
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 truncate">
            Auth: {data.provider.auth_mode} · {data.provider.active_host || "No active host"}
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-400">Public API Success Rate</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-white">
              {data.requests.success_rate}%
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              ({data.requests.error_rate}% errors)
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-mono tabular-nums">
            {data.requests.success_count} ok · {data.requests.error_count} failed · {data.requests.total_public_requests} total
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-400">Catalog & Playback Cache</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-white">
              {data.cache.entries}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              / {data.cache.maxEntries} entries
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 font-mono tabular-nums">
            Hit rate {data.cache.hitRate}% · {data.cache.hits} hits · {data.cache.misses} misses
          </div>
        </div>
      </div>

      {/* Four Primary Route Counters + Provider Timing */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#111827] border border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold text-white">
            Public API Route Volume
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Request counts recorded across the four primary endpoints.
          </p>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800">
            <div className="pt-2 sm:pt-0 sm:pr-4">
              <div className="text-xs text-slate-400">Search</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-white">
                {data.requests.search_count}
              </div>
              <div className="mt-1 text-xs font-mono text-slate-500">/v1/search</div>
            </div>
            <div className="pt-2 sm:pt-0 sm:px-4">
              <div className="text-xs text-slate-400">Details</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-white">
                {data.requests.details_count}
              </div>
              <div className="mt-1 text-xs font-mono text-slate-500">/v1/details/:id</div>
            </div>
            <div className="pt-2 sm:pt-0 sm:px-4">
              <div className="text-xs text-slate-400">Episodes</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-white">
                {data.requests.episodes_count}
              </div>
              <div className="mt-1 text-xs font-mono text-slate-500">/episodes</div>
            </div>
            <div className="pt-2 sm:pt-0 sm:pl-4">
              <div className="text-xs text-slate-400">Unified Stream</div>
              <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-white">
                {data.requests.stream_count}
              </div>
              <div className="mt-1 text-xs font-mono text-slate-500">/v1/stream/:id</div>
            </div>
          </div>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
          <h2 className="font-display text-base font-semibold text-white">
            Provider Telemetry
          </h2>
          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Configuration</dt>
              <dd className="text-slate-200 font-medium">
                {data.provider.configured ? "Valid credentials" : "Missing credentials"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Last Successful Upstream</dt>
              <dd className="text-slate-200 font-mono tabular-nums text-right">
                {formatTimestamp(data.provider.last_successful_request)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-400">Last Health Probe</dt>
              <dd className="text-slate-200 font-mono tabular-nums text-right">
                {data.provider.last_health_check
                  ? `${data.provider.last_health_check.status} (${data.provider.last_health_check.latency_ms ?? 0}ms)`
                  : "Not run"}
              </dd>
            </div>
            {data.provider.last_error && (
              <div className="pt-2 border-t border-slate-800">
                <dt className="text-rose-400 font-medium">Last Provider Error</dt>
                <dd className="mt-1 text-slate-300 break-words">
                  {data.provider.last_error.code}: {data.provider.last_error.message}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Recent Server Errors Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-white">Recent Server Errors</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Latest non-2xx API responses with redacted diagnostics.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {data.recent_errors.length} entries
          </span>
        </div>

        {data.recent_errors.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">
            No server or provider errors recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F1522] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Request ID</th>
                  <th className="py-2.5 px-4 font-medium">Route</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Error Code</th>
                  <th className="py-2.5 px-4 font-medium">Message</th>
                  <th className="py-2.5 px-4 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {data.recent_errors.map((err) => (
                  <tr key={err.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                      {err.request_id}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {err.path}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-rose-400">
                      {err.status_code}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-amber-300 whitespace-nowrap">
                      {err.error_code || "ERROR"}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 max-w-md truncate">
                      {err.error_message || "—"}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 text-right whitespace-nowrap">
                      {formatTimestamp(err.created_at)}
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
