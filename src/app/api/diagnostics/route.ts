import { NextResponse } from "next/server";
import { runConvoBriefValidationSuite } from "@/lib/validation-suite";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await runConvoBriefValidationSuite();
    return NextResponse.json({
      ok: true,
      ...report,
    });
  } catch (err) {
    console.error("GET /api/diagnostics error:", err);
    return NextResponse.json(
      { ok: false, error: "Diagnostics execution failed." },
      { status: 500 }
    );
  }
}
