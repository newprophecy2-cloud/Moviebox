import { FormEvent, useState } from "react";
import { Play, ShieldCheck } from "lucide-react";
import { JsonViewer } from "../components/JsonViewer";
import { StatusIndicator } from "../components/StatusIndicator";
import { adminApi, publicApi } from "../services/apiClient";
import { ApiErrorPayload, TimedApiResponse, UnifiedStreamData } from "../types/admin";

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

export function PlaybackPage() {
  const [mode, setMode] = useState<"movie" | "episode">("movie");
  const [deliveryMode, setDeliveryMode] = useState<"default" | "proxy" | "direct">("default");
  const [subjectId, setSubjectId] = useState("");
  const [season, setSeason] = useState("1");
  const [episode, setEpisode] = useState("1");
  const [forceRefresh, setForceRefresh] = useState(false);

  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<TimedApiResponse<{
    status: "success";
    data: UnifiedStreamData;
  }> | null>(null);

  const [proxyCheck, setProxyCheck] = useState<{
    token_valid: boolean;
    expired: boolean;
    error_code?: string | null;
    expires_at: string | null;
    kind: string | null;
  } | null>(null);

  const targetStreamId =
    mode === "movie"
      ? subjectId.trim()
      : `${subjectId.trim()}_s${season.trim()}_e${episode.trim()}`;

  const handleResolve = async (e: FormEvent) => {
    e.preventDefault();
    if (!subjectId.trim()) return;
    setLoading(true);
    setProxyCheck(null);
    try {
      const deliveryParam = deliveryMode === "default" ? undefined : deliveryMode;
      const res = await publicApi.stream(targetStreamId, forceRefresh, deliveryParam);
      setResponse(res as TimedApiResponse<{ status: "success"; data: UnifiedStreamData }>);

      if (
        res.ok &&
        "data" in res.body &&
        res.body.data.delivery_mode === "proxy" &&
        res.body.data.stream?.stream_url
      ) {
        try {
          const check = await adminApi.verifyProxyUrl(res.body.data.stream.stream_url);
          setProxyCheck(check);
        } catch {
          setProxyCheck(null);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const streamData =
    response && response.ok && "data" in response.body ? response.body.data : null;
  const errorData =
    response && !response.ok ? (response.body as ApiErrorPayload) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Playback Manager</h1>
        <p className="mt-1 text-sm text-slate-400">
          Test unified playback resolution (<span className="font-mono text-slate-300">/api/v1/stream/:id</span>) for movies and episodes, inspect codecs, audio tracks, subtitles, and proxy token validity.
        </p>
      </div>

      <form
        onSubmit={handleResolve}
        className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex p-1 bg-[#0B0F17] border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setMode("movie")}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === "movie" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Movie Playback
            </button>
            <button
              type="button"
              onClick={() => setMode("episode")}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                mode === "episode" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Episode Playback
            </button>
          </div>

          <div className="text-xs font-mono text-slate-400 truncate">
            Target Route:{" "}
            <span className="text-slate-200">
              /api/v1/stream/{targetStreamId || "{id}"}
              {deliveryMode !== "default" ? `?delivery=${deliveryMode}` : ""}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div className={mode === "movie" ? "sm:col-span-3" : "sm:col-span-2"}>
            <label htmlFor="pb-id" className="block text-xs font-medium text-slate-300 mb-1.5">
              {mode === "movie" ? "Movie Subject ID" : "Series Subject ID"}
            </label>
            <input
              id="pb-id"
              type="text"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder={mode === "movie" ? "e.g. mock-movie-202" : "e.g. mock-series-101"}
              className="w-full px-3.5 py-2 text-sm font-mono bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {mode === "episode" && (
            <>
              <div>
                <label htmlFor="pb-season" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Season
                </label>
                <input
                  id="pb-season"
                  type="number"
                  min={1}
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label htmlFor="pb-episode" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Episode
                </label>
                <input
                  id="pb-episode"
                  type="number"
                  min={1}
                  value={episode}
                  onChange={(e) => setEpisode(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}

          {mode === "movie" && (
            <div className="flex items-center justify-end gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceRefresh}
                  onChange={(e) => setForceRefresh(e.target.checked)}
                  className="rounded border-slate-700 bg-[#0B0F17]"
                />
                <span>Bypass cache</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="pb-delivery" className="text-xs text-slate-400">
                Delivery:
              </label>
              <select
                id="pb-delivery"
                value={deliveryMode}
                onChange={(e) => setDeliveryMode(e.target.value as "default" | "proxy" | "direct")}
                className="px-2.5 py-1 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100"
              >
                <option value="default">Server Default</option>
                <option value="proxy">proxy</option>
                <option value="direct">direct</option>
              </select>
            </div>
            {mode === "episode" && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceRefresh}
                  onChange={(e) => setForceRefresh(e.target.checked)}
                  className="rounded border-slate-700 bg-[#0B0F17]"
                />
                <span>Bypass playback cache (?refresh=1)</span>
              </label>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !subjectId.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{loading ? "Resolving..." : "Resolve Playback"}</span>
          </button>
        </div>
      </form>

      {errorData && (
        <div className="bg-rose-950/40 border border-rose-800/70 rounded-xl p-4 text-xs text-rose-200 space-y-1">
          <div className="font-mono font-semibold">
            HTTP {response?.status} · {errorData.code} · {response?.durationMs} ms
          </div>
          <div>{errorData.message}</div>
          {errorData.request_id && (
            <div className="font-mono text-rose-300/80">Request ID: {errorData.request_id}</div>
          )}
        </div>
      )}

      {streamData && (
        <div className="space-y-6">
          {/* Proxy Verification & Primary Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
              <div className="text-xs text-slate-400">Primary Stream</div>
              <div className="mt-1.5 text-lg font-bold font-mono text-white">
                {streamData.stream.quality} · {streamData.stream.format.toUpperCase()}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                Codec: {streamData.stream.codec || "unspecified"} · Language: {streamData.stream.language || "unspecified"}
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
              <div className="text-xs text-slate-400">Delivery Mode & Token</div>
              <div className="mt-2">
                {streamData.delivery_mode === "direct" ? (
                  <StatusIndicator tone="success" label="Direct Authorized HTTPS" />
                ) : proxyCheck ? (
                  <StatusIndicator
                    tone={proxyCheck.token_valid ? "success" : "error"}
                    label={
                      proxyCheck.token_valid
                        ? `Proxy Valid (${proxyCheck.kind})`
                        : proxyCheck.error_code || "Invalid or Expired Token"
                    }
                  />
                ) : (
                  <StatusIndicator tone="muted" label={`Delivery: ${streamData.delivery_mode}`} />
                )}
              </div>
              <div className="mt-2 text-xs font-mono tabular-nums text-slate-400">
                Expires:{" "}
                {streamData.stream.expires_at
                  ? new Date(streamData.stream.expires_at).toLocaleString()
                  : "Provider-managed"}
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
              <div className="text-xs text-slate-400">Tracks Returned</div>
              <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-white">
                {streamData.streams.length} variants
              </div>
              <div className="mt-2 text-xs text-slate-400 font-mono tabular-nums">
                {streamData.stream.audio_tracks.length} audio · {streamData.stream.subtitles.length} subtitles
              </div>
            </div>
          </div>

          {/* Variants Table */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-white">Verified Playable Variants</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  Delivery: {streamData.delivery_mode === "direct" ? "Authorized Direct" : "Signed Proxy"}
                </span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0F1522] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Quality</th>
                    <th className="py-2.5 px-4 font-medium">Resource ID</th>
                    <th className="py-2.5 px-4 font-medium">Format</th>
                    <th className="py-2.5 px-4 font-medium">Codec</th>
                    <th className="py-2.5 px-4 font-medium">Language</th>
                    <th className="py-2.5 px-4 font-medium text-right">Size</th>
                    <th className="py-2.5 px-4 font-medium">Redacted Stream Path</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {streamData.streams.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-mono text-slate-100">{v.quality}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-400">
                        {v.provider_resource_id || v.resource_id || "—"}
                      </td>
                      <td className="py-2.5 px-4 font-mono uppercase text-slate-300">{v.format}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-300">{v.codec || "null"}</td>
                      <td className="py-2.5 px-4 text-slate-300">{v.language || "null"}</td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300 text-right">
                        {formatBytes(v.size_bytes)}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-400 max-w-xs truncate">
                        {v.stream_url.split("?")[0]}
                        {v.stream_url.includes("?") ? "?[REDACTED]" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audio Tracks & Subtitles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
              <h2 className="font-display text-sm font-semibold text-white mb-3">
                Audio Tracks ({streamData.stream.audio_tracks.length})
              </h2>
              {streamData.stream.audio_tracks.length === 0 ? (
                <div className="text-xs text-slate-500">No separate audio tracks returned by provider.</div>
              ) : (
                <ul className="divide-y divide-slate-800/70 text-xs">
                  {streamData.stream.audio_tracks.map((a, idx) => (
                    <li key={`${a.subject_id}-${idx}`} className="py-2 flex justify-between gap-2">
                      <span className="text-slate-200">{a.label}</span>
                      <span className="font-mono text-slate-400">
                        {a.language} ({a.language_code || "—"}) · {a.subject_id}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
              <h2 className="font-display text-sm font-semibold text-white mb-3">
                Subtitles ({streamData.stream.subtitles.length})
              </h2>
              {streamData.stream.subtitles.length === 0 ? (
                <div className="text-xs text-slate-500">No external subtitles returned by provider.</div>
              ) : (
                <ul className="divide-y divide-slate-800/70 text-xs">
                  {streamData.stream.subtitles.map((s) => (
                    <li key={s.id} className="py-2 flex justify-between gap-2">
                      <span className="text-slate-200">{s.name}</span>
                      <span className="font-mono text-slate-400">
                        {s.language_code || "—"} · {s.format.toUpperCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <JsonViewer data={response?.body} title="Unified Stream JSON Response" />
        </div>
      )}
    </div>
  );
}
