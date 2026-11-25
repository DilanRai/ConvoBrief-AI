import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLogs,
  conversations,
  followUpMessages,
  summaries,
} from "@/db/schema";
import { getAuthenticatedUserRow } from "@/lib/auth";
import { toAnalysisRecordDTO } from "@/lib/dto";
import {
  analyzeConversationWithIntelligence,
  ExternalProviderError,
} from "@/lib/llm-provider";
import { parseConversation } from "@/lib/parser";
import {
  decryptApiKeyMap,
  ZERO_RETENTION_PLACEHOLDER,
} from "@/lib/security";
import type {
  ConvoBriefStructuredResult,
  ConversationSourceType,
  ExtractedActionItem,
  ImportanceLevel,
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
const VALID_IMPORTANCE: ImportanceLevel[] = [
  "Critical",
  "High Importance",
  "Medium Importance",
  "Low Importance",
];
const VALID_ACTION_STATUS: ExtractedActionItem["status"][] = [
  "not specified",
  "pending",
  "in progress",
  "completed",
];

function normalizeActionItems(
  value: unknown,
  fallback: ExtractedActionItem[]
): ExtractedActionItem[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    )
    .map((item, index) => {
      const raw = item as Partial<ExtractedActionItem>;
      return {
        id:
          typeof raw.id === "string" && raw.id.trim()
            ? raw.id.slice(0, 80)
            : `manual-${index + 1}`,
        task: typeof raw.task === "string" ? raw.task.slice(0, 500) : "",
        assigned_to:
          typeof raw.assigned_to === "string"
            ? raw.assigned_to.slice(0, 120)
            : null,
        deadline:
          typeof raw.deadline === "string" ? raw.deadline.slice(0, 120) : null,
        status: VALID_ACTION_STATUS.includes(raw.status as ExtractedActionItem["status"])
          ? (raw.status as ExtractedActionItem["status"])
          : "not specified",
        importance: VALID_IMPORTANCE.includes(raw.importance as ImportanceLevel)
          ? (raw.importance as ImportanceLevel)
          : "Medium Importance",
        source_message_ids: Array.isArray(raw.source_message_ids)
          ? raw.source_message_ids.filter(
              (id): id is number => Number.isInteger(id) && id > 0
            )
          : [],
      };
    })
    .filter((item) => item.task.trim().length > 0);
}

