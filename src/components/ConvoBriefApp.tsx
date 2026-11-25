"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Activity,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  ListTodo,
  Loader2,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  User,
  UserPlus,
  X,
} from "lucide-react";
import { AuthView } from "@/components/AuthView";
import { NewAnalysisStudio } from "@/components/NewAnalysisStudio";
import { ResultWorkspace } from "@/components/ResultWorkspace";
import {
  ProfileView,
  SettingsView,
} from "@/components/SettingsAndProfileView";
import {
  ImportanceBadge,
  ModeBadge,
  SourceTypeBadge,
} from "@/components/ui-badges";
import { exportAsDocx, exportAsPdf, exportAsTxt } from "@/lib/exporters";
import type { AuthenticatedUserDTO } from "@/lib/auth";
import type { AnalysisRecordDTO } from "@/types/convobrief";

type NavSection =
  | "dashboard"
  | "new_analysis"
  | "conversations"
  | "saved"
  | "history"
  | "settings"
  | "profile"
  | "result";

interface ActivityLogItem {
  id: number;
  actionType: string;
  title: string;
  metadata: string;
  summaryId: number | null;
  conversationId: number | null;
  createdAt: string;
}

interface DashboardStats {
  totalAnalyses: number;
  totalMessagesProcessed: number;
  totalDecisionsExtracted: number;
  totalActionItems: number;
  savedCount: number;
  avgNoiseReduced: number;
}

interface ConvoBriefAppProps {
  initialUser: AuthenticatedUserDTO | null;
}

const THEME_EVENT = "convobrief-theme-change";

