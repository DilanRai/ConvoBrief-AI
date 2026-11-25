import mammoth from "mammoth";
import { extractText } from "unpdf";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = new Set([
  ".txt",
  ".pdf",
  ".docx",
  ".md",
  ".json",
  ".log",
  ".vtt",
]);

export interface FileExtractionResult {
  ok: boolean;
  text?: string;
  fileName?: string;
  fileType?: "txt" | "pdf" | "docx";
  error?: string;
}

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx).toLowerCase();
}

export async function processUploadedDocument(
  fileName: string,
  buffer: Buffer
): Promise<FileExtractionResult> {
  if (!fileName || !fileName.trim()) {
    return { ok: false, error: "File name is missing." };
  }

  const ext = getExtension(fileName.trim());
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: `Unsupported file format "${ext || "unknown"}". Allowed formats: TXT, PDF, DOCX (and MD/JSON/VTT transcripts).`,
    };
  }

  if (!buffer || buffer.byteLength === 0) {
    return { ok: false, error: "Uploaded file is empty (0 bytes)." };
  }

  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `File exceeds maximum allowed size of 10 MB (${(
        buffer.byteLength /
        (1024 * 1024)
      ).toFixed(2)} MB uploaded).`,
    };
  }

  try {
    if (ext === ".pdf") {
      const header = buffer.subarray(0, 5).toString("ascii");
      if (!header.startsWith("%PDF-")) {
        return {
          ok: false,
          error: "Invalid or corrupted PDF file (missing %PDF header signature).",
        };
      }
      const uint8 = new Uint8Array(buffer);
      const { text } = await extractText(uint8, { mergePages: true });
      const cleaned = (Array.isArray(text) ? text.join("\n") : String(text || "")).trim();
      if (!cleaned) {
        return {
          ok: false,
          error: "No extractable text found in PDF. Scanned image-only PDFs require OCR text layers.",
        };
      }
      return {
        ok: true,
        text: cleaned,
        fileName,
        fileType: "pdf",
      };
    }

    if (ext === ".docx") {
      // DOCX is an OOXML ZIP container starting with PK\x03\x04
      if (
        buffer.byteLength < 4 ||
        buffer[0] !== 0x50 ||
        buffer[1] !== 0x4b
      ) {
        return {
          ok: false,
          error: "Invalid or corrupted DOCX file (missing OOXML archive signature).",
        };
      }
      const extracted = await mammoth.extractRawText({ buffer });
      const cleaned = (extracted.value || "").trim();
      if (!cleaned) {
        return {
          ok: false,
          error: "The uploaded DOCX document contains no readable text.",
        };
      }
      return {
        ok: true,
        text: cleaned,
        fileName,
        fileType: "docx",
      };
    }

    // Plain text / MD / JSON / LOG / VTT
    // Reject binary files masquerading as .txt
    const sample = buffer.subarray(0, Math.min(1024, buffer.byteLength));
    let nullByteCount = 0;
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) nullByteCount++;
    }
    if (nullByteCount > 2) {
      return {
        ok: false,
        error: "Invalid text file: binary content detected.",
      };
    }

    const decoded = buffer.toString("utf8").trim();
    if (!decoded) {
      return {
        ok: false,
        error: "The uploaded text file contains only whitespace.",
      };
    }

    return {
      ok: true,
      text: decoded,
      fileName,
      fileType: "txt",
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Failed to parse uploaded document.";
    return {
      ok: false,
      error: `Document extraction failed: ${msg}`,
    };
  }
}
