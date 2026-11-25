"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Filter,
  GitBranch,
  HelpCircle,
  Layers,
  Loader2,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Tag,
  Users,
  X,
} from "lucide-react";
import {
  CitationChips,
  ImportanceBadge,
  ModeBadge,
  SUMMARY_MODE_META,
  SourceTypeBadge,
} from "@/components/ui-badges";
import {
  exportAsDocx,
  exportAsJson,
  exportAsPdf,
  exportAsTxt,
  formatSummaryAsPlainText,
} from "@/lib/exporters";
import type {
  AnalysisRecordDTO,
  ExtractedActionItem,
  SummaryMode,
} from "@/types/convobrief";

interface FollowUpItem {
  id: number;
  question: string;
  answer: string;
  citedMessageIds: number[];
  confidence: string;
  providerUsed: string;
  createdAt: string;
}

interface ResultWorkspaceProps {
  record: AnalysisRecordDTO;
  onBack: () => void;
  onRecordUpdated: (updated: AnalysisRecordDTO) => void;
}

type ResultTab =
  | "overview"
  | "key_points"
  | "decisions"
  | "actions"
  | "deadlines"
  | "issues"
  | "questions"
  | "entities"
  | "timeline"
  | "followup";

const PRESET_FOLLOWUP_QUESTIONS = [
  "What were the final decisions?",
  "What tasks are pending?",
  "What did we agree on?",
  "What problems remain unresolved?",
  "What is the most important information?",
];

