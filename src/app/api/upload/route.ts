import { NextResponse } from "next/server";
import { getAuthenticatedUserRow } from "@/lib/auth";
import {
  MAX_UPLOAD_BYTES,
  processUploadedDocument,
} from "@/lib/file-processor";
import { parseConversation } from "@/lib/parser";
import { sanitizeConversationTranscript } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const userRow = await getAuthenticatedUserRow();
    if (!userRow) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No valid file provided in upload request." },
        { status: 400 }
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "File exceeds maximum allowed size of 10 MB." },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extraction = await processUploadedDocument(file.name, buffer);
    if (!extraction.ok || !extraction.text) {
      return NextResponse.json(
        { error: extraction.error || "Document extraction failed." },
        { status: 400 }
      );
    }

    const sanitized = sanitizeConversationTranscript(extraction.text);
    const previewBundle = parseConversation(sanitized.sanitizedText);

    return NextResponse.json({
      ok: true,
      fileName: extraction.fileName,
      fileType: extraction.fileType,
      extractedText: extraction.text,
      preview: {
        detectedSourceType: previewBundle.detectedSourceType,
        detectedLanguage: previewBundle.detectedLanguage,
        messageCount: previewBundle.messages.length,
        participantCount: previewBundle.participants.length,
        participants: previewBundle.participants,
        wordCount: previewBundle.totalWords,
        estimatedReadingMinutes: previewBundle.estimatedReadingMinutes,
        duplicateCount: previewBundle.duplicateCount,
        noiseFilteredPercent: previewBundle.noiseFilteredPercent,
      },
    });
  } catch (err) {
    console.error("POST /api/upload error:", err);
    return NextResponse.json(
      { error: "Server error while processing uploaded document." },
      { status: 500 }
    );
  }
}
