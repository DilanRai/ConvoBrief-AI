import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLogs,
  conversations,
  followUpMessages,
  summaries,
  users,
} from "@/db/schema";
import {
  clearCurrentSession,
  formatUserDTO,
  getAuthenticatedUserRow,
} from "@/lib/auth";
import {
  decryptApiKeyMap,
  encryptApiKeyMap,
  hashPassword,
  verifyPassword,
} from "@/lib/security";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  try {
    const userRow = await getAuthenticatedUserRow();
    if (!userRow) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const updates: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof body.name === "string" && body.name.trim().length >= 2) {
      updates.name = body.name.trim().slice(0, 80);
    }
    if (typeof body.role === "string") {
      updates.role = body.role.trim().slice(0, 80);
    }
    if (typeof body.organization === "string") {
      updates.organization = body.organization.trim().slice(0, 100);
    }
    if (
      typeof body.preferredProvider === "string" &&
      [
        "auto",
        "local",
        "openai",
        "anthropic",
        "gemini",
        "groq",
        "nvidia",
        "custom",
      ].includes(body.preferredProvider)
    ) {
      updates.preferredProvider = body.preferredProvider;
    }
    if (typeof body.preferredModel === "string" && body.preferredModel.trim()) {
      updates.preferredModel = body.preferredModel.trim().slice(0, 80);
    }
    if (typeof body.customBaseUrl === "string") {
      updates.customBaseUrl = body.customBaseUrl.trim().slice(0, 200);
    }
    if (typeof body.privacyZeroRetention === "boolean") {
      updates.privacyZeroRetention = body.privacyZeroRetention;
    }
    if (typeof body.consentModelTraining === "boolean") {
      updates.consentModelTraining = body.consentModelTraining;
    }

    // Encrypted API keys update (never returned raw)
    if (body.apiKeys && typeof body.apiKeys === "object") {
      const currentKeys = decryptApiKeyMap(userRow.encryptedApiKeys);
      for (const provider of [
        "openai",
        "anthropic",
        "gemini",
        "groq",
        "nvidia",
        "custom",
      ]) {
        if (provider in body.apiKeys) {
          const val = String(body.apiKeys[provider] || "").trim();
          if (val === "__CLEAR__") {
            delete currentKeys[provider];
          } else if (val.length > 0) {
            currentKeys[provider] = val;
          }
        }
      }
      updates.encryptedApiKeys = encryptApiKeyMap(currentKeys);
    }

    // Password change
    if (body.newPassword) {
      if (userRow.isDemo) {
        return NextResponse.json(
          {
            error:
              "Password changes are disabled for the shared Demo Workspace. Create a private account to set a custom password.",
          },
          { status: 403 }
        );
      }
      const currentPwd = String(body.currentPassword || "");
      const newPwd = String(body.newPassword || "");
      if (!verifyPassword(currentPwd, userRow.passwordHash)) {
        return NextResponse.json(
          { error: "Current password is incorrect." },
          { status: 400 }
        );
      }
      if (newPwd.length < 8) {
        return NextResponse.json(
          { error: "New password must be at least 8 characters." },
          { status: 400 }
        );
      }
      updates.passwordHash = hashPassword(newPwd);
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userRow.id))
      .returning();

    return NextResponse.json({
      ok: true,
      user: formatUserDTO(updated),
    });
  } catch (err) {
    console.error("PATCH /api/settings error:", err);
    return NextResponse.json(
      { error: "Failed to save settings." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const userRow = await getAuthenticatedUserRow();
    if (!userRow) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || "data";

    if (scope === "account") {
      if (userRow.isDemo) {
        return NextResponse.json(
          {
            error:
              "The shared Demo Workspace account cannot be deleted, though you can purge its conversations or sign out to create a private account.",
          },
          { status: 403 }
        );
      }
      await db.delete(users).where(eq(users.id, userRow.id));
      await clearCurrentSession();
      return NextResponse.json({ ok: true, accountDeleted: true });
    }

    // Purge all user conversations, summaries, follow-ups, and logs
    await db
      .delete(followUpMessages)
      .where(eq(followUpMessages.userId, userRow.id));
    await db.delete(summaries).where(eq(summaries.userId, userRow.id));
    await db.delete(conversations).where(eq(conversations.userId, userRow.id));
    await db.delete(activityLogs).where(eq(activityLogs.userId, userRow.id));

    await db.insert(activityLogs).values({
      userId: userRow.id,
      actionType: "data_purged",
      title: "Purged all stored conversations and summaries",
      metadata: "Privacy-first user data deletion completed",
    });

    return NextResponse.json({ ok: true, dataPurged: true });
  } catch (err) {
    console.error("DELETE /api/settings error:", err);
    return NextResponse.json(
      { error: "Failed to delete user data." },
      { status: 500 }
    );
  }
}
