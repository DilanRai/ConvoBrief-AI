import type {
  ConversationSourceType,
  ImportanceLevel,
  ParsedMessage,
} from "@/types/convobrief";

export interface ParsedConversationBundle {
  detectedSourceType: ConversationSourceType;
  detectedLanguage: string;
  messages: ParsedMessage[];
  participants: string[];
  totalWords: number;
  estimatedReadingMinutes: number;
  duplicateCount: number;
  greetingOrNoiseCount: number;
  noiseFilteredPercent: number;
}

const PURE_GREETING_OR_NOISE_PATTERNS: RegExp[] = [
  /^(hi|hey|hello|hola|bonjour|hallo|oi|namaste|good\s+(morning|afternoon|evening)|gm|yo)(\s+(everyone|team|all|folks|guys|there))?[!.,\s]*$/i,
  /^(ok|okay|k|kk|got\s+it|noted|ack|acknowledged|roger|cool|nice|great|awesome|perfect|sounds\s+good|makes\s+sense|sure|yep|yup|yes|no|np|no\s+problem|ty|thx|thanks|thank\s+you(\s+so\s+much)?|merci|gracias|danke)[!.,\s👍🙏🙌✅]*$/i,
  /^[👍👎🙏🙌🎉❤️😂🔥✅👌💯\s]+$/u,
  /^<?(media|image|video|audio|sticker|gif|document)\s+omitted>?$/i,
  /^messages\s+and\s+calls\s+are\s+end-to-end\s+encrypted.*$/i,
  /^(can\s+you\s+hear\s+me\??|can\s+everyone\s+see\s+my\s+screen\??|you\s+are\s+on\s+mute[!.]?|sorry\s+i\s+was\s+muted[!.]?)$/i,
  /^(joined|left)\s+the\s+(chat|group|meeting|channel)\.?$/i,
];

function normalizeForSimilarity(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(normalized: string): Set<string> {
  const parts = normalized.split(" ").filter((t) => t.length > 1);
  return new Set(parts);
}

export function computeJaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isPureNoiseOrGreeting(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;
  if (trimmed.length <= 2 && !/\d/.test(trimmed)) return true;
  for (const regex of PURE_GREETING_OR_NOISE_PATTERNS) {
    if (regex.test(trimmed)) return true;
  }
  return false;
}

export function detectConversationLanguage(text: string): string {
  const sample = text.slice(0, 12000);
  const detected: string[] = [];

  if (/[\u4e00-\u9fff]/.test(sample)) detected.push("Chinese");
  if (/[\u3040-\u30ff]/.test(sample)) detected.push("Japanese");
  if (/[\u0600-\u06ff]/.test(sample)) detected.push("Arabic");
  if (/[\u0900-\u097f]/.test(sample)) detected.push("Hindi");
  if (/[\u0400-\u04ff]/.test(sample)) detected.push("Russian");

  const lower = ` ${sample.toLowerCase()} `;
  const langLexicons: Array<{ name: string; markers: RegExp }> = [
    {
      name: "English",
      markers:
        /\b(the|and|that|have|with|this|will|from|they|should|meeting|decision|update|please|need)\b/g,
    },
    {
      name: "Spanish",
      markers:
        /\b(que|para|con|por|una|los|las|pero|como|tenemos|reunión|proyecto|gracias|hacer|equipo|viernes)\b/g,
    },
    {
      name: "French",
      markers:
        /\b(les|des|pour|dans|avec|une|sur|nous|vous|mais|réunion|projet|merci|équipe|vendredi)\b/g,
    },
    {
      name: "German",
      markers:
        /\b(und|der|die|das|mit|für|nicht|wir|haben|bitte|projekt|besprechung|danke|freitag)\b/g,
    },
    {
      name: "Portuguese",
      markers:
        /\b(que|para|com|uma|não|mais|como|temos|reunião|projeto|obrigado|equipe)\b/g,
    },
  ];

  const scores: Array<{ name: string; count: number }> = [];
  for (const lex of langLexicons) {
    const matches = lower.match(lex.markers);
    const count = matches ? matches.length : 0;
    if (count >= 3) {
      scores.push({ name: lex.name, count });
    }
  }
  scores.sort((a, b) => b.count - a.count);

  if (scores.length >= 2 && scores[1].count >= Math.max(4, scores[0].count * 0.25)) {
    const topNames = [
      ...new Set([...detected, scores[0].name, scores[1].name]),
    ];
    return `Multilingual (${topNames.slice(0, 3).join(" / ")})`;
  }

  if (detected.length > 0 && scores.length > 0) {
    return `Multilingual (${[...new Set([scores[0].name, ...detected])].join(" / ")})`;
  }

  if (detected.length > 1) {
    return `Multilingual (${detected.join(" / ")})`;
  }
  if (detected.length === 1) {
    return detected[0];
  }
  if (scores.length > 0) {
    return scores[0].name;
  }
  return "English";
}

interface RawTurn {
  speaker: string;
  timestamp: string | null;
  content: string;
}

function tryParseTelegramJson(raw: string): RawTurn[] | null {
  if (!raw.trim().startsWith("{")) return null;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data.messages)) return null;
    const turns: RawTurn[] = [];
    for (const msg of data.messages) {
      const text =
        typeof msg.text === "string"
          ? msg.text
          : Array.isArray(msg.text)
            ? msg.text
                .map((part: unknown) =>
                  typeof part === "string"
                    ? part
                    : typeof part === "object" &&
                        part !== null &&
                        "text" in part
                      ? String((part as { text: unknown }).text)
                      : ""
                )
                .join("")
            : "";
      if (!text.trim()) continue;
      turns.push({
        speaker: String(msg.from || msg.actor || "Participant").trim(),
        timestamp: msg.date ? String(msg.date) : null,
        content: text.trim(),
      });
    }
    return turns.length > 0 ? turns : null;
  } catch {
    return null;
  }
}

