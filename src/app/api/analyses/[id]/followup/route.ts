import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLogs,
  conversations,
  followUpMessages,
  summaries,
} from "@/db/schema";
import { getAuthenticatedUserRow } from "@/lib/auth";
import {
  answerFollowUpWithIntelligence,
  ExternalProviderError,
} from "@/lib/llm-provider";
import { parseConversation } from "@/lib/parser";
import {
  decryptApiKeyMap,
  sanitizeCustomInstructions,
  ZERO_RETENTION_PLACEHOLDER,
} from "@/lib/security";
import type { ConversationSourceType, LLMProviderType } from "@/types/convobrief";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userRow = await getAuthenticatedUserRow();
    if (!userRow) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const summaryId = Number(id);
    if (!Number.isInteger(summaryId) || summaryId <= 0) {
      return NextResponse.json({ error: "Invalid summary ID." }, { status: 400 });
    }

    const body = await req.json();
    const rawQuestion = String(body.question || "").trim();
    const question = sanitizeCustomInstructions(rawQuestion);
    if (!question || question.length < 3) {
      return NextResponse.json(
        { error: "Please enter a valid follow-up question." },
        { status: 400 }
      );
    }

    const rows = await db
      .select({ conv: conversations, sum: summaries })
      .from(summaries)
      .innerJoin(conversations, eq(summaries.conversationId, conversations.id))
      .where(and(eq(summaries.id, summaryId), eq(summaries.userId, userRow.id)))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Analysis not found." },
        { status: 404 }
      );
    }

    const { conv, sum } = rows[0];
    const analysisEngine =
      body.analysisEngine === "local" || body.analysisEngine === "ai"
        ? body.analysisEngine
        : undefined;
    const messages =
      conv.parsedMessages && conv.parsedMessages.length > 0
        ? conv.parsedMessages
        : conv.rawContent === ZERO_RETENTION_PLACEHOLDER
          ? []
          : parseConversation(
              conv.rawContent,
              conv.sourceType as ConversationSourceType
            ).messages;

    const userKeys = decryptApiKeyMap(userRow.encryptedApiKeys);
    const qaResult = await answerFollowUpWithIntelligence({
      question,
      messages,
      structuredResult: sum.structuredResult,
      requireExternalProvider: analysisEngine === "ai",
      providerConfig: {
        preferredProvider:
          analysisEngine === "local"
            ? "local"
            : analysisEngine === "ai" &&
                userRow.preferredProvider === "local"
              ? "auto"
              : (userRow.preferredProvider as LLMProviderType),
        preferredModel: userRow.preferredModel,
        customBaseUrl: userRow.customBaseUrl,
        apiKeys: userKeys,
      },
    });

    const [savedMsg] = await db
      .insert(followUpMessages)
      .values({
        summaryId: sum.id,
        userId: userRow.id,
        question,
        answer: qaResult.answer,
        citedMessageIds: qaResult.citedMessageIds,
        confidence: qaResult.confidence,
        providerUsed: qaResult.providerUsed,
      })
      .returning();

    await db.insert(activityLogs).values({
      userId: userRow.id,
      actionType: "followup_asked",
      title: `Follow-up Q&A on "${conv.title}"`,
      metadata: question.slice(0, 100),
      summaryId: sum.id,
      conversationId: conv.id,
    });

    return NextResponse.json({
      ok: true,
      followUp: {
        id: savedMsg.id,
        question: savedMsg.question,
        answer: savedMsg.answer,
        citedMessageIds: savedMsg.citedMessageIds || [],
        confidence: savedMsg.confidence,
        providerUsed: savedMsg.providerUsed,
        createdAt: savedMsg.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error("POST /api/analyses/[id]/followup error:", err);
    if (err instanceof ExternalProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Failed to answer follow-up question." },
      { status: 500 }
    );
  }
}
