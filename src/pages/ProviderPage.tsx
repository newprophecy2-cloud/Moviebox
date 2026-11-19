import { useCallback, useEffect, useState } from "react";
import { Activity, Eraser, Power, RefreshCw, ShieldCheck } from "lucide-react";
import { StatusIndicator } from "../components/StatusIndicator";
import { adminApi, ApiClientError } from "../services/apiClient";
import { ProviderDetailsData } from "../types/admin";

export function ProviderPage() {
  const [data, setData] = useState<ProviderDetailsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getProvider();
      setData(res);
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof ApiClientError ? err.message : "Failed to load provider details.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (key: string, fn: () => Promise<string>) => {
    setBusyAction(key);
    setNotice(null);
    try {
      const message = await fn();
      setNotice({ tone: "success", text: message });
      await load();
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof ApiClientError ? err.message : "Provider action failed.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  if (loading && !data) {
    return <div className="h-64 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />;
  }

  if (!data) return null;

  const connTone =
    data.connection_status === "connected"
      ? "success"
      : data.connection_status === "mock_mode"
      ? "warning"
      : data.connection_status === "disabled"
      ? "muted"
      : data.connection_status === "error"
      ? "error"
      : "muted";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">{data.name}</h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage upstream connectivity, persisted enable/disable state, session diagnostics, and cache.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {data.enabled ? (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runAction("disable", async () => {
                  await adminApi.disableProvider();
                  return "MovieBox provider disabled. Public routes will now return 503 PROVIDER_DISABLED.";
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-200 bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Power className="w-3.5 h-3.5" />
              <span>{busyAction === "disable" ? "Disabling..." : "Disable Provider"}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runAction("enable", async () => {
                  await adminApi.enableProvider();
                  return "MovieBox provider enabled.";
                })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Power className="w-3.5 h-3.5" />
              <span>{busyAction === "enable" ? "Enabling..." : "Enable Provider"}</span>
            </button>
          )}

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              runAction("test", async () => {
                const probe = await adminApi.testProvider();
                return `Probe finished: ${probe.status} (${probe.latency_ms ?? 0}ms) — ${probe.message || ""}`;
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{busyAction === "test" ? "Probing..." : "Run Connection Test"}</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              runAction("clear", async () => {
                await adminApi.clearCache();
                return "Catalog and playback cache cleared.";
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>{busyAction === "clear" ? "Clearing..." : "Clear Cache"}</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              runAction("refresh", async () => {
                const probe = await adminApi.refreshHealth();
                return `Health refreshed: ${probe.status}`;
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Health</span>
          </button>
        </div>
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

      {/* Status & Diagnostics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="font-display text-base font-semibold text-white">Runtime & Session Status</h2>
          <dl className="space-y-3 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Provider State</dt>
              <dd>
                <StatusIndicator
                  tone={data.enabled ? "success" : "muted"}
                  label={data.enabled ? "Enabled" : "Disabled"}
                />
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Connection Status</dt>
              <dd>
                <StatusIndicator tone={connTone} label={data.connection_status} />
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Active Upstream Host</dt>
              <dd className="font-mono text-slate-200">{data.host_configuration.active_host || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Visitor / Auth Session</dt>
              <dd className="text-slate-200">
                {data.session.sessionValid
                  ? "Active & valid"
                  : data.session.hasSession
                  ? "Expired"
                  : "Not initialized"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Session Expiration</dt>
              <dd className="font-mono tabular-nums text-slate-300">
                {data.session.expiresAt ? new Date(data.session.expiresAt).toLocaleString() : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Last Successful Check</dt>
              <dd className="font-mono tabular-nums text-slate-300">
                {data.last_successful_check
                  ? new Date(data.last_successful_check).toLocaleString()
                  : "None"}
              </dd>
            </div>
            {data.last_error && (
              <div className="pt-3 border-t border-slate-800">
                <dt className="text-rose-400 font-medium">Last Error ({data.last_error.code})</dt>
                <dd className="mt-1 text-slate-300">{data.last_error.message}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="font-display text-base font-semibold text-white">Auth & Protocol Diagnostics</h2>
          <dl className="space-y-3 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Auth Mode</dt>
              <dd className="font-mono text-slate-200">{data.auth_diagnostics.authMode}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Request Signing Secret</dt>
              <dd className="text-slate-200">
                {data.auth_diagnostics.signingSecretValid
                  ? `Valid (${data.auth_diagnostics.signingSecretFormat})`
                  : "Missing / Invalid"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Static Auth Token</dt>
              <dd className="text-slate-200">
                {data.auth_diagnostics.authTokenConfigured ? "Configured (server-side)" : "Visitor login mode"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Client Build Tag</dt>
              <dd className="text-slate-200">
                {data.auth_diagnostics.buildTagConfigured ? "Configured" : "Not configured"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Upstream Transport</dt>
              <dd className="text-slate-200">
                {data.host_configuration.https_only ? "HTTPS-only enforced" : "Mixed"}
              </dd>
            </div>
            <div className="pt-3 border-t border-slate-800">
              <dt className="text-slate-400 mb-1.5">Configured API Hosts ({data.host_configuration.hosts.length})</dt>
              <dd className="font-mono text-[11px] text-slate-300 space-y-1">
                {data.host_configuration.hosts.map((h) => (
                  <div key={h} className="truncate">{h}</div>
                ))}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Capabilities */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
        <h2 className="font-display text-base font-semibold text-white mb-4">Supported Capabilities</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.capabilities.map((cap) => (
            <div
              key={cap.id}
              className="flex items-center gap-2.5 py-2 px-3 bg-[#0B0F17] border border-slate-800/80 rounded-lg text-xs"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-slate-200">{cap.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Health Probe History */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="font-display text-base font-semibold text-white">Health Check History</h2>
        </div>
        {data.health_history.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-400">
            No health checks recorded yet. Click "Run Connection Test" above to execute a probe.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F1522] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Active Host</th>
                  <th className="py-2.5 px-4 font-medium text-right">Latency</th>
                  <th className="py-2.5 px-4 font-medium">Error Code</th>
                  <th className="py-2.5 px-4 font-medium">Message</th>
                  <th className="py-2.5 px-4 font-medium text-right">Checked At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {data.health_history.map((h, i) => (
                  <tr key={h.id ?? i} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4">
                      <StatusIndicator
                        tone={
                          h.status === "connected"
                            ? "success"
                            : h.status === "mock_mode"
                            ? "warning"
                            : h.status === "disabled"
                            ? "muted"
                            : "error"
                        }
                        label={h.status}
                      />
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-300">{h.active_host || "—"}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300 text-right">
                      {h.latency_ms !== null ? `${h.latency_ms} ms` : "—"}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-amber-300">{h.error_code || "—"}</td>
                    <td className="py-2.5 px-4 text-slate-300 max-w-md truncate">{h.message || "—"}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 text-right whitespace-nowrap">
                      {new Date(h.checked_at).toLocaleString()}
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