function detectAndExtractTurns(
  rawText: string,
  hintSource?: ConversationSourceType
): { sourceType: ConversationSourceType; turns: RawTurn[] } {
  // 1. Check Telegram JSON export
  const telegramJson = tryParseTelegramJson(rawText);
  if (telegramJson) {
    return { sourceType: "telegram", turns: telegramJson };
  }

  const lines = rawText.split("\n");

  // 2. WhatsApp format:
  // [12/05/2025, 10:15:32 AM] Sarah Chen: Message
  // 12/05/2025, 10:15 - Sarah Chen: Message
  const whatsappBracketRe =
    /^\[(\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APMapm]{2})?)\]\s+([^:]{1,50}):\s*(.*)$/;
  const whatsappDashRe =
    /^(\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APMapm]{2})?)\s+-\s+([^:]{1,50}):\s*(.*)$/;

  let waMatches = 0;
  for (const line of lines.slice(0, 40)) {
    if (whatsappBracketRe.test(line) || whatsappDashRe.test(line)) {
      waMatches++;
    }
  }
  if (waMatches >= 2 || (hintSource === "whatsapp" && waMatches >= 1)) {
    const turns: RawTurn[] = [];
    for (const line of lines) {
      const m = line.match(whatsappBracketRe) || line.match(whatsappDashRe);
      if (m) {
        turns.push({
          timestamp: m[1].trim(),
          speaker: m[2].trim(),
          content: m[3].trim(),
        });
      } else if (turns.length > 0 && line.trim()) {
        turns[turns.length - 1].content += `\n${line.trim()}`;
      }
    }
    if (turns.length > 0) return { sourceType: "whatsapp", turns };
  }

  // 3. Telegram text export:
  // Name, [12.05.2025 10:15]
  const telegramHeaderRe =
    /^([^,\[\n]{1,50}),\s*\[(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?)\]\s*$/;
  let tgMatches = 0;
  for (const line of lines.slice(0, 50)) {
    if (telegramHeaderRe.test(line.trim())) tgMatches++;
  }
  if (tgMatches >= 2 || (hintSource === "telegram" && tgMatches >= 1)) {
    const turns: RawTurn[] = [];
    for (const line of lines) {
      const m = line.trim().match(telegramHeaderRe);
      if (m) {
        turns.push({
          speaker: m[1].trim(),
          timestamp: m[2].trim(),
          content: "",
        });
      } else if (turns.length > 0 && line.trim()) {
        turns[turns.length - 1].content = turns[turns.length - 1].content
          ? `${turns[turns.length - 1].content}\n${line.trim()}`
          : line.trim();
      }
    }
    const cleaned = turns.filter((t) => t.content.trim().length > 0);
    if (cleaned.length > 0) return { sourceType: "telegram", turns: cleaned };
  }

  // 4. Email Thread format (From:, Subject:, On ... wrote:)
  const emailFromCount = (rawText.match(/^From:\s+.+$/gim) || []).length;
  const emailWroteCount = (rawText.match(/^On\s+.+wrote:\s*$/gim) || []).length;
  if (
    emailFromCount >= 1 &&
    (/^Subject:\s+/im.test(rawText) || emailFromCount >= 2 || emailWroteCount >= 1)
  ) {
    const turns: RawTurn[] = [];
    let currentSpeaker = "Sender";
    let currentDate: string | null = null;
    let currentSubject = "";
    let buffer: string[] = [];

    const flushEmail = () => {
      const body = buffer
        .filter((l) => !l.trim().startsWith(">")) // Strip redundant quoted thread history
        .join("\n")
        .trim();
      if (body) {
        turns.push({
          speaker: currentSpeaker,
          timestamp: currentDate,
          content: currentSubject ? `[Subject: ${currentSubject}] ${body}` : body,
        });
        currentSubject = "";
      }
      buffer = [];
    };

    for (const line of lines) {
      const fromMatch = line.match(/^From:\s*([^<\n]+)(?:<[^>]+>)?/i);
      const dateMatch = line.match(/^(?:Date|Sent):\s*(.+)$/i);
      const subjMatch = line.match(/^Subject:\s*(.+)$/i);
      const toMatch = line.match(/^(?:To|Cc|Bcc):\s*(.+)$/i);
      const wroteMatch = line.match(/^On\s+(.+?),\s*([^<\n]+?)(?:\s*<[^>]+>)?\s+wrote:\s*$/i);

      if (fromMatch) {
        flushEmail();
        currentSpeaker = fromMatch[1].trim().replace(/^["']|["']$/g, "");
      } else if (wroteMatch) {
        flushEmail();
        currentDate = wroteMatch[1].trim();
        currentSpeaker = wroteMatch[2].trim();
      } else if (dateMatch && buffer.length === 0) {
        currentDate = dateMatch[1].trim();
      } else if (subjMatch && buffer.length === 0) {
        currentSubject = subjMatch[1].trim();
      } else if (toMatch && buffer.length === 0) {
        continue;
      } else if (/^-{3,}\s*Original Message\s*-{3,}$/i.test(line.trim())) {
        flushEmail();
      } else {
        buffer.push(line);
      }
    }
    flushEmail();
    if (turns.length > 0) return { sourceType: "email", turns };
  }

  // 5. Meeting transcript with timestamps:
  // [00:02:15] Elena Rostova: ... OR Elena Rostova (10:04 AM): ... OR [10:04] Speaker: ...
  const meetingBracketFirstRe =
    /^\[?(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APMapm]{2})?)\]?\s+([A-Za-zÀ-ÿ0-9_.\s-]{2,45}):\s+(.+)$/;
  const meetingSpeakerFirstRe =
    /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_.\s()-]{1,45})\s+\[?\((\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APMapm]{2})?)\)\]?:\s*(.*)$/;

  let meetingMatches = 0;
  for (const line of lines.slice(0, 50)) {
    if (
      meetingBracketFirstRe.test(line.trim()) ||
      meetingSpeakerFirstRe.test(line.trim())
    ) {
      meetingMatches++;
    }
  }
  if (meetingMatches >= 2) {
    const turns: RawTurn[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const m1 = trimmed.match(meetingBracketFirstRe);
      const m2 = trimmed.match(meetingSpeakerFirstRe);
      if (m1) {
        turns.push({
          timestamp: m1[1].trim(),
          speaker: m1[2].trim(),
          content: m1[3].trim(),
        });
      } else if (m2) {
        turns.push({
          speaker: m2[1].trim(),
          timestamp: m2[2].trim(),
          content: m2[3].trim(),
        });
      } else if (turns.length > 0) {
        turns[turns.length - 1].content += ` ${trimmed}`;
      }
    }
    if (turns.length > 0) return { sourceType: "meeting", turns };
  }

  // 6. Dialogue format: ChatGPT, Support, or Generic "Speaker: message"
  const speakerColonRe =
    /^([A-Za-zÀ-ÿ\u0400-\u04ff\u4e00-\u9fff][A-Za-zÀ-ÿ\u0400-\u04ff\u4e00-\u9fff0-9_.\s()/-]{0,38}):\s+(.+)$/;
  const turns: RawTurn[] = [];
  let speakerColonMatches = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(speakerColonRe);
    // Avoid matching URLs like https:// or keys like Note: if no dialogue exists, check speaker validity
    if (
      m &&
      !/^(https?|ftp|mailto|subject|date|time|error|warning|stack|file|line)$/i.test(
        m[1].trim()
      )
    ) {
      speakerColonMatches++;
      turns.push({
        speaker: m[1].trim(),
        timestamp: null,
        content: m[2].trim(),
      });
    } else if (turns.length > 0) {
      turns[turns.length - 1].content += `\n${trimmed}`;
    } else {
      turns.push({
        speaker: "Narrator",
        timestamp: null,
        content: trimmed,
      });
    }
  }

  if (speakerColonMatches >= 2) {
    const speakerSet = turns.map((t) => t.speaker.toLowerCase());
    const isChatGPT = speakerSet.some((s) =>
      /^(chatgpt|assistant|claude|gemini|ai|copilot|gpt-4)$/i.test(s)
    );
    const isSupport = speakerSet.some((s) =>
      /(support|agent|customer|client|helpdesk|specialist|bot)/i.test(s)
    );
    const isMeeting = speakerSet.some((s) =>
      /(moderator|host|chair|facilitator|pm|cto|ceo|lead)/i.test(s)
    );

    const detectedType: ConversationSourceType =
      hintSource && hintSource !== "plain_text"
        ? hintSource
        : isChatGPT
          ? "chatgpt"
          : isSupport
            ? "support"
            : isMeeting
              ? "meeting"
              : "plain_text";

    return { sourceType: detectedType, turns };
  }

  // 7. Plain text fallback: split by double newlines or logical sentence blocks
  const paragraphs = rawText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const plainTurns: RawTurn[] =
    paragraphs.length >= 2
      ? paragraphs.map((p, idx) => ({
          speaker: `Section ${idx + 1}`,
          timestamp: null,
          content: p,
        }))
      : rawText
          .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý\u4e00-\u9fff])/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => ({
            speaker: "Participant",
            timestamp: null,
            content: s,
          }));

  return {
    sourceType: hintSource || "plain_text",
    turns:
      plainTurns.length > 0
        ? plainTurns
        : [{ speaker: "Participant", timestamp: null, content: rawText.trim() }],
  };
}