export function ResultWorkspace({
  record,
  onBack,
  onRecordUpdated,
}: ResultWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>("overview");
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(null);
  const [showTranscript, setShowTranscript] = useState(true);
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [speakerFilter, setSpeakerFilter] = useState("ALL");
  const [hideNoise, setHideNoise] = useState(false);
  const [entityTypeFilter, setEntityTypeFilter] = useState("ALL");

  // Bookmark, Copy, Export, Mode switch states
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Inline Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(
    record.structuredResult.conversation_title
  );
  const [editOverview, setEditOverview] = useState(
    record.structuredResult.overview
  );
  const [editConclusion, setEditConclusion] = useState(
    record.structuredResult.conclusion
  );
  const [editActions, setEditActions] = useState<ExtractedActionItem[]>(
    record.structuredResult.action_items
  );
  const [savingEdit, setSavingEdit] = useState(false);

  // Follow-up QA states
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [questionInput, setQuestionInput] = useState("");
  const [askingFollowUp, setAskingFollowUp] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const resetEditFields = () => {
    setEditTitle(record.structuredResult.conversation_title);
    setEditOverview(record.structuredResult.overview);
    setEditConclusion(record.structuredResult.conclusion);
    setEditActions(record.structuredResult.action_items);
  };

  const handleToggleEditing = () => {
    if (!isEditing) {
      resetEditFields();
    }
    setIsEditing((v) => !v);
  };

  // Load persisted follow-up Q&A history for this summary
  useEffect(() => {
    let active = true;
    fetch(`/api/analyses/${record.summaryId}`)
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data.followUps)) {
          setFollowUps(data.followUps);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [record.summaryId]);

  const handleLocateMessage = (msgId: number) => {
    setShowTranscript(true);
    setHideNoise(false);
    setSpeakerFilter("ALL");
    setTranscriptSearch("");
    setHighlightedMsgId(msgId);
    setTimeout(() => {
      const el = messageRefs.current[msgId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 80);
  };

  const handleToggleSave = async () => {
    setSavingBookmark(true);
    try {
      const res = await fetch(`/api/analyses/${record.summaryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSaved: !record.isSaved }),
      });
      const data = await res.json();
      if (res.ok && data.analysis) {
        onRecordUpdated(data.analysis);
      }
    } finally {
      setSavingBookmark(false);
    }
  };

  const handleModeRegenerate = async (newMode: SummaryMode) => {
    if (newMode === record.mode) return;
    setModeError(null);
    setSwitchingMode(true);
    try {
      const res = await fetch(`/api/analyses/${record.summaryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          regenerateMode: newMode,
          analysisEngine: record.providerUsed.includes("Hybrid NLP Engine")
            ? "local"
            : "ai",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.analysis) {
        setModeError(data.error || "Failed to regenerate this analysis.");
        return;
      }
      onRecordUpdated(data.analysis);
      setIsEditing(false);
    } catch {
      setModeError("Network error while regenerating this analysis.");
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleSaveEdits = async () => {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/analyses/${record.summaryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editedResult: {
            conversation_title: editTitle,
            overview: editOverview,
            conclusion: editConclusion,
            action_items: editActions,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.analysis) {
        onRecordUpdated(data.analysis);
        setIsEditing(false);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCopyBrief = async () => {
    const text = formatSummaryAsPlainText(record);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = async (fmt: "pdf" | "docx" | "txt" | "json") => {
    setExportOpen(false);
    if (fmt === "pdf") exportAsPdf(record);
    else if (fmt === "docx") await exportAsDocx(record);
    else if (fmt === "txt") exportAsTxt(record);
    else exportAsJson(record);

    fetch(`/api/analyses/${record.summaryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logExportFormat: fmt }),
    }).catch(() => {});
  };

  const submitFollowUpQuestion = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || askingFollowUp) return;
    setQaError(null);
    setAskingFollowUp(true);
    setActiveTab("followup");
    try {
      const res = await fetch(`/api/analyses/${record.summaryId}/followup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          analysisEngine: record.providerUsed.includes("Hybrid NLP Engine")
            ? "local"
            : "ai",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.followUp) {
        setQaError(data.error || "Failed to process follow-up question.");
      } else {
        setFollowUps((prev) => [...prev, data.followUp]);
        setQuestionInput("");
      }
    } catch {
      setQaError("Network error while querying follow-up assistant.");
    } finally {
      setAskingFollowUp(false);
    }
  };

  const r = record.structuredResult;

  const filteredMessages = useMemo(() => {
    const q = transcriptSearch.trim().toLowerCase();
    return record.parsedMessages.filter((m) => {
      if (hideNoise && (m.isGreetingOrNoise || m.isDuplicate)) return false;
      if (speakerFilter !== "ALL" && m.speaker !== speakerFilter) return false;
      if (
        q &&
        !m.content.toLowerCase().includes(q) &&
        !m.speaker.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [record.parsedMessages, hideNoise, speakerFilter, transcriptSearch]);

  const filteredEntities = useMemo(() => {
    if (entityTypeFilter === "ALL") return r.important_entities;
    return r.important_entities.filter((e) => e.type === entityTypeFilter);
  }, [r.important_entities, entityTypeFilter]);

  const tabs: Array<{ id: ResultTab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "key_points", label: "Key Points", count: r.key_points.length },
    { id: "decisions", label: "Decisions", count: r.important_decisions.length },
    { id: "actions", label: "Action Items", count: r.action_items.length },
    { id: "deadlines", label: "Deadlines", count: r.deadlines.length },
    {
      id: "issues",
      label: "Issues & Risks",
      count: r.problems.length + r.risks.length,
    },
    {
      id: "questions",
      label: "Unresolved Qs",
      count: r.unresolved_questions.length,
    },
    { id: "entities", label: "Entities", count: r.important_entities.length },
    {
      id: "timeline",
      label: "Timeline",
      count: r.conversation_timeline.length,
    },
    { id: "followup", label: "AI Follow-up", count: followUps.length },
  ];

  return (
    <div className="space-y-5">
      {/* Top Result Header */}
      <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <ImportanceBadge level={record.overallImportance} />
              <SourceTypeBadge type={record.sourceType} />
              <ModeBadge mode={record.mode} />
              <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                {record.detectedLanguage}
              </span>
              {record.isEdited && (
                <span className="rounded-md bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  Edited
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {r.conversation_title}
            </h1>

            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Engine: {record.providerUsed} •{" "}
              {record.processingStats.chunks_processed} chunk(s) processed in{" "}
              {record.processingStats.processing_time_ms}ms •{" "}
              {new Date(record.updatedAt).toLocaleString()}
            </p>
          </div>

          {modeError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
            >
              {modeError}
            </div>
          )}

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Re-summarize Mode Switcher */}
            <div className="relative inline-flex items-center">
              {switchingMode && (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-500 mr-1.5" />
              )}
              <select
                value={record.mode}
                disabled={switchingMode}
                onChange={(e) =>
                  handleModeRegenerate(e.target.value as SummaryMode)
                }
                aria-label="Switch summarization mode"
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:border-indigo-500 focus:outline-none cursor-pointer"
              >
                {(Object.keys(SUMMARY_MODE_META) as SummaryMode[]).map((m) => (
                  <option key={m} value={m}>
                    Mode: {SUMMARY_MODE_META[m].label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleToggleEditing}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                isEditing
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" />
              {isEditing ? "Cancel Edit" : "Edit Summary"}
            </button>

            <button
              type="button"
              disabled={savingBookmark}
              onClick={handleToggleSave}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                record.isSaved
                  ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
            >
              {record.isSaved ? (
                <>
                  <BookmarkCheck className="h-3.5 w-3.5" />
                  Saved
                </>
              ) : (
                <>
                  <Bookmark className="h-3.5 w-3.5" />
                  Save
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyBrief}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>

            {/* Export Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>

              {exportOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl py-1.5 z-30">
                  <button
                    type="button"
                    onClick={() => handleExport("pdf")}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5 text-rose-500" />
                    Export as PDF (.pdf)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("docx")}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-blue-500" />
                    Export as Word (.docx)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("txt")}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5 text-slate-500" />
                    Export as Text (.txt)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport("json")}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <FileCode2 className="h-3.5 w-3.5 text-emerald-500" />
                    Structured JSON (.json)
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowTranscript((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {showTranscript ? "Hide Source" : "Show Source"}
            </button>
          </div>
        </div>

        {/* 7-Metric Conversation Statistics Ribbon */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2.5 border border-slate-200/60 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Total Messages
            </p>
            <p className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {record.messageCount}
            </p>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              {record.noiseFilteredPercent}% noise removed
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2.5 border border-slate-200/60 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Participants
            </p>
            <p className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {record.participantCount}
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              {record.participants.join(", ")}
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2.5 border border-slate-200/60 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Est. Reading Time
            </p>
            <p className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {record.estimatedReadingMinutes} min
            </p>
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400">
              {record.wordCount.toLocaleString()} words
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2.5 border border-slate-200/60 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Key Points
            </p>
            <p className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
              {r.key_points.length}
            </p>
            <p className="text-[10px] text-slate-500">Facts & insights</p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2.5 border border-slate-200/60 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Decisions Detected
            </p>
            <p className="text-base font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
              {r.important_decisions.length}
            </p>
            <p className="text-[10px] text-slate-500">Grounded agreements</p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2.5 border border-slate-200/60 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Action Items
            </p>
            <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {r.action_items.length}
            </p>
            <p className="text-[10px] text-slate-500">
              {r.deadlines.length} stated deadline(s)
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2.5 border border-slate-200/60 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Open Qs & Risks
            </p>
            <p className="text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              {r.unresolved_questions.length + r.risks.length}
            </p>
            <p className="text-[10px] text-slate-500">
              {r.unresolved_questions.length} unanswered
            </p>
          </div>
        </div>
      </div>

      {/* Inline Summary Editor Drawer */}
      {isEditing && (
        <div className="rounded-2xl bg-white dark:bg-[#111827] border-2 border-indigo-500/60 p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-indigo-500" />
              Edit Generated Summary & Action Items
            </h2>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Summary Title
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Executive Overview
            </label>
            <textarea
              rows={3}
              value={editOverview}
              onChange={(e) => setEditOverview(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs leading-relaxed text-slate-900 dark:text-white"
            />
          </div>

          {editActions.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Action Items (Leave Owner / Deadline empty to keep &quot;Not specified&quot;)
              </label>
              {editActions.map((act, idx) => (
                <div
                  key={act.id}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 rounded-xl bg-slate-50 dark:bg-slate-900/70 p-2.5 border border-slate-200 dark:border-slate-800"
                >
                  <input
                    type="text"
                    value={act.task}
                    onChange={(e) => {
                      const copy = [...editActions];
                      copy[idx] = { ...copy[idx], task: e.target.value };
                      setEditActions(copy);
                    }}
                    className="sm:col-span-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                    placeholder="Task description"
                  />
                  <input
                    type="text"
                    value={act.assigned_to || ""}
                    onChange={(e) => {
                      const copy = [...editActions];
                      copy[idx] = {
                        ...copy[idx],
                        assigned_to: e.target.value.trim() || null,
                      };
                      setEditActions(copy);
                    }}
                    className="sm:col-span-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                    placeholder="Owner (Not specified)"
                  />
                  <input
                    type="text"
                    value={act.deadline || ""}
                    onChange={(e) => {
                      const copy = [...editActions];
                      copy[idx] = {
                        ...copy[idx],
                        deadline: e.target.value.trim() || null,
                      };
                      setEditActions(copy);
                    }}
                    className="sm:col-span-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                    placeholder="Deadline (Not specified)"
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Conclusion
            </label>
            <textarea
              rows={2}
              value={editConclusion}
              onChange={(e) => setEditConclusion(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingEdit}
              onClick={handleSaveEdits}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-semibold text-white cursor-pointer"
            >
              {savingEdit ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Main Split Workspace: Left Intelligence Tabs + Right Source Traceability Transcript */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT INTELLIGENCE PANEL */}
        <div
          className={`${
            showTranscript ? "xl:col-span-7" : "xl:col-span-12"
          } space-y-4`}
        >
          {/* Section Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {tabs.map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    active
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {t.label}
                  {typeof t.count === "number" && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        active
                          ? "bg-white/20 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Executive Overview Card */}
              <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    {SUMMARY_MODE_META[record.mode]?.label || "Summary"}
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                    {record.lengthPreference} depth
                  </span>
                </div>

                <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                  {r.overview}
                </p>

                {r.mode_bullets && r.mode_bullets.length > 0 && (
                  <ul className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {r.mode_bullets.map((b, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3 border border-slate-200/70 dark:border-slate-800">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Main Topic & Purpose
                    </p>
                    <p className="text-xs text-slate-800 dark:text-slate-200 mt-1 font-medium">
                      {r.main_topic}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      {r.purpose}
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3 border border-slate-200/70 dark:border-slate-800">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Historical Context Referenced
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                      {r.historical_context}
                    </p>
                  </div>
                </div>
              </div>

              {/* Context Preservation Chains */}
              {r.context_chains && r.context_chains.length > 0 && (
                <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-xs">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Cross-Conversation Context Preservation Arcs
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Connects early problem introductions with middle proposals and late final decisions across the thread:
                  </p>
                  <div className="space-y-2.5">
                    {r.context_chains.map((chain, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-500/10 p-3 space-y-2"
                      >
                        <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                          {chain.arc_summary}
                        </p>
                        <CitationChips
                          messageIds={Array.from(
                            new Set(
                              [
                                chain.early_message_id,
                                chain.middle_message_id,
                                chain.final_message_id,
                              ].filter((x): x is number => typeof x === "number")
                            )
                          )}
                          onSelectMessage={handleLocateMessage}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sentiment & Topic Clusters Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Sentiment & Tone */}
                <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-xs">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Sentiment & Discussion Tone
                  </h3>
                  <div className="inline-flex items-center rounded-lg bg-indigo-50 dark:bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    {r.sentiment.overall_tone}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {r.sentiment.tone_progression}
                  </p>

                  {/* Polarity Bar */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        style={{
                          width: `${r.sentiment.polarity_breakdown.positive}%`,
                        }}
                        className="bg-emerald-500"
                      />
                      <div
                        style={{
                          width: `${r.sentiment.polarity_breakdown.neutral}%`,
                        }}
                        className="bg-slate-400 dark:bg-slate-600"
                      />
                      <div
                        style={{
                          width: `${r.sentiment.polarity_breakdown.concerned}%`,
                        }}
                        className="bg-amber-500"
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        Positive {r.sentiment.polarity_breakdown.positive}%
                      </span>
                      <span>
                        Neutral {r.sentiment.polarity_breakdown.neutral}%
                      </span>
                      <span>
                        Urgent/Concern {r.sentiment.polarity_breakdown.concerned}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Topic Clusters */}
                <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-xs">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-indigo-500" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Topic Clustering
                    </h3>
                  </div>
                  {r.topic_clusters.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      Single-topic brief exchange.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {r.topic_clusters.map((tc, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {tc.topic}
                            </span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {tc.message_count} msgs ({tc.share_percent}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              style={{ width: `${tc.share_percent}%` }}
                              className="h-full rounded-full bg-indigo-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Conclusion */}
              <div className="rounded-2xl bg-slate-900 dark:bg-indigo-950/40 border border-slate-800 dark:border-indigo-500/30 p-4 text-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                  Conclusion
                </p>
                <p className="text-xs leading-relaxed mt-1 text-slate-200">
                  {r.conclusion}
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: KEY POINTS */}
          {activeTab === "key_points" && (
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Extracted Key Points (Fact vs. Opinion vs. Assumption)
              </h2>
              {r.key_points.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No distinct key points identified.
                </p>
              ) : (
                <div className="space-y-3">
                  {r.key_points.map((kp) => (
                    <div
                      key={kp.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3.5 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ImportanceBadge level={kp.importance} size="xs" />
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              kp.statement_type === "fact"
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : kp.statement_type === "opinion"
                                  ? "bg-purple-500/15 text-purple-700 dark:text-purple-300"
                                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {kp.statement_type}
                          </span>
                          {kp.speaker && (
                            <span className="text-xs font-medium text-slate-500">
                              • {kp.speaker}
                            </span>
                          )}
                        </div>
                        <CitationChips
                          messageIds={kp.source_message_ids}
                          onSelectMessage={handleLocateMessage}
                        />
                      </div>
                      <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                        {kp.point}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DECISIONS */}
          {activeTab === "decisions" && (
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Important Decisions Made
              </h2>
              {r.important_decisions.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  No formal decisions were explicitly stated in the source conversation.
                </p>
              ) : (
                <div className="space-y-3">
                  {r.important_decisions.map((dec) => (
                    <div
                      key={dec.id}
                      className="rounded-xl border border-indigo-200/70 dark:border-indigo-500/25 bg-indigo-50/30 dark:bg-indigo-500/10 p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          <ImportanceBadge level={dec.importance} size="xs" />
                          {dec.decided_by && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              Confirmed by {dec.decided_by}
                            </span>
                          )}
                        </div>
                        <CitationChips
                          messageIds={dec.source_message_ids}
                          onSelectMessage={handleLocateMessage}
                        />
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed">
                        {dec.decision}
                      </p>
                      {dec.superseded_context && (
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/25 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                          <strong>Context Update:</strong> {dec.superseded_context}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ACTION ITEMS */}
          {activeTab === "actions" && (
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Action Items & Assigned Responsibilities
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Zero-hallucination policy: unspecified fields marked &quot;Not specified&quot;
                </span>
              </div>

              {r.action_items.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  No explicit action items or tasks were stated in the conversation.
                </p>
              ) : (
                <div className="space-y-3">
                  {r.action_items.map((act) => (
                    <div
                      key={act.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <ImportanceBadge level={act.importance} size="xs" />
                        <CitationChips
                          messageIds={act.source_message_ids}
                          onSelectMessage={handleLocateMessage}
                        />
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {act.task}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                        <div className="rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 px-2.5 py-1.5">
                          <span className="text-slate-400 block text-[10px] uppercase">
                            Assigned To
                          </span>
                          <span
                            className={`font-semibold ${
                              act.assigned_to
                                ? "text-slate-800 dark:text-slate-100"
                                : "text-slate-400 italic"
                            }`}
                          >
                            {act.assigned_to || "Not specified"}
                          </span>
                        </div>
                        <div className="rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 px-2.5 py-1.5">
                          <span className="text-slate-400 block text-[10px] uppercase">
                            Deadline
                          </span>
                          <span
                            className={`font-semibold ${
                              act.deadline
                                ? "text-indigo-600 dark:text-indigo-300"
                                : "text-slate-400 italic"
                            }`}
                          >
                            {act.deadline || "Not specified"}
                          </span>
                        </div>
                        <div className="rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 px-2.5 py-1.5">
                          <span className="text-slate-400 block text-[10px] uppercase">
                            Status
                          </span>
                          <span className="font-semibold capitalize text-slate-700 dark:text-slate-200">
                            {act.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DEADLINES */}
          {activeTab === "deadlines" && (
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Deadlines & Important Dates
              </h2>
              {r.deadlines.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  Not specified — no explicit dates or deadlines were mentioned in the conversation.
                </p>
              ) : (
                <div className="space-y-3">
                  {r.deadlines.map((dl) => (
                    <div
                      key={dl.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3.5"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-bold text-amber-800 dark:text-amber-300">
                            <CalendarClock className="h-3.5 w-3.5" />
                            {dl.date_expression}
                          </span>
                          <ImportanceBadge level={dl.importance} size="xs" />
                        </div>
                        <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                          {dl.milestone}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Responsible: {dl.owner || "Not specified"}
                        </p>
                      </div>
                      <CitationChips
                        messageIds={dl.source_message_ids}
                        onSelectMessage={handleLocateMessage}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: PROBLEMS, SOLUTIONS & RISKS */}
          {activeTab === "issues" && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-xs">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Problems & Proposed Solutions
                </h2>
                {r.problems.length === 0 && r.proposed_solutions.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No explicit problems or troubleshooting proposals detected.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {r.problems.map((prob) => (
                      <div
                        key={prob.id}
                        className="rounded-xl border border-rose-200/70 dark:border-rose-500/25 bg-rose-50/30 dark:bg-rose-500/10 p-3.5 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-rose-500" />
                            <ImportanceBadge level={prob.importance} size="xs" />
                            <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300">
                              {prob.resolution_status}
                            </span>
                          </div>
                          <CitationChips
                            messageIds={prob.source_message_ids}
                            onSelectMessage={handleLocateMessage}
                          />
                        </div>
                        <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                          {prob.problem}
                        </p>
                      </div>
                    ))}

                    {r.proposed_solutions.map((sol) => (
                      <div
                        key={sol.id}
                        className="rounded-xl border border-emerald-200/70 dark:border-emerald-500/25 bg-emerald-50/30 dark:bg-emerald-500/10 p-3.5 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                              Solution ({sol.outcome})
                            </span>
                            {sol.proposed_by && (
                              <span className="text-xs text-slate-500">
                                by {sol.proposed_by}
                              </span>
                            )}
                          </div>
                          <CitationChips
                            messageIds={sol.source_message_ids}
                            onSelectMessage={handleLocateMessage}
                          />
                        </div>
                        <p className="text-xs sm:text-sm text-slate-900 dark:text-white">
                          {sol.solution}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Risks */}
              <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-xs">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  Identified Risks & Blockers
                </h2>
                {r.risks.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No additional operational risks flagged.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {r.risks.map((rk) => (
                      <div
                        key={rk.id}
                        className="rounded-xl border border-amber-200/70 dark:border-amber-500/25 bg-amber-50/30 dark:bg-amber-500/10 p-3.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <ImportanceBadge level={rk.importance} size="xs" />
                          <CitationChips
                            messageIds={rk.source_message_ids}
                            onSelectMessage={handleLocateMessage}
                          />
                        </div>
                        <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                          {rk.risk}
                        </p>
                        {rk.mitigation && (
                          <p className="text-xs text-emerald-700 dark:text-emerald-300">
                            Mitigation discussed: {rk.mitigation}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: UNRESOLVED QUESTIONS */}
          {activeTab === "questions" && (
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Questions Remaining Unanswered
              </h2>
              {r.unresolved_questions.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  All questions raised during the conversation were addressed in subsequent turns.
                </p>
              ) : (
                <div className="space-y-3">
                  {r.unresolved_questions.map((q) => (
                    <div
                      key={q.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <HelpCircle className="h-4 w-4 text-amber-500" />
                          <ImportanceBadge level={q.importance} size="xs" />
                          <span className="text-xs text-slate-500">
                            Asked by: {q.asked_by || "Not specified"}
                          </span>
                        </div>
                        <CitationChips
                          messageIds={q.source_message_ids}
                          onSelectMessage={handleLocateMessage}
                        />
                      </div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {q.question}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 8: IMPORTANT ENTITIES */}
          {activeTab === "entities" && (
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Important Names, Organizations & Technical Terms
                </h2>
                <div className="flex flex-wrap gap-1">
                  {[
                    "ALL",
                    "Person",
                    "Organization",
                    "Technology",
                    "Metric / Term",
                  ].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setEntityTypeFilter(type)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${
                        entityTypeFilter === type
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {filteredEntities.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No entities found in this category.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredEntities.map((ent, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
                          <Tag className="h-3.5 w-3.5 text-indigo-500" />
                          {ent.name}
                        </span>
                        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                          {ent.mentions}x
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-slate-500">
                        {ent.type}
                      </p>
                      <CitationChips
                        messageIds={ent.source_message_ids}
                        onSelectMessage={handleLocateMessage}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 9: CONVERSATION TIMELINE */}
          {activeTab === "timeline" && (
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Chronological Conversation Timeline
              </h2>
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-200 dark:before:bg-indigo-500/30">
                {r.conversation_timeline.map((ev) => (
                  <div
                    key={ev.id}
                    className="relative rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3.5 space-y-1.5"
                  >
                    <span className="absolute -left-[22px] top-4 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 bg-indigo-600" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                          {ev.phase}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {ev.timestamp_label}
                        </span>
                      </div>
                      <CitationChips
                        messageIds={ev.source_message_ids}
                        onSelectMessage={handleLocateMessage}
                      />
                    </div>
                    <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                      {ev.event}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 10: AI FOLLOW-UP QUESTIONS */}
          {activeTab === "followup" && (
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-xs">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  Grounded AI Follow-Up Questions
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Ask anything about this conversation. Answers are strictly grounded in source messages with clickable citations.
                </p>
              </div>

              {/* Preset Question Chips */}
              <div className="flex flex-wrap gap-1.5">
                {PRESET_FOLLOWUP_QUESTIONS.map((pq) => (
                  <button
                    key={pq}
                    type="button"
                    disabled={askingFollowUp}
                    onClick={() => submitFollowUpQuestion(pq)}
                    className="rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 px-2.5 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 transition-colors cursor-pointer"
                  >
                    {pq}
                  </button>
                ))}
              </div>

              {qaError && (
                <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-3 text-xs text-rose-700 dark:text-rose-300">
                  {qaError}
                </div>
              )}

              {/* Q&A Stream */}
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {followUps.length === 0 && !askingFollowUp && (
                  <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500">
                    Select one of the suggested questions above or type a custom question below.
                  </div>
                )}

                {followUps.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-4 space-y-2.5"
                  >
                    <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                      Q: {item.question}
                    </p>
                    <p className="text-xs sm:text-sm whitespace-pre-line text-slate-800 dark:text-slate-200 leading-relaxed">
                      {item.answer}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                        {item.confidence} • {item.providerUsed}
                      </span>
                      <CitationChips
                        messageIds={item.citedMessageIds}
                        onSelectMessage={handleLocateMessage}
                      />
                    </div>
                  </div>
                ))}

                {askingFollowUp && (
                  <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-900 p-3 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                    Verifying transcript evidence...
                  </div>
                )}
              </div>

              {/* Input Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitFollowUpQuestion(questionInput);
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  placeholder="Ask a follow-up question about decisions, tasks, deadlines, or technical details..."
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={askingFollowUp || !questionInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2.5 text-xs font-semibold text-white cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  Ask
                </button>
              </form>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: ORIGINAL CONVERSATION & SOURCE TRACEABILITY */}
        {showTranscript && (
          <div className="xl:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden sticky top-4">
            <div className="border-b border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/70 dark:bg-slate-900/40">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-indigo-500" />
                  Source Traceability Transcript
                </h3>
                <span className="font-mono text-[11px] text-slate-500">
                  {filteredMessages.length} / {record.parsedMessages.length} turns
                </span>
              </div>

              {/* Search & Speaker Filter */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    placeholder="Search within conversation..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="relative">
                  <Users className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <select
                    value={speakerFilter}
                    onChange={(e) => setSpeakerFilter(e.target.value)}
                    aria-label="Filter by speaker"
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="ALL">All Speakers</option>
                    {record.participants.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideNoise}
                  onChange={(e) => setHideNoise(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <Filter className="h-3 w-3" />
                Hide greetings, fillers & duplicate messages (
                {record.duplicateCount +
                  record.processingStats.greetings_and_filler_removed}
                )
              </label>
            </div>

            <div className="max-h-[640px] overflow-y-auto p-3.5 space-y-2.5">
              {filteredMessages.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-8">
                  No messages match your search filter.
                </p>
              ) : (
                filteredMessages.map((msg) => {
                  const isHighlighted = highlightedMsgId === msg.id;
                  const isFilteredNoise =
                    msg.isGreetingOrNoise || msg.isDuplicate;
                  return (
                    <div
                      key={msg.id}
                      ref={(el) => {
                        messageRefs.current[msg.id] = el;
                      }}
                      className={`rounded-xl border p-3 transition-all ${
                        isHighlighted
                          ? "border-indigo-500 bg-indigo-50/90 dark:bg-indigo-500/20 ring-2 ring-indigo-500/40 citation-pulse"
                          : isFilteredNoise
                            ? "border-slate-200/60 dark:border-slate-800/60 bg-slate-50/30 dark:bg-slate-900/25 opacity-60"
                            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300">
                            #{msg.id}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {msg.speaker}
                          </span>
                          {msg.timestamp && (
                            <span className="font-mono text-[10px] text-slate-400">
                              {msg.timestamp}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {msg.isDuplicate && (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                              Duplicate of #{msg.duplicateOfId}
                            </span>
                          )}
                          {msg.isGreetingOrNoise && !msg.isDuplicate && (
                            <span className="rounded bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
                              Greeting/Noise Filtered
                            </span>
                          )}
                          {!isFilteredNoise &&
                            (msg.importanceLevel === "Critical" ||
                              msg.importanceLevel === "High Importance") && (
                              <ImportanceBadge
                                level={msg.importanceLevel}
                                size="xs"
                              />
                            )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
