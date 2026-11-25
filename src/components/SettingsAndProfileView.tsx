"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  KeyRound,
  Loader2,
  LogOut,
  Moon,
  Play,
  Save,
  ShieldCheck,
  Sun,
  Trash2,
  UserCheck,
  UserPlus,
} from "lucide-react";
import type { AuthenticatedUserDTO } from "@/lib/auth";
import type { LLMProviderType } from "@/types/convobrief";
import type { TestCaseResult } from "@/lib/validation-suite";

const PROVIDER_DEFAULT_MODELS: Record<LLMProviderType, string> = {
  auto: "gpt-4o-mini",
  local: "hybrid-discourse-v2",
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-6",
  gemini: "gemini-3.8-flash",
  groq: "qwen/qwen3.8-27b",
  nvidia: "google/gemma-3-4b-it",
  custom: "gpt-4o-mini",
};

interface SettingsViewProps {
  user: AuthenticatedUserDTO;
  theme: "light" | "dark";
  onToggleTheme: (next: "light" | "dark") => void;
  onUserUpdated: (user: AuthenticatedUserDTO) => void;
  onDataPurged: () => void;
}

export function SettingsView({
  user,
  theme,
  onToggleTheme,
  onUserUpdated,
  onDataPurged,
}: SettingsViewProps) {
  const [preferredProvider, setPreferredProvider] = useState<LLMProviderType>(
    user.preferredProvider
  );
  const [preferredModel, setPreferredModel] = useState(user.preferredModel);
  const [customBaseUrl, setCustomBaseUrl] = useState(user.customBaseUrl);
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [nvidiaKey, setNvidiaKey] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [privacyZeroRetention, setPrivacyZeroRetention] = useState(
    user.privacyZeroRetention
  );
  const [consentModelTraining, setConsentModelTraining] = useState(
    user.consentModelTraining
  );

  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  // Live 12-Scenario Validation Diagnostics
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<{
    allPassed: boolean;
    passedCount: number;
    totalTests: number;
    results: TestCaseResult[];
  } | null>(null);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const apiKeysPayload: Record<string, string> = {};
      if (openaiKey.trim()) apiKeysPayload.openai = openaiKey.trim();
      if (anthropicKey.trim()) apiKeysPayload.anthropic = anthropicKey.trim();
      if (geminiKey.trim()) apiKeysPayload.gemini = geminiKey.trim();
      if (groqKey.trim()) apiKeysPayload.groq = groqKey.trim();
      if (nvidiaKey.trim()) apiKeysPayload.nvidia = nvidiaKey.trim();
      if (customKey.trim()) apiKeysPayload.custom = customKey.trim();

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredProvider,
          preferredModel,
          customBaseUrl,
          privacyZeroRetention,
          consentModelTraining,
          apiKeys:
            Object.keys(apiKeysPayload).length > 0 ? apiKeysPayload : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.user) {
        setFeedback({
          type: "error",
          msg: data.error || "Failed to update settings.",
        });
      } else {
        onUserUpdated(data.user);
        setOpenaiKey("");
        setAnthropicKey("");
        setGeminiKey("");
        setGroqKey("");
        setNvidiaKey("");
        setCustomKey("");
        setFeedback({
          type: "success",
          msg: "Workspace AI & privacy settings saved securely.",
        });
      }
    } catch {
      setFeedback({ type: "error", msg: "Network error while saving." });
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async (provider: string) => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKeys: { [provider]: "__CLEAR__" } }),
    });
    const data = await res.json();
    if (res.ok && data.user) {
      onUserUpdated(data.user);
      setFeedback({
        type: "success",
        msg: `Cleared stored ${provider.toUpperCase()} API key.`,
      });
    }
  };

  const handlePurgeData = async () => {
    setPurging(true);
    try {
      const res = await fetch("/api/settings?scope=data", {
        method: "DELETE",
      });
      if (res.ok) {
        setConfirmPurge(false);
        onDataPurged();
        setFeedback({
          type: "success",
          msg: "All stored conversations, summaries, and Q&A history have been permanently deleted.",
        });
      }
    } finally {
      setPurging(false);
    }
  };

  const handleRunDiagnostics = async () => {
    setRunningDiagnostics(true);
    try {
      const res = await fetch("/api/diagnostics");
      const data = await res.json();
      if (res.ok && data.ok) {
        setDiagnostics(data);
      }
    } finally {
      setRunningDiagnostics(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Platform Settings & Security
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
          Configure LLM providers, encrypted API keys, theme preferences, and privacy-first data retention policies.
        </p>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-xs font-medium ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Theme Appearance Card */}
      <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Interface Theme
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Switch between crisp daylight mode and low-glare obsidian dark mode.
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => onToggleTheme("light")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold cursor-pointer ${
              theme === "light"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            <Sun className="h-3.5 w-3.5" />
            Light
          </button>
          <button
            type="button"
            onClick={() => onToggleTheme("dark")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold cursor-pointer ${
              theme === "dark"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            <Moon className="h-3.5 w-3.5" />
            Dark
          </button>
        </div>
      </div>

      {/* Configurable AI Provider & Encrypted API Keys */}
      <form
        onSubmit={handleSaveSettings}
        className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-5 shadow-xs"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-indigo-500" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Configurable AI / NLP Engine & Encrypted Provider Keys
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Default Summarization Provider
            </label>
            <select
              value={preferredProvider}
              onChange={(e) => {
                const nextProvider = e.target.value as LLMProviderType;
                setPreferredProvider(nextProvider);
                setPreferredModel(PROVIDER_DEFAULT_MODELS[nextProvider]);
              }}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
            >
              <option value="auto">
                Auto (Use Configured LLM Key or Built-in Hybrid NLP)
              </option>
              <option value="local">
                ConvoBrief Hybrid NLP Engine (100% On-Server)
              </option>
              <option value="openai">OpenAI API</option>
              <option value="anthropic">Anthropic Claude API</option>
              <option value="gemini">Google Gemini API</option>
              <option value="groq">Groq API</option>
              <option value="nvidia">NVIDIA NIM API</option>
              <option value="custom">Custom OpenAI-Compatible Endpoint</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Preferred Model Identifier
            </label>
            <input
              type="text"
              value={preferredModel}
              onChange={(e) => setPreferredModel(e.target.value)}
              placeholder="e.g. qwen/qwen3.8-27b or google/gemma-3-4b-it"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Default models: Groq uses <code>qwen/qwen3.8-27b</code>; NVIDIA NIM
          uses <code>google/gemma-3-4b-it</code>. Change the model identifier
          above to use another model available to your provider account.
        </p>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          API keys entered below are encrypted at rest with AES-256-GCM on the server and are never exposed in browser bundles.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {[
            {
              key: "openai" as const,
              label: "OpenAI API Key",
              val: openaiKey,
              setVal: setOpenaiKey,
              placeholder: "sk-proj-...",
            },
            {
              key: "anthropic" as const,
              label: "Anthropic API Key",
              val: anthropicKey,
              setVal: setAnthropicKey,
              placeholder: "sk-ant-...",
            },
            {
              key: "gemini" as const,
              label: "Google Gemini API Key",
              val: geminiKey,
              setVal: setGeminiKey,
              placeholder: "AIza...",
            },
            {
              key: "groq" as const,
              label: "Groq API Key",
              val: groqKey,
              setVal: setGroqKey,
              placeholder: "gsk_...",
            },
            {
              key: "nvidia" as const,
              label: "NVIDIA API Key",
              val: nvidiaKey,
              setVal: setNvidiaKey,
              placeholder: "nvapi-...",
            },
            {
              key: "custom" as const,
              label: "Custom / OpenRouter API Key",
              val: customKey,
              setVal: setCustomKey,
              placeholder: "sk-or-...",
            },
          ].map((item) => {
            const masked = user.maskedKeys[item.key];
            const hasEnv = user.envProvidersConfigured[item.key];
            return (
              <div key={item.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {item.label}
                  </label>
                  {masked ? (
                    <button
                      type="button"
                      onClick={() => handleClearKey(item.key)}
                      className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                    >
                      Clear ({masked})
                    </button>
                  ) : hasEnv ? (
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                      Active via ENV
                    </span>
                  ) : null}
                </div>
                <input
                  type="password"
                  value={item.val}
                  onChange={(e) => item.setVal(e.target.value)}
                  placeholder={masked || item.placeholder}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>
            );
          })}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Custom OpenAI-Compatible Base URL (Optional — e.g. OpenRouter or Ollama)
          </label>
          <input
            type="text"
            value={customBaseUrl}
            onChange={(e) => setCustomBaseUrl(e.target.value)}
            placeholder="https://openrouter.ai/api/v1"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
          />
        </div>

        {/* Privacy Controls */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Privacy-First Controls
            </h3>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={privacyZeroRetention}
              onChange={(e) => setPrivacyZeroRetention(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Zero-Retention Raw Transcript Storage
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                When enabled, ConvoBrief AI stores only the structured summary output in PostgreSQL and redacts the raw input transcript immediately after analysis.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consentModelTraining}
              onChange={(e) => setConsentModelTraining(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Explicit Model Training Consent (Off by default)
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Private conversations are never used for model training or shared externally unless explicitly opted in.
              </p>
            </div>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs font-semibold text-white cursor-pointer"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save Settings
          </button>
        </div>
      </form>

      {/* Automated 12-Scenario Validation & Anti-Hallucination Test Runner */}
      <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-indigo-500" />
              Grounding, Anti-Hallucination & Security Validation Suite
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Execute 12 live verification tests covering contradictions, missing deadlines, unassigned tasks, prompt injection, and invalid uploads.
            </p>
          </div>
          <button
            type="button"
            disabled={runningDiagnostics}
            onClick={handleRunDiagnostics}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:hover:bg-indigo-500/25 px-3.5 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer shrink-0"
          >
            {runningDiagnostics ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Run 12-Scenario Suite
          </button>
        </div>

        {diagnostics && (
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <span>
                Validation Result: {diagnostics.passedCount} /{" "}
                {diagnostics.totalTests} Scenarios Passed
              </span>
              <span>{diagnostics.allPassed ? "100% VERIFIED" : "CHECK FAILED"}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {diagnostics.results.map((tc) => (
                <div
                  key={tc.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                      <CheckCircle2
                        className={`h-3.5 w-3.5 ${
                          tc.passed ? "text-emerald-500" : "text-rose-500"
                        }`}
                      />
                      {tc.name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {tc.durationMs}ms
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                    {tc.assertionSummary}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Data Deletion Zone */}
      <div className="rounded-2xl bg-white dark:bg-[#111827] border border-rose-200 dark:border-rose-500/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-rose-700 dark:text-rose-400">
            Delete Conversation & Summary Data
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Permanently erase all conversations, extracted summaries, and follow-up Q&A records in your workspace.
          </p>
        </div>

        {!confirmPurge ? (
          <button
            type="button"
            onClick={() => setConfirmPurge(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 cursor-pointer shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Purge All Data
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmPurge(false)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={purging}
              onClick={handlePurgeData}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              {purging && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm Permanent Purge
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface ProfileViewProps {
  user: AuthenticatedUserDTO;
  totalAnalyses: number;
  savedCount: number;
  onUserUpdated: (user: AuthenticatedUserDTO) => void;
  onOpenAuthModal: (tab: "login" | "register") => void;
  onSignOut: () => void;
}

export function ProfileView({
  user,
  totalAnalyses,
  savedCount,
  onUserUpdated,
  onOpenAuthModal,
  onSignOut,
}: ProfileViewProps) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [organization, setOrganization] = useState(user.organization);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          role,
          organization,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.user) {
        setMsg({ type: "err", text: data.error || "Update failed." });
      } else {
        onUserUpdated(data.user);
        setCurrentPassword("");
        setNewPassword("");
        setMsg({ type: "ok", text: "Profile updated successfully." });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Workspace Profile & Account
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Manage your identity, authentication credentials, and isolated workspace session.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {user.isDemo && (
            <button
              type="button"
              onClick={() => onOpenAuthModal("register")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Create Private Account
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Identity Summary Card */}
      <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-bold text-white">
            {user.name
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {user.name}
              </h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  user.isDemo
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {user.isDemo ? "Demo Workspace" : "Private Isolated Account"}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user.email} • {user.role} at {user.organization}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-center">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900 px-4 py-2 border border-slate-200/70 dark:border-slate-800">
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {totalAnalyses}
            </p>
            <p className="text-[11px] text-slate-500">Analyses</p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900 px-4 py-2 border border-slate-200/70 dark:border-slate-800">
            <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
              {savedCount}
            </p>
            <p className="text-[11px] text-slate-500">Saved</p>
          </div>
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-xl border p-3 text-xs font-medium ${
            msg.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
          }`}
        >
          {msg.text}
        </div>
      )}

      <form
        onSubmit={handleSaveProfile}
        className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xs"
      >
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Profile Details
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Role / Title
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Organization
          </label>
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
          />
        </div>

        {!user.isDemo && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Current Password (to change password)
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                New Password (min. 8 characters)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs font-semibold text-white cursor-pointer"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Update Profile
          </button>
        </div>
      </form>
    </div>
  );
}
