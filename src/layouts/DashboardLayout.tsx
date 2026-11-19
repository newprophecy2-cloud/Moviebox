import { ReactNode, useState } from "react";
import {
  Activity,
  Film,
  FlaskConical,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  PlaySquare,
  ScrollText,
  ServerCog,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { AdminUserSession } from "../types/admin";

export type NavSection =
  | "overview"
  | "provider"
  | "config"
  | "inspector"
  | "episodes"
  | "playback"
  | "tester"
  | "logs"
  | "system";

const NAV_ITEMS: Array<{ id: NavSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Dashboard Overview", icon: LayoutDashboard },
  { id: "provider", label: "Provider Management", icon: Activity },
  { id: "config", label: "Provider Configuration", icon: SlidersHorizontal },
  { id: "inspector", label: "Media Details Inspector", icon: Film },
  { id: "episodes", label: "Episode Manager", icon: Layers },
  { id: "playback", label: "Playback Manager", icon: PlaySquare },
  { id: "tester", label: "API Route Tester", icon: FlaskConical },
  { id: "logs", label: "Logs & Diagnostics", icon: ScrollText },
  { id: "system", label: "System Settings", icon: ServerCog },
];

interface DashboardLayoutProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  user: AdminUserSession;
  onLogout: () => void;
  children: ReactNode;
}

export function DashboardLayout({
  activeSection,
  onSelectSection,
  user,
  onLogout,
  children,
}: DashboardLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentTitle = NAV_ITEMS.find((n) => n.id === activeSection)?.label || "Overview";

  const navContent = (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-slate-800/80">
        <div className="font-display text-base font-bold tracking-tight text-white">
          ProphecyVerse
        </div>
        <div className="mt-1 text-xs text-slate-400">
          MovieBox Provider Console
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary Navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeSection;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors text-left ${
                active
                  ? "bg-blue-600/15 text-blue-400 border border-blue-500/30"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-slate-800/80 text-xs text-slate-400">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-slate-200 truncate">{user.username}</div>
            <div className="text-slate-500 capitalize">{user.role.replace("_", " ")}</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 bg-[#0F1522] border-r border-slate-800/80">
        <div className="sticky top-0 h-screen">{navContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-68 max-w-[85vw] bg-[#0F1522] border-r border-slate-800 h-full">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 p-1.5 text-slate-400 hover:text-white rounded-md"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
            {navContent}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-14 px-4 sm:px-8 bg-[#0B0F17]/95 backdrop-blur border-b border-slate-800/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-300 hover:text-white rounded-md"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="text-slate-500 hidden sm:inline">ProphecyVerse</span>
              <span className="text-slate-600 hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-medium text-slate-100 truncate">{currentTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onSelectSection("tester")}
              className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              API Tester
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
