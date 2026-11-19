import { useEffect, useState } from "react";
import { DashboardLayout, NavSection } from "./layouts/DashboardLayout";
import { ApiTesterPage } from "./pages/ApiTesterPage";
import { ConfigPage } from "./pages/ConfigPage";
import { EpisodesPage } from "./pages/EpisodesPage";
import { InspectorPage } from "./pages/InspectorPage";
import { LoginPage } from "./pages/LoginPage";
import { LogsPage } from "./pages/LogsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PlaybackPage } from "./pages/PlaybackPage";
import { ProviderPage } from "./pages/ProviderPage";
import { SystemPage } from "./pages/SystemPage";
import { adminApi } from "./services/apiClient";
import { AdminUserSession } from "./types/admin";

export default function App() {
  const [user, setUser] = useState<AdminUserSession | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [section, setSection] = useState<NavSection>("overview");

  useEffect(() => {
    let active = true;
    adminApi
      .me()
      .then((res) => {
        if (active) setUser(res.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setCheckingAuth(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch {
      // ignore logout network error
    }
    setUser(null);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex items-center justify-center text-xs text-slate-400">
        Verifying administrator session...
      </div>
    );
  }

  if (!user) {
    return <LoginPage onSuccess={(sessionUser) => setUser(sessionUser)} />;
  }

  return (
    <DashboardLayout
      activeSection={section}
      onSelectSection={setSection}
      user={user}
      onLogout={handleLogout}
    >
      {section === "overview" && <OverviewPage />}
      {section === "provider" && <ProviderPage />}
      {section === "config" && <ConfigPage />}
      {section === "inspector" && <InspectorPage />}
      {section === "episodes" && <EpisodesPage />}
      {section === "playback" && <PlaybackPage />}
      {section === "tester" && <ApiTesterPage />}
      {section === "logs" && <LogsPage />}
      {section === "system" && <SystemPage currentUser={user} />}
    </DashboardLayout>
  );
}
