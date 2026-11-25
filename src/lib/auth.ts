import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db, ensureDatabaseReady } from "@/db";
import {
  activityLogs,
  conversations,
  sessions,
  summaries,
  users,
} from "@/db/schema";
import {
  decryptApiKeyMap,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  maskApiKey,
  sanitizeConversationTranscript,
} from "@/lib/security";
import { parseConversation } from "@/lib/parser";
import { runHybridNlpAnalysis } from "@/lib/nlp-engine";
import { SAMPLE_CONVERSATIONS } from "@/lib/sample-conversations";
import type { LLMProviderType } from "@/types/convobrief";

export const SESSION_COOKIE_NAME = "convobrief_session";
export const LOGGED_OUT_COOKIE_NAME = "convobrief_logged_out";
const SESSION_DURATION_DAYS = 14;

export interface AuthenticatedUserDTO {
  id: number;
  email: string;
  name: string;
  role: string;
  organization: string;
  isDemo: boolean;
  preferredProvider: LLMProviderType;
  preferredModel: string;
  customBaseUrl: string;
  maskedKeys: {
    openai: string;
    anthropic: string;
    gemini: string;
    groq: string;
    nvidia: string;
    custom: string;
  };
  envProvidersConfigured: {
    openai: boolean;
    anthropic: boolean;
    gemini: boolean;
    groq: boolean;
    nvidia: boolean;
    custom: boolean;
  };
  privacyZeroRetention: boolean;
  consentModelTraining: boolean;
  createdAt: string;
}

export function formatUserDTO(
  userRow: typeof users.$inferSelect
): AuthenticatedUserDTO {
  const decrypted = decryptApiKeyMap(userRow.encryptedApiKeys);
  return {
    id: userRow.id,
    email: userRow.email,
    name: userRow.name,
    role: userRow.role,
    organization: userRow.organization,
    isDemo: userRow.isDemo,
    preferredProvider: (userRow.preferredProvider || "auto") as LLMProviderType,
    preferredModel: userRow.preferredModel || "gpt-4o-mini",
    customBaseUrl: userRow.customBaseUrl || "",
    maskedKeys: {
      openai: maskApiKey(decrypted.openai),
      anthropic: maskApiKey(decrypted.anthropic),
      gemini: maskApiKey(decrypted.gemini),
      groq: maskApiKey(decrypted.groq),
      nvidia: maskApiKey(decrypted.nvidia),
      custom: maskApiKey(decrypted.custom),
    },
    envProvidersConfigured: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      gemini: Boolean(
        process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      ),
      groq: Boolean(process.env.GROQ_API_KEY || process.env.LLM_API_KEY),
      nvidia: Boolean(process.env.NVIDIA_API_KEY || process.env.LLM_API_KEY),
      custom: Boolean(
        process.env.LLM_API_KEY ||
          process.env.OPENROUTER_API_KEY ||
          process.env.GROQ_API_KEY ||
          process.env.NVIDIA_API_KEY
      ),
    },
    privacyZeroRetention: userRow.privacyZeroRetention,
    consentModelTraining: userRow.consentModelTraining,
    createdAt: userRow.createdAt.toISOString(),
  };
}

const globalForDemoSeed = globalThis as typeof globalThis & {
  __convobriefDemoSeedPromise?: Promise<typeof users.$inferSelect>;
};

async function seedDemoWorkspace(): Promise<typeof users.$inferSelect> {
  await ensureDatabaseReady();
  const demoEmail = "alex.morgan@convobrief.ai";
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, demoEmail))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [inserted] = await db
    .insert(users)
    .values({
      email: demoEmail,
      name: "Alex Morgan",
      role: "VP of Engineering & Operations",
      organization: "ConvoBrief Demo Workspace",
      passwordHash: hashPassword("ConvoBriefDemo2026!"),
      isDemo: true,
      preferredProvider: "auto",
      preferredModel: "gpt-4o-mini",
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  let demoUser = inserted;
  if (!demoUser) {
    const [raced] = await db
      .select()
      .from(users)
      .where(eq(users.email, demoEmail))
      .limit(1);
    if (!raced) {
      throw new Error("Unable to initialize the demo workspace.");
    }
    demoUser = raced;
  }

  // Run genuine analysis on 3 sample conversations so Demo Workspace has authentic DB records
  const seeds = SAMPLE_CONVERSATIONS.slice(0, 3);
  for (let i = 0; i < seeds.length; i++) {
    const sample = seeds[i];
    const sanitized = sanitizeConversationTranscript(sample.transcript);
    const bundle = parseConversation(
      sanitized.sanitizedText,
      sample.sourceType
    );
    const analysis = runHybridNlpAnalysis({
      bundle,
      mode: sample.recommendedMode,
      lengthPreference: "balanced",
      injectionFlagsDetected: sanitized.injectionFlagsDetected,
    });

    const [conv] = await db
      .insert(conversations)
      .values({
        userId: demoUser.id,
        title: analysis.result.conversation_title || sample.label,
        sourceType: bundle.detectedSourceType,
        fileName: null,
        rawContent: sanitized.sanitizedText,
        parsedMessages: bundle.messages,
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
        userId: demoUser.id,
        mode: sample.recommendedMode,
        lengthPreference: "balanced",
        customInstructions: "",
        providerUsed: analysis.stats.engine_name,
        overallImportance: analysis.overallImportance,
        isSaved: i === 0 || i === 1,
        isEdited: false,
        structuredResult: {
          ...analysis.result,
          conversation_title: sample.label,
        },
        processingStats: analysis.stats,
      })
      .returning();

    await db.insert(activityLogs).values({
      userId: demoUser.id,
      actionType: "analysis_created",
      title: `Analyzed "${sample.label}" (${sample.recommendedMode} mode)`,
      metadata: `${bundle.messages.length} messages • ${bundle.detectedLanguage} • ${analysis.overallImportance}`,
      summaryId: sum.id,
      conversationId: conv.id,
    });
  }

  return demoUser;
}

export function ensureDemoWorkspaceSeeded(): Promise<typeof users.$inferSelect> {
  if (!globalForDemoSeed.__convobriefDemoSeedPromise) {
    globalForDemoSeed.__convobriefDemoSeedPromise = seedDemoWorkspace().catch(
      (error) => {
        globalForDemoSeed.__convobriefDemoSeedPromise = undefined;
        throw error;
      }
    );
  }
  return globalForDemoSeed.__convobriefDemoSeedPromise;
}

export async function createSessionForUser(userId: number): Promise<string> {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  cookieStore.delete(LOGGED_OUT_COOKIE_NAME);

  return rawToken;
}

export async function clearCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.set(LOGGED_OUT_COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getAuthenticatedUserRow(): Promise<
  typeof users.$inferSelect | null
> {
  await ensureDatabaseReady();
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    const tokenHash = hashSessionToken(rawToken);
    const now = new Date();
    const rows = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
      .limit(1);

    if (rows.length > 0) {
      return rows[0].user;
    }
  }

  // If explicitly logged out, return null so the login/register screen is enforced
  const explicitlyLoggedOut =
    cookieStore.get(LOGGED_OUT_COOKIE_NAME)?.value === "1";
  if (explicitlyLoggedOut) {
    return null;
  }

  // First-time seamless access: return Demo Workspace user
  return ensureDemoWorkspaceSeeded();
}