function subscribeToTheme(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getThemeSnapshot(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerThemeSnapshot(): "light" | "dark" {
  return "light";
}

function getDefaultAnalysisEngine(
  user: AuthenticatedUserDTO
): "local" | "ai" {
  const configuredProviders = {
    openai: Boolean(user.envProvidersConfigured.openai || user.maskedKeys.openai),
    anthropic: Boolean(
      user.envProvidersConfigured.anthropic || user.maskedKeys.anthropic
    ),
    gemini: Boolean(user.envProvidersConfigured.gemini || user.maskedKeys.gemini),
    groq: Boolean(
      user.envProvidersConfigured.groq ||
        user.maskedKeys.groq ||
        user.maskedKeys.custom
    ),
    nvidia: Boolean(
      user.envProvidersConfigured.nvidia ||
        user.maskedKeys.nvidia ||
        user.maskedKeys.custom
    ),
    custom: Boolean(user.envProvidersConfigured.custom || user.maskedKeys.custom),
  };

  if (user.preferredProvider === "local") return "local";
  if (user.preferredProvider === "auto") {
    return Object.values(configuredProviders).some(Boolean) ? "ai" : "local";
  }
  return configuredProviders[user.preferredProvider] ? "ai" : "local";
}

export function ConvoBriefApp({ initialUser }: ConvoBriefAppProps) {
  const [user, setUser] = useState<AuthenticatedUserDTO | null>(initialUser);
  const [nav, setNav] = useState<NavSection>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  );

  // Auth modal for switching from Demo Workspace to Private Account
  const [authModalTab, setAuthModalTab] = useState<"login" | "register" | null>(
    null
  );

  // Workspace data
  const [analyses, setAnalyses] = useState<AnalysisRecordDTO[]>([]);
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalAnalyses: 0,
    totalMessagesProcessed: 0,
    totalDecisionsExtracted: 0,
    totalActionItems: 0,
    savedCount: 0,
    avgNoiseReduced: 0,
  });
  const [loadingWorkspace, setLoadingWorkspace] = useState(Boolean(initialUser));
  const [selectedRecord, setSelectedRecord] =
    useState<AnalysisRecordDTO | null>(null);

  // Search & Filter in My Conversations
  const [librarySearch, setLibrarySearch] = useState("");
  const [importanceFilter, setImportanceFilter] = useState("ALL");

  const handleToggleTheme = (next?: "light" | "dark") => {
    const target = next || (theme === "dark" ? "light" : "dark");
    document.documentElement.classList.toggle("dark", target === "dark");
    try {
      localStorage.setItem("convobrief_theme", target);
    } catch {}
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  const fetchWorkspaceData = useCallback(async () => {
    try {
      const res = await fetch("/api/analyses");
      if (res.status === 401) {
        setUser(null);
        return;
      }
      const data = await res.json();
      if (res.ok && data.ok) {
        setAnalyses(data.analyses || []);
        setLogs(data.logs || []);
        if (data.dashboardStats) {
          setStats(data.dashboardStats);
        }
      }
    } finally {
      setLoadingWorkspace(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void fetchWorkspaceData();
    }
  }, [user, fetchWorkspaceData]);

  const handleSignOut = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setUser(null);
    setAnalyses([]);
    setLogs([]);
    setSelectedRecord(null);
    setNav("dashboard");
  };

  const handleOpenResult = (rec: AnalysisRecordDTO) => {
    setSelectedRecord(rec);
    setNav("result");
    setMobileMenuOpen(false);
  };

  const handleRecordUpdated = (updated: AnalysisRecordDTO) => {
    setSelectedRecord(updated);
    setAnalyses((prev) =>
      prev.map((a) => (a.summaryId === updated.summaryId ? updated : a))
    );
    void fetchWorkspaceData();
  };

  const handleDeleteAnalysis = async (summaryId: number) => {
    const res = await fetch(`/api/analyses/${summaryId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setAnalyses((prev) => prev.filter((a) => a.summaryId !== summaryId));
      if (selectedRecord?.summaryId === summaryId) {
        setSelectedRecord(null);
        setNav("conversations");
      }
      void fetchWorkspaceData();
    }
  };

  const filteredConversations = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return analyses.filter((a) => {
      if (importanceFilter !== "ALL" && a.overallImportance !== importanceFilter)
        return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.structuredResult.overview.toLowerCase().includes(q) ||
        a.participants.some((p) => p.toLowerCase().includes(q)) ||
        a.detectedLanguage.toLowerCase().includes(q)
      );
    });
  }, [analyses, importanceFilter, librarySearch]);

  const savedAnalyses = useMemo(
    () => analyses.filter((a) => a.isSaved),
    [analyses]
  );

  // When signed out, render dedicated AuthView
  if (!user) {
    return (
      <AuthView
        onAuthenticated={(u) => {
          setUser(u);
          setNav("dashboard");
        }}
      />
    );
  }

  const sidebarItems: Array<{
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "new_analysis", label: "New Analysis", icon: Sparkles },
    {
      id: "conversations",
      label: "My Conversations",
      icon: FolderKanban,
      badge: analyses.length,
    },
    {
      id: "saved",
      label: "Saved Summaries",
      icon: Bookmark,
      badge: savedAnalyses.length,
    },
    { id: "history", label: "History", icon: History },
    { id: "settings", label: "Settings", icon: Settings },
    { id: "profile", label: "Profile", icon: User },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#090D16]">
      {/* Auth Modal for Demo -> Private Account Switching */}
      {authModalTab && (
        <AuthView
          isModal
          initialTab={authModalTab}
          onClose={() => setAuthModalTab(null)}
          onAuthenticated={(u) => {
            setUser(u);
            setAuthModalTab(null);
            setSelectedRecord(null);
            setNav("dashboard");
          }}
        />
      )}

      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-white dark:bg-[#0D1322] border-r border-slate-200 dark:border-slate-800/90 transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => {
              setNav("dashboard");
              setMobileMenuOpen(false);
            }}
            className="flex items-center gap-2.5 text-left cursor-pointer"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
              <MessageSquareText className="h-4.5 w-4.5" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white block leading-none">
                ConvoBrief AI
              </span>
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                Conversation Intelligence
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden rounded-lg p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Primary CTA */}
        <div className="p-4">
          <button
            type="button"
            onClick={() => {
              setNav("new_analysis");
              setMobileMenuOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-indigo-600/20 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            New Conversation Analysis
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active =
              nav === item.id ||
              (nav === "result" && item.id === "conversations");
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setNav(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                {typeof item.badge === "number" && item.badge > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${
                      active
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom User Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800/80 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setNav("profile");
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/15 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                {user.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {user.name}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {user.isDemo ? "Demo Workspace" : user.email}
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT SHELL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 h-16 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 bg-white/85 dark:bg-[#0D1322]/85 backdrop-blur-md px-4 sm:px-7">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {user.isDemo ? (
              <div className="hidden sm:flex items-center gap-2 rounded-full border border-amber-300/60 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 px-3 py-1 text-xs text-amber-800 dark:text-amber-300">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span>Interactive Demo Workspace</span>
                <button
                  type="button"
                  onClick={() => setAuthModalTab("register")}
                  className="font-bold underline hover:text-amber-950 dark:hover:text-amber-200 ml-1 cursor-pointer"
                >
                  Create Private Account
                </button>
                <span className="opacity-40">|</span>
                <button
                  type="button"
                  onClick={() => setAuthModalTab("login")}
                  className="font-semibold hover:underline cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Private Isolated Workspace ({user.organization})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {user.isDemo && (
              <button
                type="button"
                onClick={() => setAuthModalTab("register")}
                className="sm:hidden inline-flex items-center gap-1 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Sign Up
              </button>
            )}

            <button
              type="button"
              onClick={() => handleToggleTheme()}
              title={
                theme === "dark"
                  ? "Switch to Light Mode"
                  : "Switch to Dark Mode"
              }
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setNav("new_analysis")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              New Analysis
            </button>
          </div>
        </header>

        {/* Workspace Body */}
        <main className="flex-1 p-4 sm:p-7 max-w-[1440px] w-full mx-auto">
          {/* VIEW 1: MAIN DASHBOARD */}
          {nav === "dashboard" && (
            <div className="space-y-6">
              {/* Welcome Hero Section */}
              <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-7 border border-slate-800 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="space-y-2 max-w-2xl">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 px-3 py-0.5 text-[11px] font-semibold text-indigo-200">
                    <Sparkles className="h-3 w-3" />
                    Context-Preserving Conversation Intelligence
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                    Welcome back, {user.name.split(" ")[0]}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Transform lengthy meetings, WhatsApp/Telegram threads, emails, and support transcripts into structured, source-traceable executive summaries without losing context or inventing facts.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setNav("new_analysis")}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md transition-colors cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    New Conversation Analysis
                  </button>
                </div>
              </div>

              {/* 6 Summary Statistics KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
                {[
                  {
                    label: "Conversations Analyzed",
                    value: stats.totalAnalyses,
                    sub: "Structured briefs",
                    icon: FolderKanban,
                    accent: "text-indigo-600 dark:text-indigo-400",
                  },
                  {
                    label: "Messages Distilled",
                    value: stats.totalMessagesProcessed,
                    sub: "Multi-channel turns",
                    icon: MessageSquareText,
                    accent: "text-sky-600 dark:text-sky-400",
                  },
                  {
                    label: "Decisions Detected",
                    value: stats.totalDecisionsExtracted,
                    sub: "Grounded agreements",
                    icon: CheckCircle2,
                    accent: "text-emerald-600 dark:text-emerald-400",
                  },
                  {
                    label: "Action Items",
                    value: stats.totalActionItems,
                    sub: "Owner & deadline tracked",
                    icon: ListTodo,
                    accent: "text-amber-600 dark:text-amber-400",
                  },
                  {
                    label: "Avg. Noise Eliminated",
                    value: `${stats.avgNoiseReduced}%`,
                    sub: "Greetings & duplicates",
                    icon: Activity,
                    accent: "text-purple-600 dark:text-purple-400",
                  },
                  {
                    label: "Saved Summaries",
                    value: stats.savedCount,
                    sub: "Bookmarked briefs",
                    icon: BookmarkCheck,
                    accent: "text-rose-600 dark:text-rose-400",
                  },
                ].map((kpi, idx) => {
                  const Icon = kpi.icon;
                  return (
                    <div
                      key={idx}
                      className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {kpi.label}
                        </span>
                        <Icon className={`h-4 w-4 ${kpi.accent}`} />
                      </div>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
                        {kpi.value}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {kpi.sub}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Recent analyses */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-12 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Recent Conversation Analyses
                    </h2>
                    <button
                      type="button"
                      onClick={() => setNav("conversations")}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      View All ({analyses.length})
                    </button>
                  </div>

                  {loadingWorkspace ? (
                    <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                      Loading workspace intelligence...
                    </div>
                  ) : analyses.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center space-y-2">
                      <FileText className="h-7 w-7 text-slate-400 mx-auto" />
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        No conversations analyzed yet
                      </p>
                      <p className="text-xs text-slate-500">
                        Start a new analysis to try sample multi-channel conversations or analyze your own transcript.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {analyses.slice(0, 4).map((item) => (
                        <div
                          key={item.summaryId}
                          onClick={() => handleOpenResult(item)}
                          className="group rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/60 bg-slate-50/40 dark:bg-slate-900/40 hover:bg-indigo-50/20 dark:hover:bg-indigo-500/5 p-4 transition-all cursor-pointer space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <ImportanceBadge
                                level={item.overallImportance}
                                size="xs"
                              />
                              <SourceTypeBadge type={item.sourceType} />
                              <ModeBadge mode={item.mode} />
                              <span className="text-[11px] text-slate-500">
                                • {item.detectedLanguage}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-400">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {item.title}
                          </h3>

                          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {item.structuredResult.overview}
                          </p>

                          <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>{item.messageCount} msgs</span>
                            <span>{item.participantCount} participants</span>
                            <span className="font-medium text-indigo-600 dark:text-indigo-400">
                              {item.structuredResult.important_decisions.length}{" "}
                              decision(s)
                            </span>
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              {item.structuredResult.action_items.length} action
                              item(s)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: NEW ANALYSIS STUDIO */}
          {nav === "new_analysis" && (
            <NewAnalysisStudio
              defaultProvider={user.preferredProvider}
              defaultAnalysisEngine={getDefaultAnalysisEngine(user)}
              onAnalysisComplete={(record) => {
                setAnalyses((prev) => [record, ...prev]);
                handleOpenResult(record);
                void fetchWorkspaceData();
              }}
            />
          )}

          {/* VIEW 3: MY CONVERSATIONS LIBRARY */}
          {nav === "conversations" && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    My Conversations
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                    Search, filter, inspect source traceability, or export any analyzed conversation.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      placeholder="Search title, topic, speaker..."
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <select
                    value={importanceFilter}
                    onChange={(e) => setImportanceFilter(e.target.value)}
                    aria-label="Filter by importance"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    <option value="ALL">All Importance Levels</option>
                    <option value="Critical">Critical</option>
                    <option value="High Importance">High Importance</option>
                    <option value="Medium Importance">Medium Importance</option>
                    <option value="Low Importance">Low Importance</option>
                  </select>
                </div>
              </div>

              {filteredConversations.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
                  <FolderKanban className="h-8 w-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    No matching conversations found
                  </p>
                  <button
                    type="button"
                    onClick={() => setNav("new_analysis")}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Start New Analysis
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredConversations.map((item) => (
                    <div
                      key={item.summaryId}
                      className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between space-y-4"
                    >
                      <div
                        onClick={() => handleOpenResult(item)}
                        className="space-y-2.5 cursor-pointer group"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <ImportanceBadge
                              level={item.overallImportance}
                              size="xs"
                            />
                            <SourceTypeBadge type={item.sourceType} />
                            <ModeBadge mode={item.mode} />
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {item.title}
                        </h3>

                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                          {item.structuredResult.overview}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <span>{item.messageCount} msgs</span>
                          <span>{item.detectedLanguage}</span>
                          <span>
                            {item.structuredResult.action_items.length} tasks
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenResult(item)}
                            className="rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:hover:bg-indigo-500/25 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer"
                          >
                            Open Brief
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAnalysis(item.summaryId)}
                            title="Delete conversation"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW 4: SAVED SUMMARIES */}
          {nav === "saved" && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Saved Summaries
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                  Bookmarked executive briefs ready for one-click PDF, DOCX, and TXT distribution.
                </p>
              </div>

              {savedAnalyses.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-12 text-center space-y-2">
                  <Bookmark className="h-8 w-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    No saved summaries yet
                  </p>
                  <p className="text-xs text-slate-500">
                    Click &quot;Save&quot; on any analysis result page to pin high-priority briefs here.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {savedAnalyses.map((item) => (
                    <div
                      key={item.summaryId}
                      className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <ImportanceBadge
                            level={item.overallImportance}
                            size="xs"
                          />
                          <ModeBadge mode={item.mode} />
                        </div>
                        <BookmarkCheck className="h-4 w-4 text-amber-500" />
                      </div>

                      <h3
                        onClick={() => handleOpenResult(item)}
                        className="text-base font-bold text-slate-900 dark:text-white hover:text-indigo-600 cursor-pointer"
                      >
                        {item.title}
                      </h3>

                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                        {item.structuredResult.overview}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleOpenResult(item)}
                          className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                        >
                          Inspect Full Brief
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => exportAsPdf(item)}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => void exportAsDocx(item)}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            DOCX
                          </button>
                          <button
                            type="button"
                            onClick={() => exportAsTxt(item)}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            TXT
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* VIEW 5: ACTIVITY HISTORY */}
          {nav === "history" && (
            <div className="max-w-4xl space-y-5">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Workspace Activity History
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                  Chronological audit trail of analyses, summary edits, grounded follow-up queries, and exports.
                </p>
              </div>

              <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
                {logs.length === 0 ? (
                  <p className="text-xs text-slate-500 py-8 text-center">
                    No activity recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {logs.map((log) => {
                      const linked = analyses.find(
                        (a) => a.summaryId === log.summaryId
                      );
                      return (
                        <div
                          key={log.id}
                          className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="space-y-0.5">
                            <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                              {log.title}
                            </p>
                            {log.metadata && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {log.metadata}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono text-[11px] text-slate-400 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                            {linked && (
                              <button
                                type="button"
                                onClick={() => handleOpenResult(linked)}
                                className="rounded-lg bg-indigo-50 dark:bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer"
                              >
                                View
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW 6: SETTINGS */}
          {nav === "settings" && (
            <SettingsView
              user={user}
              theme={theme}
              onToggleTheme={handleToggleTheme}
              onUserUpdated={(u) => setUser(u)}
              onDataPurged={() => {
                setAnalyses([]);
                setSelectedRecord(null);
                void fetchWorkspaceData();
              }}
            />
          )}

          {/* VIEW 7: PROFILE */}
          {nav === "profile" && (
            <ProfileView
              user={user}
              totalAnalyses={analyses.length}
              savedCount={savedAnalyses.length}
              onUserUpdated={(u) => setUser(u)}
              onOpenAuthModal={(t) => setAuthModalTab(t)}
              onSignOut={handleSignOut}
            />
          )}

          {/* VIEW 8: RESULT WORKSPACE */}
          {nav === "result" && selectedRecord && (
            <ResultWorkspace
              record={selectedRecord}
              onBack={() => setNav("dashboard")}
              onRecordUpdated={handleRecordUpdated}
            />
          )}
        </main>
      </div>
    </div>
  );
}
