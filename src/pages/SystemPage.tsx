import { FormEvent, useCallback, useEffect, useState } from "react";
import { Eraser, KeyRound, UserPlus } from "lucide-react";
import { adminApi, ApiClientError } from "../services/apiClient";
import { AdminUserSession } from "../types/admin";

interface SystemInfoPayload {
  server: {
    node_version: string;
    platform: string;
    arch: string;
    uptime_seconds: number;
    memory_rss_mb: number;
    environment: string;
    port: number;
  };
  api: {
    version: string;
    public_routes: string[];
    rate_limit_window_ms: number;
    rate_limit_max_requests: number;
    cors_origins: string[];
  };
  database: {
    engine: string;
    path: string;
    connected: boolean;
    migrationsApplied: string[];
  };
  cache: {
    entries: number;
    maxEntries: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
}

interface SystemPageProps {
  currentUser: AdminUserSession;
}

export function SystemPage({ currentUser }: SystemPageProps) {
  const [system, setSystem] = useState<SystemInfoPayload | null>(null);
  const [users, setUsers] = useState<
    Array<{
      id: string;
      username: string;
      role: string;
      active: boolean;
      created_at: string;
      last_login_at: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("operator");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sysRes = (await adminApi.getSystem()) as unknown as SystemInfoPayload;
      setSystem(sysRes);
      if (currentUser.role === "super_admin" || currentUser.role === "admin") {
        const usersRes = await adminApi.listUsers();
        setUsers(usersRes.users);
      }
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof ApiClientError ? err.message : "Failed to load system settings.",
      });
    } finally {
      setLoading(false);
    }
  }, [currentUser.role]);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    try {
      await adminApi.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setNotice({ tone: "success", text: "Administrator password updated." });
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof ApiClientError ? err.message : "Password update failed.",
      });
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    try {
      await adminApi.createUser(newUsername, newUserPassword, newUserRole);
      setNewUsername("");
      setNewUserPassword("");
      setNotice({ tone: "success", text: "Admin account created." });
      await load();
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof ApiClientError ? err.message : "Failed to create account.",
      });
    }
  };

  const handleClearCache = async () => {
    setNotice(null);
    try {
      await adminApi.clearCache();
      setNotice({ tone: "success", text: "In-memory cache cleared." });
      await load();
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof ApiClientError ? err.message : "Failed to clear cache.",
      });
    }
  };

  if (loading && !system) {
    return <div className="h-64 bg-[#111827] border border-slate-800 rounded-xl animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">System Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Server runtime environment, SQLite database migrations, cache controls, and admin access management.
        </p>
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

      {system && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
            <h2 className="font-display text-base font-semibold text-white mb-4">Server Runtime</h2>
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-400">Node Version</dt>
                <dd className="font-mono text-slate-200">{system.server.node_version}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Platform / Arch</dt>
                <dd className="font-mono text-slate-200">
                  {system.server.platform} / {system.server.arch}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Environment</dt>
                <dd className="font-mono text-slate-200">{system.server.environment}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Memory RSS</dt>
                <dd className="font-mono tabular-nums text-slate-200">{system.server.memory_rss_mb} MB</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Rate Limit</dt>
                <dd className="font-mono tabular-nums text-slate-200">
                  {system.api.rate_limit_max_requests} req / {Math.round(system.api.rate_limit_window_ms / 1000)}s
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5">
            <h2 className="font-display text-base font-semibold text-white mb-4">Database & Migrations</h2>
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-400">Engine</dt>
                <dd className="font-mono text-slate-200 uppercase">{system.database.engine}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Path</dt>
                <dd className="font-mono text-slate-200 truncate">{system.database.path}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Connection</dt>
                <dd className="text-emerald-400 font-medium">
                  {system.database.connected ? "Connected" : "Disconnected"}
                </dd>
              </div>
              <div className="pt-2 border-t border-slate-800">
                <dt className="text-slate-400 mb-1">Applied Migrations</dt>
                <dd className="font-mono text-slate-300 space-y-0.5">
                  {system.database.migrationsApplied.map((m) => (
                    <div key={m}>{m}</div>
                  ))}
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-white mb-4">Cache & Routes</h2>
              <dl className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-400">Cached Entries</dt>
                  <dd className="font-mono tabular-nums text-slate-200">
                    {system.cache.entries} / {system.cache.maxEntries}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Hit Rate</dt>
                  <dd className="font-mono tabular-nums text-slate-200">{system.cache.hitRate}%</dd>
                </div>
                <div className="pt-2 border-t border-slate-800">
                  <dt className="text-slate-400 mb-1">Active Public Routes</dt>
                  <dd className="font-mono text-[11px] text-slate-300 space-y-0.5">
                    {system.api.public_routes.map((r) => (
                      <div key={r}>{r}</div>
                    ))}
                  </dd>
                </div>
              </dl>
            </div>
            <button
              type="button"
              onClick={handleClearCache}
              className="mt-4 inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Purge Cache</span>
            </button>
          </div>
        </div>
      )}

      {/* Password & Admin Account Management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form
          onSubmit={handlePasswordChange}
          className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-slate-400" />
            <h2 className="font-display text-base font-semibold text-white">Change Your Password</h2>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              New Password (min 8 chars)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg"
          >
            Update Password
          </button>
        </form>

        {(currentUser.role === "super_admin" || currentUser.role === "admin") && (
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold text-white">Admin Accounts (RBAC)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 font-medium">Username</th>
                    <th className="py-2 font-medium">Role</th>
                    <th className="py-2 font-medium text-right">Last Login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-2 text-slate-200 font-medium">{u.username}</td>
                      <td className="py-2 font-mono text-slate-400">{u.role}</td>
                      <td className="py-2 font-mono tabular-nums text-slate-500 text-right">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {currentUser.role === "super_admin" && (
              <form onSubmit={handleCreateUser} className="pt-4 border-t border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Provision Additional Operator</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    required
                    placeholder="username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="px-3 py-2 text-xs bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
                  />
                  <input
                    type="password"
                    required
                    minLength={8}
                    placeholder="password (8+ chars)"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="px-3 py-2 text-xs bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
                  />
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="px-3 py-2 text-xs bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100"
                  >
                    <option value="operator">operator</option>
                    <option value="admin">admin</option>
                    <option value="viewer">viewer</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg"
                >
                  Create Account
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
