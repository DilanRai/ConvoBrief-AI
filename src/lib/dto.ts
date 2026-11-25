import type { conversations, summaries } from "@/db/schema";
import type {
  AnalysisRecordDTO,
  ConversationSourceType,
  ImportanceLevel,
  SummaryLength,
  SummaryMode,
} from "@/types/convobrief";

export function toAnalysisRecordDTO(
  conv: typeof conversations.$inferSelect,
  sum: typeof summaries.$inferSelect
): AnalysisRecordDTO {
  return {
    summaryId: sum.id,
    conversationId: conv.id,
    title: sum.structuredResult?.conversation_title || conv.title,
    sourceType: (conv.sourceType || "plain_text") as ConversationSourceType,
    fileName: conv.fileName,
    detectedLanguage: conv.detectedLanguage,
    participantCount: conv.participantCount,
    participants: conv.participants || [],
    messageCount: conv.messageCount,
    wordCount: conv.wordCount,
    estimatedReadingMinutes: conv.estimatedReadingMinutes,
    duplicateCount: conv.duplicateCount,
    noiseFilteredPercent: conv.noiseFilteredPercent,
    mode: (sum.mode || "detailed") as SummaryMode,
    lengthPreference: (sum.lengthPreference || "balanced") as SummaryLength,
    customInstructions: sum.customInstructions || "",
    providerUsed: sum.providerUsed,
    overallImportance: (sum.overallImportance ||
      "Medium Importance") as ImportanceLevel,
    isSaved: sum.isSaved,
    isEdited: sum.isEdited,
    structuredResult: sum.structuredResult,
    processingStats: sum.processingStats,
    parsedMessages: conv.parsedMessages || [],
    rawContent: conv.rawContent,
    createdAt: sum.createdAt.toISOString(),
    updatedAt: sum.updatedAt.toISOString(),
  };
}
