export type SummaryMode =
  | "quick"
  | "detailed"
  | "executive"
  | "technical"
  | "meeting"
  | "action";

export type SummaryLength = "concise" | "balanced" | "comprehensive";

export type ImportanceLevel =
  | "Critical"
  | "High Importance"
  | "Medium Importance"
  | "Low Importance";

export type ConversationSourceType =
  | "chatgpt"
  | "whatsapp"
  | "telegram"
  | "email"
  | "support"
  | "meeting"
  | "plain_text"
  | "file_upload";

export type LLMProviderType =
  | "auto"
  | "local"
  | "openai"
  | "anthropic"
  | "gemini"
  | "groq"
  | "nvidia"
  | "custom";

export interface ParsedMessage {
  id: number; // 1-indexed message sequence number
  speaker: string;
  timestamp: string | null;
  content: string;
  normalizedContent: string;
  wordCount: number;
  isGreetingOrNoise: boolean;
  isDuplicate: boolean;
  duplicateOfId?: number;
  importanceScore: number;
  importanceLevel: ImportanceLevel;
}

export interface ExtractedKeyPoint {
  id: string;
  point: string;
  statement_type: "fact" | "opinion" | "assumption";
  importance: ImportanceLevel;
  speaker?: string;
  source_message_ids: number[];
}

export interface ExtractedDecision {
  id: string;
  decision: string;
  rationale: string;
  superseded_context?: string | null;
  decided_by: string | null;
  importance: ImportanceLevel;
  source_message_ids: number[];
}

export interface ExtractedActionItem {
  id: string;
  task: string;
  assigned_to: string | null; // null -> rendered as "Not specified"
  deadline: string | null; // null -> rendered as "Not specified"
  status: "not specified" | "pending" | "in progress" | "completed";
  importance: ImportanceLevel;
  source_message_ids: number[];
}

export interface ExtractedDeadline {
  id: string;
  date_expression: string;
  milestone: string;
  owner: string | null; // null -> rendered as "Not specified"
  importance: ImportanceLevel;
  source_message_ids: number[];
}

export interface ExtractedQuestion {
  id: string;
  question: string;
  asked_by: string | null;
  context: string;
  importance: ImportanceLevel;
  source_message_ids: number[];
}

export interface ExtractedProblem {
  id: string;
  problem: string;
  reported_by: string | null;
  importance: ImportanceLevel;
  linked_solution_ids: string[];
  resolution_status: "resolved" | "partially addressed" | "unresolved";
  source_message_ids: number[];
}

export interface ExtractedSolution {
  id: string;
  solution: string;
  proposed_by: string | null;
  addresses_problem: string;
  outcome: "adopted" | "under consideration" | "rejected";
  importance: ImportanceLevel;
  source_message_ids: number[];
}

export interface ExtractedEntity {
  name: string;
  type:
    | "Person"
    | "Organization"
    | "Technology"
    | "Project / Product"
    | "Metric / Term";
  mentions: number;
  context: string;
  importance: ImportanceLevel;
  source_message_ids: number[];
}

export interface TimelineEvent {
  id: string;
  phase: "Opening / Context" | "Problem & Investigation" | "Discussion & Proposals" | "Resolution & Decisions" | "Next Steps";
  timestamp_label: string;
  event: string;
  actor: string | null;
  importance: ImportanceLevel;
  source_message_ids: number[];
}

export interface ExtractedRisk {
  id: string;
  risk: string;
  impact: string;
  mitigation: string | null;
  importance: ImportanceLevel;
  source_message_ids: number[];
}

export interface TopicCluster {
  topic: string;
  keywords: string[];
  message_count: number;
  share_percent: number;
  importance: ImportanceLevel;
  source_message_ids: number[];
}

export interface SentimentAnalysis {
  overall_tone:
    | "Collaborative & Constructive"
    | "Urgent & Action-Focused"
    | "Analytical & Technical"
    | "Tense / Escalated"
    | "Informational & Neutral";
  polarity_breakdown: {
    positive: number;
    neutral: number;
    concerned: number;
  };
  tone_progression: string;
}

/**
 * Core AI Summarization Output Schema (Section 6 compliant + enriched metadata)
 */
export interface ConvoBriefStructuredResult {
  conversation_title: string;
  overview: string;
  mode_bullets: string[];
  main_topic: string;
  purpose: string;
  historical_context: string;
  key_points: ExtractedKeyPoint[];
  important_decisions: ExtractedDecision[];
  action_items: ExtractedActionItem[];
  deadlines: ExtractedDeadline[];
  unresolved_questions: ExtractedQuestion[];
  problems: ExtractedProblem[];
  proposed_solutions: ExtractedSolution[];
  important_entities: ExtractedEntity[];
  conversation_timeline: TimelineEvent[];
  risks: ExtractedRisk[];
  conclusion: string;
  topic_clusters: TopicCluster[];
  sentiment: SentimentAnalysis;
  detected_language: string;
  context_chains: Array<{
    arc_summary: string;
    early_message_id: number;
    middle_message_id?: number;
    final_message_id: number;
  }>;
}

export interface ProcessingStats {
  chunks_processed: number;
  overlap_window_messages: number;
  total_messages: number;
  substantive_messages: number;
  duplicates_removed: number;
  greetings_and_filler_removed: number;
  noise_reduction_percent: number;
  processing_time_ms: number;
  prompt_injection_flags_neutralized: number;
  engine_name: string;
  hierarchical_mode: boolean;
}

export interface AnalysisRecordDTO {
  summaryId: number;
  conversationId: number;
  title: string;
  sourceType: ConversationSourceType;
  fileName: string | null;
  detectedLanguage: string;
  participantCount: number;
  participants: string[];
  messageCount: number;
  wordCount: number;
  estimatedReadingMinutes: number;
  duplicateCount: number;
  noiseFilteredPercent: number;
  mode: SummaryMode;
  lengthPreference: SummaryLength;
  customInstructions: string;
  providerUsed: string;
  overallImportance: ImportanceLevel;
  isSaved: boolean;
  isEdited: boolean;
  structuredResult: ConvoBriefStructuredResult;
  processingStats: ProcessingStats;
  parsedMessages: ParsedMessage[];
  rawContent: string;
  createdAt: string;
  updatedAt: string;
}
