import { FormEvent, useState } from "react";
import { Lock } from "lucide-react";
import { adminApi, ApiClientError } from "../services/apiClient";
import { AdminUserSession } from "../types/admin";

interface LoginPageProps {
  onSuccess: (user: AdminUserSession) => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await adminApi.login(username, password);
      onSuccess(res.user);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Unable to reach authentication server.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-[#111827] border border-slate-800 rounded-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-white">
              ProphecyVerse Provider Admin
            </h1>
            <p className="text-xs text-slate-400">
              Server-side authenticated management console
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-username" className="block text-xs font-medium text-slate-300 mb-1.5">
              Username
            </label>
            <input
              id="admin-username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-xs font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter administrator password"
              className="w-full px-3.5 py-2.5 text-sm bg-[#0B0F17] border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="px-3.5 py-2.5 text-xs text-rose-300 bg-rose-950/50 border border-rose-800/70 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors"
          >
            {submitting ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        <p className="mt-5 text-xs text-slate-500 leading-relaxed">
          Credentials are verified server-side against SQLite using scrypt hashes and HttpOnly session cookies. Configure <span className="font-mono text-slate-400">ADMIN_USERNAME</span> and <span className="font-mono text-slate-400">ADMIN_PASSWORD</span> via environment variables.
        </p>
      </div>
    </div>
  );
}
