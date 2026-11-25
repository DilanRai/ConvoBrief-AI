import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLogs, conversations, summaries } from "@/db/schema";
import { getAuthenticatedUserRow } from "@/lib/auth";
import { toAnalysisRecordDTO } from "@/lib/dto";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userRow = await getAuthenticatedUserRow();
    if (!userRow) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const joined = await db
      .select({
        conv: conversations,
        sum: summaries,
      })
      .from(summaries)
      .innerJoin(conversations, eq(summaries.conversationId, conversations.id))
      .where(eq(summaries.userId, userRow.id))
      .orderBy(desc(summaries.createdAt))
      .limit(100);

    const analyses = joined.map(({ conv, sum }) =>
      toAnalysisRecordDTO(conv, sum)
    );

    const logs = await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.userId, userRow.id))
      .orderBy(desc(activityLogs.createdAt))
      .limit(60);

    const totalAnalyses = analyses.length;
    const totalMessagesProcessed = analyses.reduce(
      (acc, a) => acc + a.messageCount,
      0
    );
    const totalDecisionsExtracted = analyses.reduce(
      (acc, a) => acc + (a.structuredResult?.important_decisions?.length || 0),
      0
    );
    const totalActionItems = analyses.reduce(
      (acc, a) => acc + (a.structuredResult?.action_items?.length || 0),
      0
    );
    const savedCount = analyses.filter((a) => a.isSaved).length;
    const avgNoiseReduced =
      totalAnalyses > 0
        ? Math.round(
            analyses.reduce((acc, a) => acc + a.noiseFilteredPercent, 0) /
              totalAnalyses
          )
        : 0;

    return NextResponse.json({
      ok: true,
      analyses,
      logs: logs.map((l) => ({
        id: l.id,
        actionType: l.actionType,
        title: l.title,
        metadata: l.metadata,
        summaryId: l.summaryId,
        conversationId: l.conversationId,
        createdAt: l.createdAt.toISOString(),
      })),
      dashboardStats: {
        totalAnalyses,
        totalMessagesProcessed,
        totalDecisionsExtracted,
        totalActionItems,
        savedCount,
        avgNoiseReduced,
      },
    });
  } catch (err) {
    console.error("GET /api/analyses error:", err);
    return NextResponse.json(
      { error: "Failed to load conversation analyses." },
      { status: 500 }
    );
  }
}
