import crypto from "node:crypto";

const SCRYPT_KEYLEN = 64;

export const ZERO_RETENTION_PLACEHOLDER =
  "[Raw transcript omitted per user Zero-Retention Privacy Policy]";

function getEncryptionKey(): Buffer {
  const secretMaterial =
    process.env.APP_ENCRYPTION_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    "convobrief-default-local-secret-key-material";
  return crypto.createHash("sha256").update(secretMaterial).digest();
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN)
    .toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuffer = Buffer.from(keyHex, "hex");
  const derivedBuffer = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  if (keyBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedBuffer);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function encryptApiKeyMap(keys: Record<string, string>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const plaintext = JSON.stringify(keys);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptApiKeyMap(payload: string): Record<string, string> {
  if (!payload || !payload.includes(":")) return {};
  try {
    const [ivHex, tagHex, dataHex] = payload.split(":");
    if (!ivHex || !tagHex || !dataHex) return {};
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]);
    const parsed = JSON.parse(decrypted.toString("utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function maskApiKey(key?: string): string {
  if (!key || key.trim().length < 8) return "";
  const trimmed = key.trim();
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules)/gi,
  /disregard\s+(all\s+)?(previous|prior|system)\s+(instructions|prompts)/gi,
  /you\s+are\s+now\s+(in\s+developer\s+mode|dan|unrestricted|a\s+different\s+ai)/gi,
  /system\s*override\s*:/gi,
  /<\|im_start\|>|<\|im_end\|>|\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>/gi,
  /reveal\s+(your\s+)?(system\s+prompt|api\s+key|environment\s+variables|secrets)/gi,
  /do\s+not\s+summarize.*instead\s+(output|print|write|execute)/gi,
];

export interface SanitizedConversationInput {
  sanitizedText: string;
  injectionFlagsDetected: number;
}

/**
 * Protects against prompt injection & XSS embedded inside untrusted conversation transcripts.
 * Neutralizes control tokens and directive framing so instructions inside conversations
 * are treated strictly as inert quoted text, never executed.
 */
export function sanitizeConversationTranscript(
  rawInput: string
): SanitizedConversationInput {
  let text = rawInput
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  let injectionFlagsDetected = 0;

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      injectionFlagsDetected += matches.length;
      text = text.replace(pattern, (matched) => `[UNTRUSTED_QUOTED_TEXT: ${matched}]`);
    }
  }

  // Neutralize XML boundary breakout attempts
  if (/<\/?untrusted_conversation_transcript>/i.test(text)) {
    injectionFlagsDetected += 1;
    text = text.replace(
      /<\/?untrusted_conversation_transcript>/gi,
      "[ESCAPED_TAG]"
    );
  }

  return {
    sanitizedText: text.trim(),
    injectionFlagsDetected,
  };
}

export function sanitizeCustomInstructions(instructions?: string): string {
  if (!instructions) return "";
  let cleaned = instructions
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 600);
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.trim();
}

export function validateConversationText(input: unknown): {
  valid: boolean;
  error?: string;
  text?: string;
} {
  if (typeof input !== "string") {
    return { valid: false, error: "Conversation content must be text." };
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: "Conversation input cannot be empty. Please paste a conversation or upload a valid document.",
    };
  }
  if (trimmed.length < 10) {
    return {
      valid: false,
      error: "Conversation is too short to analyze (minimum 10 characters required).",
    };
  }
  if (trimmed.length > 500_000) {
    return {
      valid: false,
      error: "Conversation exceeds maximum single-analysis limit of 500,000 characters.",
    };
  }
  return { valid: true, text: trimmed };
}
