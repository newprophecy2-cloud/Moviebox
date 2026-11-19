import { FormEvent, useCallback, useEffect, useState } from "react";
import { Lock, RefreshCw, Save } from "lucide-react";
import { StatusIndicator } from "../components/StatusIndicator";
import { adminApi, ApiClientError } from "../services/apiClient";
import { ProviderConfigData, StreamDeliveryMode } from "../types/admin";

export function ConfigPage() {
  const [data, setData] = useState<ProviderConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [apiHostsText, setApiHostsText] = useState("");
  const [mediaHostsText, setMediaHostsText] = useState("");
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(12000);
  const [cacheTtlMs, setCacheTtlMs] = useState(300000);
  const [proxyTtlSec, setProxyTtlSec] = useState(900);
  const [proxyTimeoutMs, setProxyTimeoutMs] = useState(30000);
  const [mockMode, setMockMode] = useState(false);
  const [defaultDelivery, setDefaultDelivery] = useState<StreamDeliveryMode>("proxy");
  const [proxyDeliveryEnabled, setProxyDeliveryEnabled] = useState(true);
  const [directDeliveryEnabled, setDirectDeliveryEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getConfig();
      setData(res);
      setApiHostsText(res.config.api_hosts.join("\n"));
      setMediaHostsText(res.config.media_hosts.join(", "));
      setRequestTimeoutMs(res.config.request_timeout_ms);
      setCacheTtlMs(res.config.cache_ttl_ms);
      setProxyTtlSec(res.config.stream_proxy_ttl_seconds);
      setProxyTimeoutMs(res.config.stream_proxy_timeout_ms);
      setMockMode(res.config.mock_mode);
      setDefaultDelivery(res.config.default_stream_delivery);
      setProxyDeliveryEnabled(res.config.proxy_delivery_enabled);
      setDirectDeliveryEnabled(res.config.direct_delivery_enabled);
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof ApiClientError ? err.message : "Failed to load configuration.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const apiHosts = apiHostsText
        .split(/[\n,]+/)
        .map((s) => s.trim().replace(/\/+$/, ""))
        .filter(Boolean);
      const mediaHosts = mediaHostsText
        .split(/[\n,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const updated = await adminApi.updateConfig({
        api_hosts: apiHosts,
        media_hosts: mediaHosts,
        request_timeout_ms: Number(requestTimeoutMs),
        cache_ttl_ms: Number(cacheTtlMs),
        stream_proxy_ttl_seconds: Number(proxyTtlSec),
        stream_proxy_timeout_ms: Number(proxyTimeoutMs),
        mock_mode: data?.production_lock ? false : mockMode,
        default_stream_delivery: defaultDelivery,
        proxy_delivery_enabled: proxyDeliveryEnabled,
        direct_delivery_enabled: directDeliveryEnabled,
      });
      setData(updated);
      setNotice({ tone: "success", text: "Provider and stream delivery configuration updated." });
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof ApiClientError ? err.message : "Failed to save configuration.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return <div className="h-64 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />;
  }

  const telemetry = data?.stream_delivery_telemetry;
  const directAvailabilityTone =
    telemetry?.direct_url_availability === "available"
      ? "success"
      : telemetry?.direct_url_availability === "unavailable"
      ? "warning"
      : "muted";

  const directAvailabilityLabel =
    telemetry?.direct_url_availability === "available"
      ? "Available (Observed)"
      : telemetry?.direct_url_availability === "unavailable"
      ? "Unavailable (Cookie / Header Required)"
      : "Unverified";

  const resolverTone =
    telemetry?.last_resolver_status === "resolved"
      ? "success"
      : telemetry?.last_resolver_status === "error"
      ? "error"
      : "muted";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            Provider & Stream Delivery Configuration
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage upstream API hosts, stream delivery modes, proxy token lifetimes, and observed resolver status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#111827] hover:bg-slate-800 border border-slate-700 rounded-lg whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {notice && (
        <div
          className={`px-4 py-3 text-xs rounded-lg border ${
            notice.tone === "success"
              ? "bg-emerald-950/40 border-emerald-800/70 text-emerald-200"
              : "bg-rose-950/40 border-rose-800/70 text-rose-200"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form
          onSubmit={handleSave}
          className="lg:col-span-2 bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-6"
        >
          {/* Stream Delivery Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="font-display text-base font-semibold text-white">Stream Delivery</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure how <span className="font-mono text-slate-300">/api/v1/stream/:id</span> serves playback URLs when delivery is omitted or requested.
                </p>
              </div>
              {data?.public_base_url && (
                <span className="text-[11px] font-mono text-slate-400 truncate max-w-[220px]">
                  Base: {data.public_base_url}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="default-delivery"
                  className="block text-xs font-medium text-slate-300 mb-1.5"
                >
                  Default Delivery Mode
                </label>
                <select
                  id="default-delivery"
                  value={defaultDelivery}
                  onChange={(e) => setDefaultDelivery(e.target.value as StreamDeliveryMode)}
                  className="w-full px-3.5 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="proxy">Proxy (Signed Backend Stream)</option>
                  <option value="direct">Direct (Authorized Provider URL Only)</option>
                </select>
              </div>

              <div>
                <label htmlFor="proxy-ttl" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Proxy Token Expiration (seconds)
                </label>
                <input
                  id="proxy-ttl"
                  type="number"
                  min={60}
                  max={86400}
                  value={proxyTtlSec}
                  onChange={(e) => setProxyTtlSec(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between gap-3 p-3.5 bg-[#0B0F17] border border-slate-800 rounded-lg">
                <div>
                  <div className="text-xs font-medium text-slate-200">Enable Proxy Delivery</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Issues short-lived HMAC signed proxy URLs.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setProxyDeliveryEnabled((v) => !v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    proxyDeliveryEnabled
                      ? "bg-emerald-950/60 border-emerald-700 text-emerald-200"
                      : "bg-[#111827] border-slate-700 text-slate-400"
                  }`}
                >
                  {proxyDeliveryEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 p-3.5 bg-[#0B0F17] border border-slate-800 rounded-lg">
                <div>
                  <div className="text-xs font-medium text-slate-200">
                    Enable Authorized Direct Delivery
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Returns upstream HTTPS URLs only when headerless.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDirectDeliveryEnabled((v) => !v)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    directDeliveryEnabled
                      ? "bg-emerald-950/60 border-emerald-700 text-emerald-200"
                      : "bg-[#111827] border-slate-700 text-slate-400"
                  }`}
                >
                  {directDeliveryEnabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          </div>

          {/* Upstream & Proxy Allowlist */}
          <div className="space-y-4 pt-2 border-t border-slate-800">
            <h2 className="font-display text-base font-semibold text-white">
              Upstream Hosts & Timeouts
            </h2>

            <div>
              <label htmlFor="api-hosts" className="block text-xs font-medium text-slate-300 mb-1.5">
                MovieBox API Hosts (HTTPS only, one per line)
              </label>
              <textarea
                id="api-hosts"
                rows={4}
                value={apiHostsText}
                onChange={(e) => setApiHostsText(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-mono bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="media-hosts" className="block text-xs font-medium text-slate-300 mb-1.5">
                Stream Proxy Allowed CDN Hosts (comma-separated domain suffixes)
              </label>
              <input
                id="media-hosts"
                type="text"
                value={mediaHostsText}
                onChange={(e) => setMediaHostsText(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-mono bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="req-timeout" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Upstream Timeout (ms)
                </label>
                <input
                  id="req-timeout"
                  type="number"
                  min={1000}
                  max={60000}
                  value={requestTimeoutMs}
                  onChange={(e) => setRequestTimeoutMs(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="cache-ttl" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Catalog Cache TTL (ms)
                </label>
                <input
                  id="cache-ttl"
                  type="number"
                  min={0}
                  max={3600000}
                  value={cacheTtlMs}
                  onChange={(e) => setCacheTtlMs(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="proxy-timeout" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Proxy Stream Timeout (ms)
                </label>
                <input
                  id="proxy-timeout"
                  type="number"
                  min={1000}
                  max={120000}
                  value={proxyTimeoutMs}
                  onChange={(e) => setProxyTimeoutMs(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-slate-200">
                Mock Provider Mode (Development / Test Fixtures Only)
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {data?.production_lock
                  ? "Locked off in production environment."
                  : "Serves deterministic mock fixtures instead of live upstream hosts."}
              </div>
            </div>
            <button
              type="button"
              disabled={Boolean(data?.production_lock)}
              onClick={() => setMockMode((v) => !v)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                mockMode
                  ? "bg-amber-950/60 border-amber-700 text-amber-200"
                  : "bg-[#0B0F17] border-slate-700 text-slate-300"
              } disabled:opacity-40`}
            >
              {mockMode ? "Mock Mode: ON" : "Mock Mode: OFF"}
            </button>
          </div>

          <div className="pt-2 flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500">
              Last updated by {data?.config.updated_by || "system"} ·{" "}
              {data?.config.updated_at ? new Date(data.config.updated_at).toLocaleString() : "—"}
            </span>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Saving..." : "Save Configuration"}</span>
            </button>
          </div>
        </form>

        {/* Right Column: Observed Direct Capability + Resolver Status + Secrets */}
        <div className="space-y-6">
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-base font-semibold text-white">
              Observed Stream Resolver Status
            </h2>

            <dl className="space-y-3.5 text-xs divide-y divide-slate-800/70">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-400">Provider Direct URL Availability</dt>
                <dd>
                  <StatusIndicator tone={directAvailabilityTone} label={directAvailabilityLabel} />
                </dd>
              </div>
              <div className="pt-3 text-[11px] text-slate-400 leading-relaxed">
                {telemetry?.direct_url_reason || "No stream resolution observed yet."}
              </div>

              <div className="pt-3 flex items-center justify-between gap-2">
                <dt className="text-slate-400">Last Resolver Status</dt>
                <dd>
                  <StatusIndicator
                    tone={resolverTone}
                    label={
                      telemetry?.last_resolver_status === "resolved"
                        ? `Resolved (${telemetry.last_delivery_mode || "proxy"})`
                        : telemetry?.last_resolver_status === "error"
                        ? `Error (${telemetry.last_error_code || "ERR"})`
                        : "Idle"
                    }
                  />
                </dd>
              </div>

              <div className="pt-3 flex items-center justify-between gap-2">
                <dt className="text-slate-400">Last Resolved Media</dt>
                <dd className="font-mono text-slate-200 truncate max-w-[160px]">
                  {telemetry?.last_media_id || "—"}
                </dd>
              </div>

              <div className="pt-3 flex items-center justify-between gap-2">
                <dt className="text-slate-400">Resolutions (Proxy / Direct)</dt>
                <dd className="font-mono tabular-nums text-slate-200">
                  {telemetry?.total_resolutions ?? 0} ({telemetry?.proxy_resolutions ?? 0} /{" "}
                  {telemetry?.direct_resolutions ?? 0})
                </dd>
              </div>

              {telemetry?.last_error_message && telemetry.last_resolver_status === "error" && (
                <div className="pt-3">
                  <dt className="text-rose-400 font-medium">Last Resolver Error</dt>
                  <dd className="mt-1 text-slate-300 break-words">{telemetry.last_error_message}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Server-Side Secrets Status (Read-Only Masked) */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" />
              <h2 className="font-display text-base font-semibold text-white">Server-Side Secrets</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Signing secrets, upstream cookies, and provider tokens remain strictly server-side and are redacted from logs.
            </p>

            {data && (
              <dl className="space-y-3 pt-2 text-xs divide-y divide-slate-800/70">
                {Object.entries(data.secrets).map(([key, info]) => (
                  <div key={key} className="pt-3 first:pt-0 flex items-center justify-between gap-2">
                    <div>
                      <dt className="font-mono text-slate-300">{key.toUpperCase()}</dt>
                      <dd className="text-slate-500 mt-0.5">Source: {info.source}</dd>
                    </div>
                    <span className="font-mono text-slate-300">
                      {info.configured ? info.preview : "Unset"}
                    </span>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>

      {/* Stream Resolution Error Logs */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Stream Resolution Error Logs
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Recent failures on <span className="font-mono text-slate-300">/api/v1/stream/:id</span> (signed URLs, cookies, and tokens are automatically redacted).
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {data?.stream_error_logs?.length ?? 0} entries
          </span>
        </div>

        {!data?.stream_error_logs || data.stream_error_logs.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-400">
            No stream resolution errors recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F1522] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Request ID</th>
                  <th className="py-2.5 px-4 font-medium">Request</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Error Code</th>
                  <th className="py-2.5 px-4 font-medium">Message</th>
                  <th className="py-2.5 px-4 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {data.stream_error_logs.map((row, idx) => (
                  <tr key={String(row.id ?? idx)} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                      {String(row.request_id || "—")}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                      {String(row.path || "")}
                      {row.query_summary ? `?${String(row.query_summary)}` : ""}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-rose-400">
                      {String(row.status_code ?? "—")}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-amber-300 whitespace-nowrap">
                      {String(row.error_code || "ERROR")}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 max-w-md truncate">
                      {String(row.error_message || "—")}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 text-right whitespace-nowrap">
                      {row.created_at ? new Date(String(row.created_at)).toLocaleString() : "—"}
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
