"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FileUp,
  Loader2,
  Sliders,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { SAMPLE_CONVERSATIONS } from "@/lib/sample-conversations";
import { SUMMARY_MODE_META } from "@/components/ui-badges";
import type {
  AnalysisRecordDTO,
  ConversationSourceType,
  LLMProviderType,
  SummaryLength,
  SummaryMode,
} from "@/types/convobrief";

interface NewAnalysisStudioProps {
  defaultProvider?: LLMProviderType;
  defaultAnalysisEngine?: "local" | "ai";
  onAnalysisComplete: (record: AnalysisRecordDTO) => void;
}

const ALL_MODES: SummaryMode[] = [
  "quick",
  "detailed",
  "executive",
  "technical",
  "meeting",
  "action",
];

export function NewAnalysisStudio({
  defaultProvider = "auto",
  defaultAnalysisEngine = "local",
  onAnalysisComplete,
}: NewAnalysisStudioProps) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<string>("auto");
  const [mode, setMode] = useState<SummaryMode>("detailed");
  const [lengthPreference, setLengthPreference] =
    useState<SummaryLength>("balanced");
  const [analysisEngine, setAnalysisEngine] =
    useState<"local" | "ai">(defaultAnalysisEngine);
  const [selectedProvider, setSelectedProvider] =
    useState<LLMProviderType>(
      defaultProvider === "local" ? "auto" : defaultProvider
    );
  const [customInstructions, setCustomInstructions] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccessInfo, setUploadSuccessInfo] = useState<string | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const liveMetrics = useMemo(() => {
    const trimmed = content.trim();
    if (!trimmed) {
      return { words: 0, lines: 0, readingMins: 0 };
    }
    const words = trimmed.split(/\s+/).filter(Boolean).length;
    const lines = trimmed.split("\n").filter((l) => l.trim().length > 0).length;
    const readingMins = Math.max(1, Math.ceil(words / 200));
    return { words, lines, readingMins };
  }, [content]);

  const handleLoadSample = (sampleId: string) => {
    const found = SAMPLE_CONVERSATIONS.find((s) => s.id === sampleId);
    if (!found) return;
    setContent(found.transcript);
    setTitle(found.label);
    setMode(found.recommendedMode);
    setSourceType(found.sourceType);
    setUploadedFileName(null);
    setUploadSuccessInfo(null);
    setError(null);
  };

  const processFileUpload = async (file: File) => {
    setError(null);
    setUploadSuccessInfo(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Document extraction failed.");
        return;
      }
      setContent(data.extractedText);
      setUploadedFileName(data.fileName);
      if (!title) {
        setTitle(
          String(data.fileName || "")
            .replace(/\.[^.]+$/, "")
            .replace(/[-_]+/g, " ")
        );
      }
      const p = data.preview;
      setUploadSuccessInfo(
        `Extracted ${p.wordCount.toLocaleString()} words (${p.messageCount} turns, ${p.participantCount} participant${
          p.participantCount === 1 ? "" : "s"
        }, ${p.detectedLanguage}) from "${data.fileName}".`
      );
    } catch {
      setError("Failed to upload and extract file. Please verify file format.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFileUpload(file);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFileUpload(file);
    }
  };

  const handleAnalyze = async () => {
    setError(null);
    if (!content.trim()) {
      setError(
        "Please paste a conversation transcript or upload a TXT, PDF, or DOCX file before analyzing."
      );
      return;
    }

    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          title: title.trim() || undefined,
          sourceType:
            sourceType === "auto"
              ? undefined
              : (sourceType as ConversationSourceType),
          fileName: uploadedFileName,
          mode,
          lengthPreference,
          analysisEngine,
          provider:
            analysisEngine === "local"
              ? "local"
              : selectedProvider,
          customInstructions,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.analysis) {
        setError(data.error || "Analysis failed.");
      } else {
        onAnalysisComplete(data.analysis);
      }
    } catch {
      setError("Network error while communicating with analysis engine.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Interactive Conversation Analyzer
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Paste multi-channel chats or upload TXT, PDF, and DOCX transcripts to extract context-preserved intelligence.
          </p>
        </div>

        {/* Sample Presets Quick Loader */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
            Load Sample:
          </span>
          {SAMPLE_CONVERSATIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleLoadSample(s.id)}
              className="rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white hover:bg-indigo-50 dark:bg-slate-800/80 dark:hover:bg-indigo-500/15 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-300 transition-colors cursor-pointer"
            >
              {s.badge}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Validation or Processing Error</p>
            <p className="text-xs mt-0.5 opacity-90">{error}</p>
          </div>
        </div>
      )}

      {uploadSuccessInfo && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <span>{uploadSuccessInfo}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: Original Conversation Input & Document Upload (7 cols) */}
        <div className="lg:col-span-7 flex flex-col rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-slate-50/70 dark:bg-slate-900/40">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                Conversation Source
              </span>
              {uploadedFileName && (
                <span className="rounded-md bg-indigo-100 dark:bg-indigo-500/20 px-2 py-0.5 text-[11px] font-mono text-indigo-700 dark:text-indigo-300">
                  {uploadedFileName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                aria-label="Conversation format"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="auto">Auto-Detect Format</option>
                <option value="meeting">Meeting Transcript</option>
                <option value="whatsapp">WhatsApp Export</option>
                <option value="telegram">Telegram Chat</option>
                <option value="email">Email Thread</option>
                <option value="support">Customer Support Chat</option>
                <option value="chatgpt">ChatGPT Conversation</option>
                <option value="plain_text">Plain Text</option>
              </select>

              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.docx,.md,.json,.vtt"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:hover:bg-indigo-500/25 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileUp className="h-3.5 w-3.5" />
                )}
                Upload TXT / PDF / DOCX
              </button>

              {content && (
                <button
                  type="button"
                  onClick={() => {
                    setContent("");
                    setTitle("");
                    setUploadedFileName(null);
                    setUploadSuccessInfo(null);
                    setError(null);
                  }}
                  title="Clear input"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Optional Title */}
          <div className="px-5 pt-3.5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Optional title (auto-generated from topic if left blank)..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-3.5 py-2 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Drag-and-drop + Paste Transcript Textarea */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative flex-1 p-5 transition-colors ${
              isDragging ? "bg-indigo-50/60 dark:bg-indigo-500/10" : ""
            }`}
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={16}
              placeholder={`Paste your conversation or drop a TXT, PDF, or DOCX file here...\n\nSupported formats:\n• WhatsApp: [18/05/2026, 09:15] Name: Message\n• Meeting Transcripts: [00:04:12] Speaker: Message\n• Email Threads: From: / To: / Subject:\n• ChatGPT, Telegram, Customer Support, or Plain Text`}
              className="w-full h-full min-h-[340px] resize-y rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/50 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            {isDragging && (
              <div className="pointer-events-none absolute inset-5 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-indigo-500 bg-indigo-500/10 backdrop-blur-xs">
                <FileUp className="h-8 w-8 text-indigo-600 dark:text-indigo-400 mb-2" />
                <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                  Drop TXT, PDF, or DOCX file to extract conversation
                </p>
              </div>
            )}
          </div>

          {/* Live Pre-Analysis Telemetry Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-2.5 bg-slate-50/70 dark:bg-slate-900/40 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            <div className="flex items-center gap-4">
              <span>{liveMetrics.lines.toLocaleString()} non-empty lines</span>
              <span>{liveMetrics.words.toLocaleString()} words</span>
              <span>~{liveMetrics.readingMins} min raw read</span>
            </div>
            <span>Max upload: 10 MB • Prompt-injection shield active</span>
          </div>
        </div>

        {/* RIGHT: Summary Configuration Controls (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-5">
          <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-xs p-5 space-y-5">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Summarization Mode
              </h2>
            </div>

            {/* 6 Modes Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ALL_MODES.map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`text-left rounded-xl border p-3 transition-all cursor-pointer ${
                      active
                        ? "border-indigo-600 bg-indigo-50/70 dark:border-indigo-500 dark:bg-indigo-500/15 ring-1 ring-indigo-600/30"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40"
                    }`}
                  >
                    <p
                      className={`text-xs font-semibold ${
                        active
                          ? "text-indigo-700 dark:text-indigo-300"
                          : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {SUMMARY_MODE_META[m].label}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      {SUMMARY_MODE_META[m].shortDesc}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Summary Length */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Summary Depth & Length
              </label>
              <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1">
                {(["concise", "balanced", "comprehensive"] as SummaryLength[]).map(
                  (len) => (
                    <button
                      key={len}
                      type="button"
                      onClick={() => setLengthPreference(len)}
                      className={`rounded-lg py-1.5 text-xs font-medium capitalize transition-all cursor-pointer ${
                        lengthPreference === len
                          ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      {len}
                    </button>
                  )
                )}
              </div>
            </div>

            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Analysis engine
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  {
                    value: "local",
                    title: "Local NLP (no AI)",
                    description:
                      "Uses the built-in engine on this server. No AI provider is called.",
                  },
                  {
                    value: "ai",
                    title: "AI-powered analysis",
                    description:
                      "Uses your configured AI provider. The transcript is sent to that provider.",
                  },
                ] as const).map((engine) => {
                  const active = analysisEngine === engine.value;
                  return (
                    <button
                      key={engine.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setAnalysisEngine(engine.value)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        active
                          ? "border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-600/30 dark:border-indigo-500 dark:bg-indigo-500/15"
                          : "border-slate-200 bg-slate-50/40 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700"
                      }`}
                    >
                      <span className="block text-xs font-semibold text-slate-900 dark:text-white">
                        {engine.title}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                        {engine.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {analysisEngine === "ai" && (
              <div>
                <label
                  htmlFor="analysis-provider"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  AI provider
                </label>
                <select
                  id="analysis-provider"
                  value={selectedProvider}
                  onChange={(e) =>
                    setSelectedProvider(e.target.value as LLMProviderType)
                  }
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
                >
                  <option value="auto">Use configured provider</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="groq">Groq</option>
                  <option value="nvidia">NVIDIA NIM</option>
                  <option value="custom">Custom OpenAI-compatible</option>
                </select>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Groq default: <code>qwen/qwen3.8-27b</code>. NVIDIA NIM
                  default: <code>google/gemma-3-4b-it</code>. Set another
                  available model in Settings; the selected provider key is
                  reused.
                </p>
              </div>
            )}

            {/* Custom Instructions */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                <Wand2 className="h-3.5 w-3.5 text-indigo-500" />
                Custom Focus Instructions (Optional)
              </label>
              <textarea
                rows={2}
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g., Focus on PostgreSQL indexing risks, SLA impact, or Q3 contract deadlines..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* Analyze CTA */}
            <button
              type="button"
              disabled={analyzing || uploading}
              onClick={handleAnalyze}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting Grounded Intelligence...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Analyze Conversation
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