export async function GET(
  _req: Request,
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

    const followUps = await db
      .select()
      .from(followUpMessages)
      .where(
        and(
          eq(followUpMessages.summaryId, summaryId),
          eq(followUpMessages.userId, userRow.id)
        )
      )
      .orderBy(asc(followUpMessages.createdAt));

    return NextResponse.json({
      ok: true,
      analysis: toAnalysisRecordDTO(rows[0].conv, rows[0].sum),
      followUps: followUps.map((f) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
        citedMessageIds: f.citedMessageIds || [],
        confidence: f.confidence,
        providerUsed: f.providerUsed,
        createdAt: f.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("GET /api/analyses/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to load analysis." },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const body = await req.json();

    // 1. Log export audit event
    if (typeof body.logExportFormat === "string") {
      await db.insert(activityLogs).values({
        userId: userRow.id,
        actionType: "summary_exported",
        title: `Exported "${conv.title}" as ${body.logExportFormat.toUpperCase()}`,
        metadata: `${sum.mode} mode`,
        summaryId: sum.id,
        conversationId: conv.id,
      });
      return NextResponse.json({
        ok: true,
        analysis: toAnalysisRecordDTO(conv, sum),
      });
    }

    // 2. Regenerate summary in a new mode / length
    if (typeof body.regenerateMode === "string") {
      if (!VALID_MODES.includes(body.regenerateMode as SummaryMode)) {
        return NextResponse.json(
          { error: "Invalid summary mode requested." },
          { status: 400 }
        );
      }
      if (
        body.lengthPreference !== undefined &&
        !VALID_LENGTHS.includes(body.lengthPreference as SummaryLength)
      ) {
        return NextResponse.json(
          { error: "Invalid summary length requested." },
          { status: 400 }
        );
      }
      if (conv.rawContent === ZERO_RETENTION_PLACEHOLDER) {
        return NextResponse.json(
          {
            error:
              "This analysis was stored under zero-retention privacy, so its transcript is not available for regeneration.",
          },
          { status: 409 }
        );
      }

      const newMode = body.regenerateMode as SummaryMode;
      const newLength: SummaryLength = VALID_LENGTHS.includes(
        body.lengthPreference as SummaryLength
      )
        ? (body.lengthPreference as SummaryLength)
        : VALID_LENGTHS.includes(sum.lengthPreference as SummaryLength)
          ? (sum.lengthPreference as SummaryLength)
          : "balanced";

      const bundle = parseConversation(
        conv.rawContent,
        conv.sourceType as ConversationSourceType
      );
      const userKeys = decryptApiKeyMap(userRow.encryptedApiKeys);
      const analysisEngine =
        body.analysisEngine === "local" || body.analysisEngine === "ai"
          ? body.analysisEngine
          : undefined;
      const providerPreference: LLMProviderType =
        analysisEngine === "local"
          ? "local"
          : analysisEngine === "ai" && userRow.preferredProvider === "local"
            ? "auto"
            : (userRow.preferredProvider as LLMProviderType);
      const intelligence = await analyzeConversationWithIntelligence({
        bundle,
        mode: newMode,
        lengthPreference: newLength,
        customInstructions: sum.customInstructions,
        requireExternalProvider: analysisEngine === "ai",
        providerConfig: {
          preferredProvider: providerPreference,
          preferredModel: userRow.preferredModel,
          customBaseUrl: userRow.customBaseUrl,
          apiKeys: userKeys,
        },
      });
      intelligence.result.conversation_title = conv.title;

      const [updatedSum] = await db
        .update(summaries)
        .set({
          mode: newMode,
          lengthPreference: newLength,
          providerUsed: intelligence.providerUsed,
          overallImportance: intelligence.overallImportance,
          structuredResult: intelligence.result,
          processingStats: intelligence.stats,
          updatedAt: new Date(),
        })
        .where(eq(summaries.id, sum.id))
        .returning();

      return NextResponse.json({
        ok: true,
        analysis: toAnalysisRecordDTO(conv, updatedSum),
      });
    }

    // 3. Bookmark toggle or inline edits
    const sumUpdates: Partial<typeof summaries.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof body.isSaved === "boolean") {
      sumUpdates.isSaved = body.isSaved;
      await db.insert(activityLogs).values({
        userId: userRow.id,
        actionType: "summary_saved",
        title: `${body.isSaved ? "Saved" : "Removed"} "${conv.title}" ${
          body.isSaved ? "to" : "from"
        } Saved Summaries`,
        metadata: sum.mode,
        summaryId: sum.id,
        conversationId: conv.id,
      });
    }

    let updatedConv = conv;

    if (body.editedResult && typeof body.editedResult === "object") {
      const currentResult = sum.structuredResult;
      const patch = body.editedResult as Partial<ConvoBriefStructuredResult>;
      const nextTitle =
        typeof patch.conversation_title === "string" &&
        patch.conversation_title.trim()
          ? patch.conversation_title.trim().slice(0, 160)
          : currentResult.conversation_title;

      const merged: ConvoBriefStructuredResult = {
        ...currentResult,
        conversation_title: nextTitle,
        overview:
          typeof patch.overview === "string"
            ? patch.overview
            : currentResult.overview,
        conclusion:
          typeof patch.conclusion === "string"
            ? patch.conclusion
            : currentResult.conclusion,
        mode_bullets: Array.isArray(patch.mode_bullets)
          ? patch.mode_bullets
          : currentResult.mode_bullets,
        action_items: normalizeActionItems(
          patch.action_items,
          currentResult.action_items
        ),
      };

      sumUpdates.structuredResult = merged;
      sumUpdates.isEdited = true;

      if (nextTitle !== conv.title) {
        const [cRow] = await db
          .update(conversations)
          .set({ title: nextTitle, updatedAt: new Date() })
          .where(eq(conversations.id, conv.id))
          .returning();
        if (cRow) updatedConv = cRow;
      }

      await db.insert(activityLogs).values({
        userId: userRow.id,
        actionType: "summary_edited",
        title: `Edited summary for "${nextTitle}"`,
        metadata: "Manual refinement saved",
        summaryId: sum.id,
        conversationId: conv.id,
      });
    }

    const [updatedSum] = await db
      .update(summaries)
      .set(sumUpdates)
      .where(eq(summaries.id, sum.id))
      .returning();

    return NextResponse.json({
      ok: true,
      analysis: toAnalysisRecordDTO(updatedConv, updatedSum),
    });
  } catch (err) {
    console.error("PATCH /api/analyses/[id] error:", err);
    if (err instanceof ExternalProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Failed to update summary." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
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

    const { conv } = rows[0];
    await db
      .delete(conversations)
      .where(
        and(eq(conversations.id, conv.id), eq(conversations.userId, userRow.id))
      );

    await db.insert(activityLogs).values({
      userId: userRow.id,
      actionType: "conversation_deleted",
      title: `Deleted conversation "${conv.title}"`,
      metadata: "Permanent deletion",
    });

    return NextResponse.json({ ok: true, deletedId: summaryId });
  } catch (err) {
    console.error("DELETE /api/analyses/[id] error:", err);
    return NextResponse.json(
      { error: "Failed to delete analysis." },
      { status: 500 }
    );
  }
}
