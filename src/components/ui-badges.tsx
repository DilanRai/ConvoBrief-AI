"use client";

import React from "react";
import { ArrowUpRight } from "lucide-react";
import type {
  ConversationSourceType,
  ImportanceLevel,
  SummaryMode,
} from "@/types/convobrief";

export function ImportanceBadge({
  level,
  size = "sm",
}: {
  level: ImportanceLevel;
  size?: "xs" | "sm";
}) {
  const styles: Record<ImportanceLevel, string> = {
    Critical:
      "bg-rose-500/12 text-rose-700 border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
    "High Importance":
      "bg-amber-500/12 text-amber-800 border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    "Medium Importance":
      "bg-indigo-500/10 text-indigo-700 border-indigo-500/25 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "Low Importance":
      "bg-slate-500/10 text-slate-600 border-slate-400/25 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  };

  const dotStyles: Record<ImportanceLevel, string> = {
    Critical: "bg-rose-500",
    "High Importance": "bg-amber-500",
    "Medium Importance": "bg-indigo-500",
    "Low Importance": "bg-slate-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap ${
        size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs"
      } ${styles[level] || styles["Medium Importance"]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          dotStyles[level] || dotStyles["Medium Importance"]
        }`}
      />
      {level}
    </span>
  );
}

const SOURCE_LABELS: Record<ConversationSourceType, string> = {
  chatgpt: "ChatGPT",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  email: "Email Thread",
  support: "Support Chat",
  meeting: "Meeting Transcript",
  plain_text: "Plain Text",
  file_upload: "Uploaded Document",
};

export function SourceTypeBadge({ type }: { type: ConversationSourceType }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300">
      {SOURCE_LABELS[type] || "Conversation"}
    </span>
  );
}

export const SUMMARY_MODE_META: Record<
  SummaryMode,
  { label: string; shortDesc: string }
> = {
  quick: {
    label: "Quick Summary",
    shortDesc: "Concise 3–5 bullet overview of core takeaways",
  },
  detailed: {
    label: "Detailed Summary",
    shortDesc: "Comprehensive structured synthesis preserving context",
  },
  executive: {
    label: "Executive Summary",
    shortDesc: "High-level outcomes, strategic risks & decisions",
  },
  technical: {
    label: "Technical Summary",
    shortDesc: "Stack components, errors, root causes & engineering fixes",
  },
  meeting: {
    label: "Meeting Summary",
    shortDesc: "Attendees, discussion themes, agreements & follow-ups",
  },
  action: {
    label: "Action-Oriented",
    shortDesc: "Focused strictly on tasks, owners & stated deadlines",
  },
};

export function ModeBadge({ mode }: { mode: SummaryMode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200/80 dark:border-indigo-500/30 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
      {SUMMARY_MODE_META[mode]?.label || mode}
    </span>
  );
}

export function CitationChips({
  messageIds,
  onSelectMessage,
}: {
  messageIds: number[];
  onSelectMessage: (msgId: number) => void;
}) {
  if (!messageIds || messageIds.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {messageIds.slice(0, 4).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelectMessage(id)}
          title={`Locate supporting original message #${id}`}
          className="inline-flex items-center gap-0.5 rounded bg-slate-100 hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-indigo-500/25 border border-slate-200/90 dark:border-slate-700 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-600 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-300 transition-colors cursor-pointer"
        >
          Msg #{id}
          <ArrowUpRight className="h-2.5 w-2.5 opacity-75" />
        </button>
      ))}
    </span>
  );
}
