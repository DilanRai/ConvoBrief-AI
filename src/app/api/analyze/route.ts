import { NextResponse } from "next/server";
import { db } from "@/db";
import { activityLogs, conversations, summaries } from "@/db/schema";
import { getAuthenticatedUserRow } from "@/lib/auth";
import { toAnalysisRecordDTO } from "@/lib/dto";
import {
  analyzeConversationWithIntelligence,
  ExternalProviderError,
} from "@/lib/llm-provider";
import { parseConversation } from "@/lib/parser";
import {
  decryptApiKeyMap,
  sanitizeConversationTranscript,
  sanitizeCustomInstructions,
  validateConversationText,
  ZERO_RETENTION_PLACEHOLDER,
} from "@/lib/security";
import type {
  ConversationSourceType,
  LLMProviderType,
  SummaryLength,
  SummaryMode,
} from "@/types/convobrief";

export const dynamic = "force-dynamic";

const VALID_MODES: SummaryMode[] = [
  "quick",
  "detailed",
  "executive",
  "technical",
  "meeting",
  "action",
];
const VALID_LENGTHS: SummaryLength[] = [
  "concise",
  "balanced",
  "comprehensive",
];
const VALID_SOURCE_TYPES: ConversationSourceType[] = [
  "chatgpt",
  "whatsapp",
  "telegram",
  "email",
  "support",
  "meeting",
  "plain_text",
  "file_upload",
];

export async function POST(req: Request) {
  try {
    const userRow = await getAuthenticatedUserRow();
    if (!userRow) {
      return NextResponse.json(
        { error: "Please sign in to analyze conversations." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validation = validateConversationText(body.content);
    if (!validation.valid || !validation.text) {
      return NextResponse.json(
        { error: validation.error || "Invalid conversation input." },
        { status: 400 }
      );
    }

    const mode: SummaryMode = VALID_MODES.includes(body.mode)
      ? body.mode
      : "detailed";
    const lengthPreference: SummaryLength = VALID_LENGTHS.includes(
      body.lengthPreference
    )
      ? body.lengthPreference
      : "balanced";
    const customInstructions = sanitizeCustomInstructions(
      body.customInstructions
    );
    const hintSource = VALID_SOURCE_TYPES.includes(body.sourceType)
      ? (body.sourceType as ConversationSourceType)
      : undefined;
    const fileName =
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim().slice(0, 160)
        : null;
    const customTitle =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 140)
        : "";

    const sanitized = sanitizeConversationTranscript(validation.text);
    const bundle = parseConversation(sanitized.sanitizedText, hintSource);

    const userKeys = decryptApiKeyMap(userRow.encryptedApiKeys);
    const analysisEngine =
      body.analysisEngine === "local" || body.analysisEngine === "ai"
        ? body.analysisEngine
        : undefined;
    const requestedProvider =
      typeof body.provider === "string" &&
      [
        "auto",
        "local",
        "openai",
        "anthropic",
        "gemini",
        "groq",
        "nvidia",
        "custom",
      ].includes(body.provider)
        ? (body.provider as LLMProviderType)
        : undefined;
    const providerPreference: LLMProviderType =
      analysisEngine === "local"
        ? "local"
        : analysisEngine === "ai"
          ? requestedProvider && requestedProvider !== "local"
            ? requestedProvider
            : userRow.preferredProvider === "local"
              ? "auto"
              : (userRow.preferredProvider as LLMProviderType) || "auto"
          : requestedProvider ||
            (userRow.preferredProvider as LLMProviderType) ||
            "auto";

    const intelligence = await analyzeConversationWithIntelligence({
      bundle,
      mode,
      lengthPreference,
      customInstructions,
      injectionFlagsDetected: sanitized.injectionFlagsDetected,
      requireExternalProvider: analysisEngine === "ai",
      providerConfig: {
        preferredProvider: providerPreference,
        preferredModel: userRow.preferredModel,
        customBaseUrl: userRow.customBaseUrl,
        apiKeys: userKeys,
      },
    });

    const finalTitle =
      customTitle || intelligence.result.conversation_title || "Conversation Brief";
    intelligence.result.conversation_title = finalTitle;

    const storedRaw = userRow.privacyZeroRetention
      ? ZERO_RETENTION_PLACEHOLDER
      : sanitized.sanitizedText;

    const [conv] = await db
      .insert(conversations)
      .values({
        userId: userRow.id,
        title: finalTitle,
        sourceType: fileName ? "file_upload" : bundle.detectedSourceType,
        fileName,
        rawContent: storedRaw,
        parsedMessages: userRow.privacyZeroRetention ? [] : bundle.messages,
        detectedLanguage: bundle.detectedLanguage,
        participantCount: bundle.participants.length,
        participants: bundle.participants,
        messageCount: bundle.messages.length,
        wordCount: bundle.totalWords,
        estimatedReadingMinutes: bundle.estimatedReadingMinutes,
        duplicateCount: bundle.duplicateCount,
        noiseFilteredPercent: bundle.noiseFilteredPercent,
      })
      .returning();

    const [sum] = await db
      .insert(summaries)
      .values({
        conversationId: conv.id,
        userId: userRow.id,
        mode,
        lengthPreference,
        customInstructions,
        providerUsed: intelligence.providerUsed,
        overallImportance: intelligence.overallImportance,
        isSaved: false,
        isEdited: false,
        structuredResult: intelligence.result,
        processingStats: intelligence.stats,
      })
      .returning();

    await db.insert(activityLogs).values({
      userId: userRow.id,
      actionType: "analysis_created",
      title: `Analyzed "${finalTitle}" (${mode} mode)`,
      metadata: `${bundle.messages.length} msgs • ${bundle.participants.length} participants • ${intelligence.overallImportance}`,
      summaryId: sum.id,
      conversationId: conv.id,
    });

    // Even if Zero-Retention is active in DB, return messages in memory for current session review
    const dto = toAnalysisRecordDTO(
      {
        ...conv,
        rawContent: sanitized.sanitizedText,
        parsedMessages: bundle.messages,
      },
      sum
    );

    return NextResponse.json({
      ok: true,
      analysis: dto,
    });
  } catch (err) {
    console.error("POST /api/analyze error:", err);
    if (err instanceof ExternalProviderError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status }
      );
    }
    return NextResponse.json(
      { error: "Failed to analyze conversation. Please try again." },
      { status: 500 }
    );
  }
}
