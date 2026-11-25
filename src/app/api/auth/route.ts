import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDatabaseReady } from "@/db";
import { users } from "@/db/schema";
import {
  clearCurrentSession,
  createSessionForUser,
  ensureDemoWorkspaceSeeded,
  formatUserDTO,
  getAuthenticatedUserRow,
} from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userRow = await getAuthenticatedUserRow();
    if (!userRow) {
      return NextResponse.json({ authenticated: false, user: null });
    }
    return NextResponse.json({
      authenticated: true,
      user: formatUserDTO(userRow),
    });
  } catch (err) {
    console.error("GET /api/auth error:", err);
    return NextResponse.json(
      { error: "Failed to verify authentication state." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    await ensureDatabaseReady();
    const body = await req.json();
    const action = String(body.action || "").toLowerCase();

    if (action === "logout") {
      await clearCurrentSession();
      return NextResponse.json({ ok: true, authenticated: false, user: null });
    }

    if (action === "demo") {
      const demoUser = await ensureDemoWorkspaceSeeded();
      await createSessionForUser(demoUser.id);
      return NextResponse.json({
        ok: true,
        authenticated: true,
        user: formatUserDTO(demoUser),
      });
    }

    if (action === "register") {
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      const name = String(body.name || "").trim();
      const password = String(body.password || "");
      const role = String(body.role || "Product & Operations Lead").trim();
      const organization = String(
        body.organization || "Private Workspace"
      ).trim();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          { error: "Please provide a valid email address." },
          { status: 400 }
        );
      }
      if (name.length < 2 || name.length > 80) {
        return NextResponse.json(
          { error: "Full name must be between 2 and 80 characters." },
          { status: 400 }
        );
      }
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters long." },
          { status: 400 }
        );
      }

      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing.length > 0) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please sign in." },
          { status: 409 }
        );
      }

      const [created] = await db
        .insert(users)
        .values({
          email,
          name,
          role: role.slice(0, 80),
          organization: organization.slice(0, 100),
          passwordHash: hashPassword(password),
          isDemo: false,
          preferredProvider: "auto",
          preferredModel: "gpt-4o-mini",
        })
        .returning();

      await createSessionForUser(created.id);

      return NextResponse.json({
        ok: true,
        authenticated: true,
        user: formatUserDTO(created),
      });
    }

    if (action === "login") {
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      const password = String(body.password || "");

      if (!email || !password) {
        return NextResponse.json(
          { error: "Email and password are required." },
          { status: 400 }
        );
      }

      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (rows.length === 0 || !verifyPassword(password, rows[0].passwordHash)) {
        return NextResponse.json(
          { error: "Invalid email or password." },
          { status: 401 }
        );
      }

      await createSessionForUser(rows[0].id);

      return NextResponse.json({
        ok: true,
        authenticated: true,
        user: formatUserDTO(rows[0]),
      });
    }

    return NextResponse.json({ error: "Unsupported auth action." }, { status: 400 });
  } catch (err) {
    console.error("POST /api/auth error:", err);
    return NextResponse.json(
      { error: "Authentication request failed." },
      { status: 500 }
    );
  }
}