function scoreInitialMessageImportance(content: string): {
  score: number;
  level: ImportanceLevel;
} {
  const lower = content.toLowerCase();
  let score = 25;

  if (
    /\b(critical|urgent|blocker|outage|incident|security|breach|production\s+down|sev-?1|p0|deadline|must|immediately|escalat)/i.test(
      lower
    )
  ) {
    score += 45;
  }
  if (
    /\b(decided|agreed|approved|finalized|confirmed|resolved|will\s+deploy|action\s+item|assigned\s+to|commit|launch|sign-off|acordamos|entschieden|décidé)/i.test(
      lower
    )
  ) {
    score += 30;
  }
  if (
    /\b(by\s+(monday|tuesday|wednesday|thursday|friday|eod|tomorrow|next\s+week)|202\d-\d{2}-\d{2}|q[1-4]\b|deadline|due\s+date|para\s+el|avant\s+le|bis\s+freitag)/i.test(
      lower
    )
  ) {
    score += 20;
  }
  if (
    /\b(bug|error|issue|problem|latency|failure|risk|concern|delay|bottleneck|question|\?)/i.test(
      lower
    )
  ) {
    score += 15;
  }
  if (content.split(/\s+/).length >= 18) {
    score += 10;
  }

  const clamped = Math.min(100, score);
  const level: ImportanceLevel =
    clamped >= 78
      ? "Critical"
      : clamped >= 55
        ? "High Importance"
        : clamped >= 35
          ? "Medium Importance"
          : "Low Importance";

  return { score: clamped, level };
}

export function parseConversation(
  rawText: string,
  hintSource?: ConversationSourceType
): ParsedConversationBundle {
  const { sourceType, turns } = detectAndExtractTurns(rawText, hintSource);
  const detectedLanguage = detectConversationLanguage(rawText);

  const messages: ParsedMessage[] = [];
  const participantSet = new Set<string>();
  let totalWords = 0;
  let duplicateCount = 0;
  let greetingOrNoiseCount = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const normalized = normalizeForSimilarity(turn.content);
    const words = turn.content.trim().split(/\s+/).filter(Boolean).length;
    totalWords += words;

    if (
      turn.speaker &&
      !/^(Narrator|Section\s+\d+|System)$/i.test(turn.speaker)
    ) {
      participantSet.add(turn.speaker);
    }

    const isGreetingOrNoise = isPureNoiseOrGreeting(turn.content);
    if (isGreetingOrNoise) greetingOrNoiseCount++;

    // Detect exact or high-similarity duplicate messages across earlier turns
    let isDuplicate = false;
    let duplicateOfId: number | undefined;

    if (!isGreetingOrNoise && normalized.length >= 12) {
      for (let j = Math.max(0, messages.length - 40); j < messages.length; j++) {
        const prev = messages[j];
        if (prev.isGreetingOrNoise) continue;
        const sim = computeJaccardSimilarity(normalized, prev.normalizedContent);
        if (sim >= 0.86) {
          isDuplicate = true;
          duplicateOfId = prev.id;
          duplicateCount++;
          break;
        }
      }
    }

    const { score, level } =
      isGreetingOrNoise || isDuplicate
        ? { score: 5, level: "Low Importance" as ImportanceLevel }
        : scoreInitialMessageImportance(turn.content);

    messages.push({
      id: i + 1,
      speaker: turn.speaker || "Participant",
      timestamp: turn.timestamp,
      content: turn.content,
      normalizedContent: normalized,
      wordCount: words,
      isGreetingOrNoise,
      isDuplicate,
      duplicateOfId,
      importanceScore: score,
      importanceLevel: level,
    });
  }

  const participants =
    participantSet.size > 0
      ? Array.from(participantSet)
      : ["Participant"];

  const filteredTotal = duplicateCount + greetingOrNoiseCount;
  const noiseFilteredPercent =
    messages.length > 0
      ? Math.min(95, Math.round((filteredTotal / messages.length) * 100))
      : 0;

  const estimatedReadingMinutes = Math.max(1, Math.ceil(totalWords / 200));

  return {
    detectedSourceType: sourceType,
    detectedLanguage,
    messages,
    participants,
    totalWords,
    estimatedReadingMinutes,
    duplicateCount,
    greetingOrNoiseCount,
    noiseFilteredPercent,
  };
}
