import type {
  ConvoBriefStructuredResult,
  ExtractedActionItem,
  ExtractedDeadline,
  ExtractedDecision,
  ExtractedEntity,
  ExtractedKeyPoint,
  ExtractedProblem,
  ExtractedQuestion,
  ExtractedRisk,
  ExtractedSolution,
  ImportanceLevel,
  ParsedMessage,
  ProcessingStats,
  SentimentAnalysis,
  SummaryLength,
  SummaryMode,
  TimelineEvent,
  TopicCluster,
} from "@/types/convobrief";
import type { ParsedConversationBundle } from "@/lib/parser";

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "have", "will", "your",
  "are", "was", "were", "been", "being", "has", "had", "not", "but", "what",
  "all", "can", "when", "there", "use", "each", "which", "she", "how", "their",
  "if", "do", "about", "out", "many", "then", "them", "these", "so", "some",
  "her", "would", "make", "like", "him", "into", "time", "look", "two", "more",
  "go", "see", "no", "way", "could", "my", "than", "first", "water", "just",
  "where", "most", "know", "get", "through", "back", "much", "good", "before",
  "also", "around", "another", "came", "come", "work", "three", "must", "because",
  "does", "part", "even", "place", "well", "such", "here", "take", "why", "things",
  "help", "put", "years", "different", "away", "again", "off", "went", "old",
  "number", "great", "tell", "men", "say", "small", "every", "found", "still",
  "between", "name", "should", "home", "big", "give", "air", "line", "set",
  "own", "under", "read", "last", "never", "us", "left", "end", "along", "while",
  "might", "next", "sound", "below", "saw", "something", "thought", "both", "few",
  "those", "always", "looked", "show", "large", "often", "together", "asked",
  "house", "dont", "world", "going", "want", "need", "think", "really", "actually",
  "please", "thanks", "thank", "hello", "hey", "yes", "okay", "sure", "team",
  "everyone", "guys", "let", "lets", "we", "our", "you", "they", "his", "its",
  "para", "con", "por", "una", "los", "las", "pero", "como", "que", "del",
  "les", "des", "pour", "dans", "avec", "une", "sur", "nous", "vous", "mais",
  "und", "der", "die", "das", "mit", "für", "nicht", "wir", "haben", "bitte",
]);

const KNOWN_TECH_TERMS: Record<string, string> = {
  postgresql: "PostgreSQL",
  postgres: "PostgreSQL",
  redis: "Redis",
  mongodb: "MongoDB",
  mysql: "MySQL",
  sqlite: "SQLite",
  kafka: "Apache Kafka",
  rabbitmq: "RabbitMQ",
  docker: "Docker",
  kubernetes: "Kubernetes",
  k8s: "Kubernetes",
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Microsoft Azure",
  react: "React",
  "next.js": "Next.js",
  nextjs: "Next.js",
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
  fastapi: "FastAPI",
  django: "Django",
  nodejs: "Node.js",
  "node.js": "Node.js",
  graphql: "GraphQL",
  rest: "REST API",
  grpc: "gRPC",
  oauth: "OAuth 2.0",
  jwt: "JWT",
  stripe: "Stripe",
  webhook: "Webhooks",
  webhooks: "Webhooks",
  nginx: "NGINX",
  cloudflare: "Cloudflare",
  terraform: "Terraform",
  github: "GitHub",
  gitlab: "GitLab",
  datadog: "Datadog",
  sentry: "Sentry",
  prometheus: "Prometheus",
  grafana: "Grafana",
  openai: "OpenAI",
  llm: "LLM",
  tls: "TLS/SSL",
  sso: "SSO",
  saml: "SAML",
  cdn: "CDN",
  dns: "DNS",
};

const GENERIC_SPEAKER_NAMES = new Set([
  "participant",
  "narrator",
  "sender",
  "user",
  "speaker",
  "unknown",
  "system",
  "anonymous",
]);

function isRealNamedParticipant(name: string): boolean {
  const lower = name.trim().toLowerCase();
  if (!lower) return false;
  if (GENERIC_SPEAKER_NAMES.has(lower)) return false;
  if (/^section\s+\d+$/i.test(lower)) return false;
  if (/^speaker\s+\d+$/i.test(lower)) return false;
  return true;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\n+/g, ". ")
    .split(/(?<=[.!?।！？])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 4);
}

function extractKeywords(text: string, topN = 8): string[] {
  const counts = new Map<string, number>();
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_.-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

  for (const w of words) {
    counts.set(w, (counts.get(w) || 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word);
}

function capitalizePhrase(phrase: string): string {
  if (!phrase) return "";
  return phrase
    .split(" ")
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const DEADLINE_REGEXES: RegExp[] = [
  /\b(?:by|before|until|due(?:\s+on)?|on\s+or\s+before|target(?:ing)?|scheduled\s+for)\s+((?:next\s+|this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|eod|cob|end\s+of\s+(?:day|week|month|quarter))(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|utc|est|pst)?)?)/i,
  /\b(?:by|before|until|due|on)\s+((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?(?:\s+at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)/i,
  /\b(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)\b/,
  /\b(within\s+\d+\s+(?:hours?|days?|weeks?|business\s+days?|minutes?))\b/i,
  /\b((?:eod|cob)\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday))\b/i,
  /\b(?:para\s+el|antes\s+del?)\s+((?:lunes|martes|miércoles|miercoles|jueves|viernes|mañana|\d{1,2}\s+de\s+[a-záéíóú]+))/i,
  /\b(?:avant(?:\s+le)?|d'ici)\s+((?:lundi|mardi|mercredi|jeudi|vendredi|demain|\d{1,2}\s+[a-zéû]+))/i,
  /\b(?:bis(?:\s+zum)?)\s+((?:montag|dienstag|mittwoch|donnerstag|freitag|morgen|\d{1,2}\.\d{1,2}\.))/i,
];

export function extractDeadlineExpression(text: string): string | null {
  for (const regex of DEADLINE_REGEXES) {
    const match = text.match(regex);
    if (match && match[1]) {
      return match[1].trim().replace(/[.,;!?]+$/, "");
    }
  }
  return null;
}

function detectAssigneeStrictly(
  sentence: string,
  speaker: string,
  knownParticipants: string[]
): string | null {
  const realParticipants = knownParticipants.filter(isRealNamedParticipant);

  // 1. Check explicit "assigned to Name" / "owner: Name" / "@Name"
  const explicitAssignMatch = sentence.match(
    /(?:assigned\s+to|owner\s*:\s*|responsible\s*:\s*|asignado\s+a|@)([A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)?)/
  );
  if (explicitAssignMatch && explicitAssignMatch[1]) {
    const candidate = explicitAssignMatch[1].trim();
    const matchedParticipant = realParticipants.find(
      (p) =>
        p.toLowerCase() === candidate.toLowerCase() ||
        p.toLowerCase().startsWith(candidate.toLowerCase() + " ")
    );
    if (matchedParticipant) return matchedParticipant;
    if (!STOPWORDS.has(candidate.toLowerCase()) && isRealNamedParticipant(candidate)) {
      return candidate;
    }
  }

  // 2. Check if a known real participant is explicitly named as actor ("Sarah will...", "Sarah, please...", "Sarah to...")
  for (const participant of realParticipants) {
    const firstName = participant.split(/\s+/)[0];
    if (firstName.length < 2) continue;
    const escapedFull = participant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedFirst = firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const thirdPersonTaskRe = new RegExp(
      `\\b(${escapedFull}|${escapedFirst})\\s+(?:will|should|needs\\s+to|is\\s+going\\s+to|can\\s+you|please|to\\s+(?:prepare|handle|update|fix|send|review|deploy|draft|coordinate|investigate|check|follow)|va\\s+a|doit|wird)\\b`,
      "i"
    );
    const vocativeTaskRe = new RegExp(
      `^@?(?:${escapedFull}|${escapedFirst})[,:]\\s+(?:please|can\\s+you|could\\s+you|make\\s+sure|por\\s+favor|merci\\s+de|bitte)`,
      "i"
    );
    if (thirdPersonTaskRe.test(sentence) || vocativeTaskRe.test(sentence)) {
      return participant;
    }
  }

  // 3. Check explicit first-person singular commitment ("I will...", "I'll...", "Let me...") ONLY if speaker is a real named person
  if (
    isRealNamedParticipant(speaker) &&
    /(?:^|\s)(i\s+will\s+[a-z]{3,}|i'll\s+[a-z]{3,}|i\s+am\s+going\s+to\s+[a-z]{3,}|i'm\s+going\s+to\s+[a-z]{3,}|i\s+can\s+[a-z]{3,}|let\s+me\s+[a-z]{3,}|voy\s+a\s+[a-záéíóú]{3,}|yo\s+me\s+encargo|je\s+vais\s+[a-zéèê]{3,}|je\s+m'occupe|ich\s+werde\s+[a-zäöüß]{3,}|ich\s+kümmere)(?=\s|[.,!?;:]|$)/i.test(
      sentence
    )
  ) {
    return speaker;
  }

  // Never invent or guess an assignee ("we need to...", passive voice, unassigned tasks -> null)
  return null;
}

function classifyStatementType(
  sentence: string
): "fact" | "opinion" | "assumption" {
  const lower = sentence.toLowerCase();
  if (
    /\b(assuming|assume|if\s+we\s+assume|probably|might\s+be|could\s+possibly|hypothesis|guess|suppose|perhaps|maybe)\b/.test(
      lower
    )
  ) {
    return "assumption";
  }
  if (
    /\b(i\s+think|i\s+feel|i\s+believe|in\s+my\s+opinion|imo|personally|seems\s+to\s+me|prefer|i'd\s+rather)\b/.test(
      lower
    )
  ) {
    return "opinion";
  }
  return "fact";
}

function classifyContextualImportance(
  text: string,
  opts: {
    hasDeadline?: boolean;
    isDecision?: boolean;
    isRiskOrProblem?: boolean;
    isAction?: boolean;
  } = {}
): ImportanceLevel {
  const lower = text.toLowerCase();
  let score = 30;

  if (opts.isDecision) score += 28;
  if (opts.hasDeadline) score += 20;
  if (opts.isRiskOrProblem) score += 22;
  if (opts.isAction) score += 16;

  if (
    /\b(critical|blocker|outage|sev-?1|p0|security|breach|data\s+loss|production|immediately|urgent|mandatory|compliance|escalation|crash|down)\b/.test(
      lower
    )
  ) {
    score += 35;
  } else if (
    /\b(important|priority|key|final|approved|launch|release|migration|budget|contract|sla|customer|regression|rollback)\b/.test(
      lower
    )
  ) {
    score += 18;
  }

  if (score >= 76) return "Critical";
  if (score >= 52) return "High Importance";
  if (score >= 34) return "Medium Importance";
  return "Low Importance";
}

interface ChunkWindow {
  chunkIndex: number;
  messages: ParsedMessage[];
}

function createOverlappingChunks(
  substantiveMessages: ParsedMessage[],
  chunkSize = 22,
  overlap = 4
): ChunkWindow[] {
  if (substantiveMessages.length <= chunkSize) {
    return [{ chunkIndex: 0, messages: substantiveMessages }];
  }
  const chunks: ChunkWindow[] = [];
  let start = 0;
  let idx = 0;
  const step = Math.max(1, chunkSize - overlap);
  while (start < substantiveMessages.length) {
    chunks.push({
      chunkIndex: idx++,
      messages: substantiveMessages.slice(start, start + chunkSize),
    });
    if (start + chunkSize >= substantiveMessages.length) break;
    start += step;
  }
  return chunks;
}

export function runHybridNlpAnalysis(params: {
  bundle: ParsedConversationBundle;
  mode: SummaryMode;
  lengthPreference: SummaryLength;
  customInstructions?: string;
  injectionFlagsDetected?: number;
  engineLabel?: string;
}): {
  result: ConvoBriefStructuredResult;
  stats: ProcessingStats;
  overallImportance: ImportanceLevel;
} {
  const startedAt = Date.now();
  const {
    bundle,
    mode,
    lengthPreference,
    customInstructions = "",
    injectionFlagsDetected = 0,
    engineLabel = "ConvoBrief Hybrid NLP Engine",
  } = params;

  const allMessages = bundle.messages;
  const substantive = allMessages.filter(
    (m) => !m.isGreetingOrNoise && !m.isDuplicate
  );
  const workingMessages =
    substantive.length > 0 ? substantive : allMessages.slice(0, 10);

  // Long conversation chunking with overlapping context
  const chunks = createOverlappingChunks(workingMessages, 22, 4);
  const hierarchicalMode = chunks.length > 1;

  // Custom instruction focus keywords boost
  const focusKeywords = customInstructions
    ? extractKeywords(customInstructions, 6)
    : [];

  const fullSubstantiveText = workingMessages.map((m) => m.content).join(" ");
  const topKeywords = extractKeywords(fullSubstantiveText, 12);

  // Extract Decisions (with Contradiction / Revision Superseding Detection!)
  const decisions: ExtractedDecision[] = [];
  const candidateProposals: Array<{ msgId: number; speaker: string; text: string; keywords: string[] }> = [];

  const decisionRegex =
    /(?:^|\s)(we\s+(?:decided|agreed|concluded|settled\s+on|will\s+go\s+with|are\s+going\s+with|approved|confirmed)|decision\s*:\s*|agreed\s+to|final\s+decision|let's\s+(?:go\s+with|proceed\s+with|lock\s+in|officially)|approved\s+the|switched\s+to|postponed?\s+(?:to|until)|moving\s+(?:forward\s+with|the\s+launch\s+to)|acordamos|decidimos|nous\s+avons\s+décidé|décidé\s+de|wir\s+haben\s+entschieden)(?=\s|[.,!?;:]|$)/i;

  const revisionOrContradictionRegex =
    /(?:^|\s)(actually|instead|wait|change\s+of\s+plan|hold\s+on|scratch\s+that|rather\s+than|decided\s+against|not\s+going\s+to|no\s+longer|postpone|delay(?:ed)?\s+to|override|reversing|switch(?:ing|ed)?\s+from|en\s+lugar\s+de|cambiamos|finalement|au\s+lieu\s+de|stattdessen|doch\s+nicht)(?=\s|[.,!?;:]|$)/i;

  // Process across chunks preserving seen message IDs
  const processedMsgIds = new Set<number>();

  const problems: ExtractedProblem[] = [];
  const solutions: ExtractedSolution[] = [];
  const actionItems: ExtractedActionItem[] = [];
  const deadlines: ExtractedDeadline[] = [];
  const risks: ExtractedRisk[] = [];
  const candidateQuestions: Array<{
    msgId: number;
    idxInWorking: number;
    speaker: string;
    question: string;
    keywords: string[];
  }> = [];

  const problemRegex =
    /\b(problem|issue|bug|error|failing|failed|failure|outage|latency|timeout|broken|crash(?:ing|ed)?|bottleneck|regression|blocked|blocker|complaint|mismatch|exception|500|502|503|429|oom|slow|degraded|problema|fallo|erreur|fehler)\b/i;
  const solutionRegex =
    /\b(solution|fix(?:ed)?|resolve(?:d)?|workaround|propose|recommend|suggest|we\s+can\s+(?:add|implement|cache|index|patch|rollback|upgrade|migrate|use|enable|throttle)|let's\s+(?:implement|patch|deploy|add|configure)|mitigat(?:e|ion)|solución|propongo|lösung)\b/i;
  const riskRegex =
    /\b(risk|danger|warning|vulnerability|concern|exposure|might\s+(?:break|fail|cause|delay|exceed)|could\s+(?:impact|cause|lead\s+to)|single\s+point\s+of\s+failure|compliance|sla\s+breach|riesgo|risque|risiko)\b/i;
  const actionRegex =
    /(?:^|\s)(action\s+item|todo|to-do|task\s*:|need(?:s)?\s+to\s+(?:be\s+)?[a-z]{3,}|must\s+(?:be\s+)?[a-z]{3,}|should\s+be\s+[a-z]{3,}ed|i\s+will\s+[a-z]{3,}|i'll\s+[a-z]{3,}|[A-Z][a-z]+\s+will\s+[a-z]{3,}|please\s+[a-z]{3,}|por\s+favor|voy\s+a\s+[a-záéíóú]{3,}|vamos\s+a\s+[a-záéíóú]{3,}|hay\s+que|je\s+vais\s+[a-zéèê]{3,}|merci\s+de|bitte|ich\s+werde)(?=\s|[.,!?;:]|$)/i;

  for (const chunk of chunks) {
    for (const msg of chunk.messages) {
      if (processedMsgIds.has(msg.id)) continue;
      processedMsgIds.add(msg.id);

      const workingIdx = workingMessages.findIndex((m) => m.id === msg.id);
      const sentences = splitSentences(msg.content);

      for (const sentence of sentences) {
        const sentKeywords = extractKeywords(sentence, 6);

        // Track early proposals for contradiction/revision tracking
        if (
          /\b(let's|we\s+should|plan\s+is\s+to|propose|schedule\s+for|target(?:ing)?|deploy\s+on|use\s+)\b/i.test(
            sentence
          )
        ) {
          candidateProposals.push({
            msgId: msg.id,
            speaker: msg.speaker,
            text: sentence,
            keywords: sentKeywords,
          });
        }

        // 1. Decisions + Contradiction resolution
        const isRevision = revisionOrContradictionRegex.test(sentence);
        if (decisionRegex.test(sentence) || (isRevision && sentKeywords.length >= 2 && /\b(will|let's|going\s+to|agreed|decided|move|postpone|switch|use)\b/i.test(sentence))) {
          let supersededContext: string | null = null;
          const relatedMsgIds = [msg.id];

          if (isRevision && candidateProposals.length > 0) {
            // Find earlier proposal with overlapping topic keywords or temporal conflict
            for (let p = candidateProposals.length - 1; p >= 0; p--) {
              const earlier = candidateProposals[p];
              if (earlier.msgId >= msg.id) continue;
              const overlap = earlier.keywords.filter((k) =>
                sentKeywords.includes(k)
              );
              const bothTemporal =
                extractDeadlineExpression(earlier.text) !== null &&
                extractDeadlineExpression(sentence) !== null;
              if (overlap.length >= 1 || bothTemporal) {
                supersededContext = `Supersedes earlier proposal in Msg #${earlier.msgId} ("${earlier.text.slice(0, 110)}")`;
                relatedMsgIds.unshift(earlier.msgId);

                // If an earlier decision covered the exact same superseded proposal, remove or update it
                const staleIdx = decisions.findIndex((d) =>
                  d.source_message_ids.includes(earlier.msgId)
                );
                if (staleIdx !== -1) {
                  decisions.splice(staleIdx, 1);
                }
                break;
              }
            }
          }

          if (!decisions.some((d) => d.decision.toLowerCase() === sentence.toLowerCase())) {
            decisions.push({
              id: `dec-${decisions.length + 1}`,
              decision: sentence,
              rationale: supersededContext
                ? `${supersededContext}. Updated based on later discussion.`
                : `Confirmed during discussion by ${isRealNamedParticipant(msg.speaker) ? msg.speaker : "participants"}.`,
              superseded_context: supersededContext,
              decided_by: isRealNamedParticipant(msg.speaker) ? msg.speaker : null,
              importance: classifyContextualImportance(sentence, {
                isDecision: true,
                hasDeadline: extractDeadlineExpression(sentence) !== null,
              }),
              source_message_ids: Array.from(new Set(relatedMsgIds)),
            });
          }
        }

        // 2. Deadlines
        const dateExpr = extractDeadlineExpression(sentence);
        if (dateExpr) {
          const owner = detectAssigneeStrictly(
            sentence,
            msg.speaker,
            bundle.participants
          );
          if (
            !deadlines.some(
              (d) =>
                d.date_expression.toLowerCase() === dateExpr.toLowerCase() &&
                d.source_message_ids.includes(msg.id)
            )
          ) {
            deadlines.push({
              id: `dl-${deadlines.length + 1}`,
              date_expression: dateExpr,
              milestone: sentence,
              owner,
              importance: classifyContextualImportance(sentence, {
                hasDeadline: true,
              }),
              source_message_ids: [msg.id],
            });
          }
        }

        // 3. Action Items (Strictly grounded: never invent assignee or deadline!)
        if (actionRegex.test(sentence) && !sentence.trim().endsWith("?")) {
          const assignee = detectAssigneeStrictly(
            sentence,
            msg.speaker,
            bundle.participants
          );
          const itemDeadline = extractDeadlineExpression(sentence);
          const status: ExtractedActionItem["status"] = /\b(completed|done|finished|deployed|merged|fixed\s+already)\b/i.test(
            sentence
          )
            ? "completed"
            : /\b(working\s+on|in\s+progress|currently\s+testing|investigating)\b/i.test(
                  sentence
                )
              ? "in progress"
              : assignee || itemDeadline
                ? "pending"
                : "not specified";

          if (
            !actionItems.some(
              (a) => a.task.toLowerCase() === sentence.toLowerCase()
            )
          ) {
            actionItems.push({
              id: `act-${actionItems.length + 1}`,
              task: sentence,
              assigned_to: assignee, // null when unspecified!
              deadline: itemDeadline, // null when unspecified!
              status,
              importance: classifyContextualImportance(sentence, {
                isAction: true,
                hasDeadline: itemDeadline !== null,
              }),
              source_message_ids: [msg.id],
            });
          }
        }

        // 4. Problems
        if (problemRegex.test(sentence) && !solutionRegex.test(sentence)) {
          if (
            !problems.some(
              (p) => p.problem.toLowerCase() === sentence.toLowerCase()
            )
          ) {
            problems.push({
              id: `prob-${problems.length + 1}`,
              problem: sentence,
              reported_by: isRealNamedParticipant(msg.speaker)
                ? msg.speaker
                : null,
              importance: classifyContextualImportance(sentence, {
                isRiskOrProblem: true,
              }),
              linked_solution_ids: [],
              resolution_status: "unresolved",
              source_message_ids: [msg.id],
            });
          }
        }

        // 5. Proposed Solutions
        if (solutionRegex.test(sentence)) {
          if (
            !solutions.some(
              (s) => s.solution.toLowerCase() === sentence.toLowerCase()
            )
          ) {
            const isAdopted = decisionRegex.test(sentence) ||
              workingMessages
                .slice(workingIdx + 1, workingIdx + 5)
                .some((later) =>
                  /\b(agreed|let's\s+do\s+that|approved|good\s+plan|yes\s+let's|works\s+for\s+me|go\s+ahead)\b/i.test(
                    later.content
                  )
                );

            solutions.push({
              id: `sol-${solutions.length + 1}`,
              solution: sentence,
              proposed_by: isRealNamedParticipant(msg.speaker)
                ? msg.speaker
                : null,
              addresses_problem: "General technical or operational challenge",
              outcome: isAdopted ? "adopted" : "under consideration",
              importance: classifyContextualImportance(sentence, {
                isDecision: isAdopted,
              }),
              source_message_ids: [msg.id],
            });
          }
        }

        // 6. Risks
        if (riskRegex.test(sentence)) {
          if (
            !risks.some((r) => r.risk.toLowerCase() === sentence.toLowerCase())
          ) {
            risks.push({
              id: `risk-${risks.length + 1}`,
              risk: sentence,
              impact: "Potential operational, schedule, or reliability impact identified in conversation.",
              mitigation: null,
              importance: classifyContextualImportance(sentence, {
                isRiskOrProblem: true,
              }),
              source_message_ids: [msg.id],
            });
          }
        }

        // 7. Questions
        if (
          sentence.trim().endsWith("?") &&
          sentence.split(/\s+/).length >= 4
        ) {
          candidateQuestions.push({
            msgId: msg.id,
            idxInWorking: workingIdx,
            speaker: msg.speaker,
            question: sentence,
            keywords: sentKeywords,
          });
        }
      }
    }
  }

  // Link Problems <-> Proposed Solutions & Build Context Preservation Chains!
  const contextChains: ConvoBriefStructuredResult["context_chains"] = [];

  for (const prob of problems) {
    const probKeywords = extractKeywords(prob.problem, 6);
    const probMsgId = prob.source_message_ids[0];

    for (const sol of solutions) {
      const solMsgId = sol.source_message_ids[0];
      if (solMsgId < probMsgId) continue;
      const solKeywords = extractKeywords(sol.solution, 6);
      const shared = probKeywords.filter((k) => solKeywords.includes(k));

      if (shared.length >= 1 || problems.length === 1) {
        prob.linked_solution_ids.push(sol.id);
        sol.addresses_problem = prob.problem;
        prob.resolution_status =
          sol.outcome === "adopted" ? "resolved" : "partially addressed";

        // Check if a final decision also connects to this arc
        const matchingDecision = decisions.find(
          (d) =>
            d.source_message_ids[0] >= solMsgId &&
            extractKeywords(d.decision, 6).some(
              (k) => probKeywords.includes(k) || solKeywords.includes(k)
            )
        );

        if (contextChains.length < 5) {
          contextChains.push({
            arc_summary: `Issue raised in Msg #${probMsgId} ("${prob.problem.slice(0, 75)}...") → Solution proposed in Msg #${solMsgId} ("${sol.solution.slice(0, 75)}...")${
              matchingDecision
                ? ` → Finalized in Msg #${matchingDecision.source_message_ids[matchingDecision.source_message_ids.length - 1]}`
                : ""
            }`,
            early_message_id: probMsgId,
            middle_message_id: solMsgId,
            final_message_id: matchingDecision
              ? matchingDecision.source_message_ids[
                  matchingDecision.source_message_ids.length - 1
                ]
              : solMsgId,
          });
        }
      }
    }

    // Link mitigation on risks if matching solution exists
    for (const risk of risks) {
      if (!risk.mitigation && solutions.length > 0) {
        const riskKw = extractKeywords(risk.risk, 5);
        const matchSol = solutions.find((s) =>
          extractKeywords(s.solution, 5).some((k) => riskKw.includes(k))
        );
        if (matchSol) {
          risk.mitigation = matchSol.solution;
        }
      }
    }
  }

  // Filter Unresolved Questions: Check if subsequent messages answered them
  const unresolvedQuestions: ExtractedQuestion[] = [];
  for (const q of candidateQuestions) {
    const laterWindow = workingMessages.slice(
      q.idxInWorking + 1,
      q.idxInWorking + 7
    );
    let answered = false;

    for (const reply of laterWindow) {
      if (reply.speaker === q.speaker && bundle.participants.length > 1) {
        continue;
      }
      if (reply.content.trim().endsWith("?")) continue;
      const replyKw = extractKeywords(reply.content, 10);
      const overlap = q.keywords.filter((k) => replyKw.includes(k));
      const directYesNoAnswer =
        reply === laterWindow[0] &&
        /\b(yes|no|confirmed|correct|exactly|because|it's|it\s+is|we\s+have|we\s+are|sí|oui|ja|nein)\b/i.test(
          reply.content
        );

      if (overlap.length >= 2 || (directYesNoAnswer && overlap.length >= 1)) {
        answered = true;
        break;
      }
    }

    if (!answered) {
      unresolvedQuestions.push({
        id: `q-${unresolvedQuestions.length + 1}`,
        question: q.question,
        asked_by: isRealNamedParticipant(q.speaker) ? q.speaker : null,
        context: `Raised in message #${q.msgId} with no definitive answer recorded in subsequent turns.`,
        importance: classifyContextualImportance(q.question, {
          hasDeadline: extractDeadlineExpression(q.question) !== null,
        }),
        source_message_ids: [q.msgId],
      });
    }
  }

  // Score & Extract Key Points via TF-IDF / Centroid Relevance + Focus Boosting
  const scoredSentences: Array<{
    sentence: string;
    msgId: number;
    speaker: string;
    score: number;
  }> = [];

  for (const msg of workingMessages) {
    const sents = splitSentences(msg.content);
    for (const s of sents) {
      if (s.length < 15) continue;
      const kws = extractKeywords(s, 8);
      let score = msg.importanceScore * 0.5;
      for (const kw of kws) {
        if (topKeywords.includes(kw)) score += 9;
        if (focusKeywords.includes(kw)) score += 22; // Custom instruction focus boost
      }
      if (/\d/.test(s)) score += 6; // Concrete factual/metric specificity
      scoredSentences.push({
        sentence: s,
        msgId: msg.id,
        speaker: msg.speaker,
        score,
      });
    }
  }

  scoredSentences.sort((a, b) => b.score - a.score);

  const targetKeyPointCount =
    lengthPreference === "concise"
      ? 4
      : lengthPreference === "comprehensive"
        ? 9
        : 6;

  const keyPoints: ExtractedKeyPoint[] = [];
  for (const item of scoredSentences) {
    if (keyPoints.length >= targetKeyPointCount) break;
    const isTooSimilar = keyPoints.some((existing) => {
      const a = existing.point.toLowerCase();
      const b = item.sentence.toLowerCase();
      return a === b || a.includes(b) || b.includes(a);
    });
    if (isTooSimilar) continue;

    keyPoints.push({
      id: `kp-${keyPoints.length + 1}`,
      point: item.sentence,
      statement_type: classifyStatementType(item.sentence),
      importance: classifyContextualImportance(item.sentence, {
        hasDeadline: extractDeadlineExpression(item.sentence) !== null,
        isDecision: decisionRegex.test(item.sentence),
      }),
      speaker: isRealNamedParticipant(item.speaker) ? item.speaker : undefined,
      source_message_ids: [item.msgId],
    });
  }

  // Named Entity & Technical Term Extraction (Strictly grounded in source!)
  const entitiesMap = new Map<string, ExtractedEntity>();

  const registerEntity = (
    name: string,
    type: ExtractedEntity["type"],
    msgId: number,
    contextSnippet: string
  ) => {
    const key = `${type}:${name.toLowerCase()}`;
    const existing = entitiesMap.get(key);
    if (existing) {
      existing.mentions += 1;
      if (!existing.source_message_ids.includes(msgId)) {
        existing.source_message_ids.push(msgId);
      }
      if (existing.mentions >= 4 && existing.importance === "Medium Importance") {
        existing.importance = "High Importance";
      }
    } else {
      entitiesMap.set(key, {
        name,
        type,
        mentions: 1,
        context: contextSnippet.slice(0, 120),
        importance: type === "Technology" || type === "Organization" ? "High Importance" : "Medium Importance",
        source_message_ids: [msgId],
      });
    }
  };

  // Add real participants
  for (const msg of workingMessages) {
    if (isRealNamedParticipant(msg.speaker)) {
      registerEntity(msg.speaker, "Person", msg.id, `Active conversation participant`);
    }

    // Technical terms
    const wordsAndTokens = msg.content.split(/[\s,;:()\[\]{}"']+/).filter(Boolean);
    for (const rawTok of wordsAndTokens) {
      const cleanLower = rawTok.toLowerCase().replace(/[.?]+$/, "");
      if (KNOWN_TECH_TERMS[cleanLower]) {
        registerEntity(
          KNOWN_TECH_TERMS[cleanLower],
          "Technology",
          msg.id,
          msg.content
        );
      } else if (/^v\d+\.\d+(?:\.\d+)?$/i.test(rawTok) || /^(?:HTTP\s*)?[45]\d{2}$/.test(rawTok) || /^[A-Z]{2,}_[A-Z0-9_]+$/.test(rawTok)) {
        registerEntity(rawTok, "Metric / Term", msg.id, msg.content);
      }
    }

    // Metrics ($ amounts, percentages, ms latencies)
    const metricMatches =
      msg.content.match(
        /(?:\$\d[\d,.]*\s*(?:k|m|million|thousand)?|\d+(?:\.\d+)?%|\d+\s*(?:ms|req\/s|rps|gb|tb|users))/gi
      ) || [];
    for (const met of metricMatches.slice(0, 3)) {
      registerEntity(met.trim(), "Metric / Term", msg.id, msg.content);
    }

    // Organizations (Capitalized phrases ending with Corp, Inc, Labs, Cloud, Team, Bank, Group, Ltd, Systems, AI)
    const orgMatches =
      msg.content.match(
        /\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2}\s+(?:Inc\.?|Corp\.?|LLC|Ltd\.?|Labs|Systems|Cloud|Bank|Enterprise|Group|Technologies|Security))\b/g
      ) || [];
    for (const org of orgMatches) {
      registerEntity(org.trim(), "Organization", msg.id, msg.content);
    }
  }

  const importantEntities = Array.from(entitiesMap.values())
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 14);

  // Conversation Timeline Construction (Chronological narrative milestones)
  const timeline: TimelineEvent[] = [];
  const totalWorking = workingMessages.length;

  if (totalWorking > 0) {
    const firstMsg = workingMessages[0];
    timeline.push({
      id: "tl-1",
      phase: "Opening / Context",
      timestamp_label: firstMsg.timestamp || `Message #${firstMsg.id}`,
      event: splitSentences(firstMsg.content)[0] || firstMsg.content.slice(0, 140),
      actor: isRealNamedParticipant(firstMsg.speaker) ? firstMsg.speaker : null,
      importance: firstMsg.importanceLevel,
      source_message_ids: [firstMsg.id],
    });
  }

  for (const prob of problems.slice(0, 2)) {
    const msg = allMessages.find((m) => m.id === prob.source_message_ids[0]);
    if (msg && !timeline.some((t) => t.source_message_ids.includes(msg.id))) {
      timeline.push({
        id: `tl-${timeline.length + 1}`,
        phase: "Problem & Investigation",
        timestamp_label: msg.timestamp || `Message #${msg.id}`,
        event: prob.problem,
        actor: prob.reported_by,
        importance: prob.importance,
        source_message_ids: [msg.id],
      });
    }
  }

  for (const sol of solutions.slice(0, 2)) {
    const msg = allMessages.find((m) => m.id === sol.source_message_ids[0]);
    if (msg && !timeline.some((t) => t.source_message_ids.includes(msg.id))) {
      timeline.push({
        id: `tl-${timeline.length + 1}`,
        phase: "Discussion & Proposals",
        timestamp_label: msg.timestamp || `Message #${msg.id}`,
        event: sol.solution,
        actor: sol.proposed_by,
        importance: sol.importance,
        source_message_ids: [msg.id],
      });
    }
  }

  for (const dec of decisions.slice(0, 3)) {
    const lastId = dec.source_message_ids[dec.source_message_ids.length - 1];
    const msg = allMessages.find((m) => m.id === lastId);
    if (msg && !timeline.some((t) => t.source_message_ids.includes(msg.id))) {
      timeline.push({
        id: `tl-${timeline.length + 1}`,
        phase: "Resolution & Decisions",
        timestamp_label: msg.timestamp || `Message #${msg.id}`,
        event: dec.decision,
        actor: dec.decided_by,
        importance: dec.importance,
        source_message_ids: dec.source_message_ids,
      });
    }
  }

  for (const act of actionItems.slice(0, 2)) {
    const msg = allMessages.find((m) => m.id === act.source_message_ids[0]);
    if (msg && !timeline.some((t) => t.source_message_ids.includes(msg.id))) {
      timeline.push({
        id: `tl-${timeline.length + 1}`,
        phase: "Next Steps",
        timestamp_label: msg.timestamp || `Message #${msg.id}`,
        event: `${act.task} (Owner: ${act.assigned_to || "Not specified"}, Deadline: ${act.deadline || "Not specified"})`,
        actor: act.assigned_to,
        importance: act.importance,
        source_message_ids: [msg.id],
      });
    }
  }

  timeline.sort(
    (a, b) =>
      (a.source_message_ids[0] || 0) - (b.source_message_ids[0] || 0)
  );

  // Topic Clustering
  const topicClusters: TopicCluster[] = [];
  const clusterSeeds = topKeywords.slice(0, 4);
  for (const seed of clusterSeeds) {
    const matchingMsgs = workingMessages.filter((m) =>
      m.normalizedContent.includes(seed)
    );
    if (matchingMsgs.length === 0) continue;
    const subKws = extractKeywords(
      matchingMsgs.map((m) => m.content).join(" "),
      4
    );
    const share = Math.min(
      100,
      Math.max(10, Math.round((matchingMsgs.length / workingMessages.length) * 100))
    );
    topicClusters.push({
      topic: capitalizePhrase(subKws.slice(0, 2).join(" & ") || seed),
      keywords: subKws,
      message_count: matchingMsgs.length,
      share_percent: share,
      importance:
        matchingMsgs.some((m) => m.importanceLevel === "Critical")
          ? "Critical"
          : matchingMsgs.some((m) => m.importanceLevel === "High Importance")
            ? "High Importance"
            : "Medium Importance",
      source_message_ids: matchingMsgs.slice(0, 8).map((m) => m.id),
    });
  }

  // Sentiment & Discussion Tone Analysis
  let posCount = 0;
  let concernCount = 0;
  let neutralCount = 0;

  for (const msg of workingMessages) {
    const l = msg.content.toLowerCase();
    const hasConcern =
      /\b(error|urgent|fail|problem|delay|worried|concern|blocker|risk|broken|outage|critical|disagree|unfortunately)\b/.test(
        l
      );
    const hasPositive =
      /\b(resolved|agreed|approved|great|fixed|ready|success|confident|clean|improved|helpful|confirmed)\b/.test(
        l
      );
    if (hasConcern && !hasPositive) concernCount++;
    else if (hasPositive) posCount++;
    else neutralCount++;
  }

  const totalSent = Math.max(1, posCount + concernCount + neutralCount);
  const posPct = Math.round((posCount / totalSent) * 100);
  const conPct = Math.round((concernCount / totalSent) * 100);
  const neuPct = Math.max(0, 100 - posPct - conPct);

  const techEntitiesCount = importantEntities.filter(
    (e) => e.type === "Technology"
  ).length;

  const overallTone: SentimentAnalysis["overall_tone"] =
    conPct >= 45
      ? "Tense / Escalated"
      : actionItems.length >= 3 || deadlines.length >= 2
        ? "Urgent & Action-Focused"
        : techEntitiesCount >= 2
          ? "Analytical & Technical"
          : posPct >= 25
            ? "Collaborative & Constructive"
            : "Informational & Neutral";

  const firstHalfConcern = workingMessages
    .slice(0, Math.ceil(workingMessages.length / 2))
    .some((m) => problemRegex.test(m.content));
  const secondHalfResolved =
    decisions.length > 0 || solutions.some((s) => s.outcome === "adopted");

  const toneProgression =
    firstHalfConcern && secondHalfResolved
      ? "Opened with problem identification and urgency, progressing toward constructive alignment and concrete resolution."
      : firstHalfConcern
        ? "Focused on diagnosing active issues and risks; several items remain open for follow-up."
        : "Maintained steady informational and planning focus throughout the exchange.";

  const sentiment: SentimentAnalysis = {
    overall_tone: overallTone,
    polarity_breakdown: {
      positive: posPct,
      neutral: neuPct,
      concerned: conPct,
    },
    tone_progression: toneProgression,
  };

  // Main Topic, Title, Purpose, Historical Context & Mode-Tailored Overview
  const primaryKeywordsLabel =
    topKeywords.length >= 2
      ? capitalizePhrase(topKeywords.slice(0, 3).join(", "))
      : "General Discussion";

  const conversationTitle =
    topKeywords.length >= 2
      ? `${capitalizePhrase(topKeywords.slice(0, 2).join(" "))} — ${
          decisions.length > 0
            ? "Decisions & Action Brief"
            : problems.length > 0
              ? "Issue Analysis & Resolution"
              : "Conversation Brief"
        }`
      : "Conversation Intelligence Brief";

  const mainTopic =
    keyPoints.length > 0
      ? `Discussion centered on ${topKeywords.slice(0, 4).join(", ")} (${workingMessages.length} substantive turns across ${bundle.participants.length} participant${bundle.participants.length === 1 ? "" : "s"}).`
      : `Conversation covering ${primaryKeywordsLabel}.`;

  const purpose =
    decisions.length > 0 && actionItems.length > 0
      ? "Align on decisions, resolve open issues, and assign concrete follow-up tasks."
      : problems.length > 0
        ? "Diagnose reported problems, evaluate proposed solutions, and determine next steps."
        : actionItems.length > 0
          ? "Coordinate tasks, responsibilities, and operational timelines."
          : "Share information, clarify context, and align understanding across participants.";

  // Historical Context detection (references to prior events, last week, previous version, earlier incident)
  const historicalSentences: string[] = [];
  for (const msg of workingMessages) {
    for (const s of splitSentences(msg.content)) {
      if (
        /\b(previously|last\s+(?:week|month|quarter|sprint|release)|earlier|yesterday|since\s+v?\d|historically|background|originally|prior\s+to|in\s+the\s+past)\b/i.test(
          s
        )
      ) {
        historicalSentences.push(`${s} [Msg #${msg.id}]`);
      }
    }
  }
  const historicalContext =
    historicalSentences.length > 0
      ? historicalSentences.slice(0, 2).join(" ")
      : "No explicit prior historical events were referenced outside the scope of the current conversation.";

  // Mode-specific formatting (6 modes!)
  const { overview, modeBullets } = composeModeSpecificSummary({
    mode,
    lengthPreference,
    customInstructions,
    bundle,
    workingMessages,
    keyPoints,
    decisions,
    actionItems,
    deadlines,
    problems,
    solutions,
    risks,
    unresolvedQuestions,
    importantEntities,
    contextChains,
  });

  const conclusion =
    decisions.length > 0
      ? `The conversation concluded with ${decisions.length} confirmed decision(s) and ${actionItems.length} action item(s)${
          unresolvedQuestions.length > 0
            ? `, while ${unresolvedQuestions.length} question(s) remain open for follow-up.`
            : "."
        }`
      : actionItems.length > 0
        ? `No formal binding decision was explicitly declared, but ${actionItems.length} actionable next step(s) were identified.`
        : `Informational exchange summarized from ${workingMessages.length} substantive messages (${bundle.noiseFilteredPercent}% repetitive/greeting noise removed).`;

  // Compute overall conversation importance
  const hasCritical =
    decisions.some((d) => d.importance === "Critical") ||
    actionItems.some((a) => a.importance === "Critical") ||
    problems.some((p) => p.importance === "Critical") ||
    risks.some((r) => r.importance === "Critical") ||
    keyPoints.some((k) => k.importance === "Critical");

  const hasHigh =
    decisions.length > 0 ||
    actionItems.length > 0 ||
    deadlines.length > 0 ||
    problems.length > 0;

  const overallImportance: ImportanceLevel = hasCritical
    ? "Critical"
    : hasHigh
      ? "High Importance"
      : workingMessages.length >= 3
        ? "Medium Importance"
        : "Low Importance";

  const result: ConvoBriefStructuredResult = {
    conversation_title: conversationTitle,
    overview,
    mode_bullets: modeBullets,
    main_topic: mainTopic,
    purpose,
    historical_context: historicalContext,
    key_points: keyPoints,
    important_decisions: decisions,
    action_items: actionItems,
    deadlines,
    unresolved_questions: unresolvedQuestions,
    problems,
    proposed_solutions: solutions,
    important_entities: importantEntities,
    conversation_timeline: timeline,
    risks,
    conclusion,
    topic_clusters: topicClusters,
    sentiment,
    detected_language: bundle.detectedLanguage,
    context_chains: contextChains,
  };

  const stats: ProcessingStats = {
    chunks_processed: chunks.length,
    overlap_window_messages: hierarchicalMode ? 4 : 0,
    total_messages: allMessages.length,
    substantive_messages: workingMessages.length,
    duplicates_removed: bundle.duplicateCount,
    greetings_and_filler_removed: bundle.greetingOrNoiseCount,
    noise_reduction_percent: bundle.noiseFilteredPercent,
    processing_time_ms: Math.max(1, Date.now() - startedAt),
    prompt_injection_flags_neutralized: injectionFlagsDetected,
    engine_name: engineLabel,
    hierarchical_mode: hierarchicalMode,
  };

  return { result, stats, overallImportance };
}

function composeModeSpecificSummary(ctx: {
  mode: SummaryMode;
  lengthPreference: SummaryLength;
  customInstructions: string;
  bundle: ParsedConversationBundle;
  workingMessages: ParsedMessage[];
  keyPoints: ExtractedKeyPoint[];
  decisions: ExtractedDecision[];
  actionItems: ExtractedActionItem[];
  deadlines: ExtractedDeadline[];
  problems: ExtractedProblem[];
  solutions: ExtractedSolution[];
  risks: ExtractedRisk[];
  unresolvedQuestions: ExtractedQuestion[];
  importantEntities: ExtractedEntity[];
  contextChains: ConvoBriefStructuredResult["context_chains"];
}): { overview: string; modeBullets: string[] } {
  const {
    mode,
    lengthPreference,
    customInstructions,
    bundle,
    keyPoints,
    decisions,
    actionItems,
    deadlines,
    problems,
    solutions,
    risks,
    unresolvedQuestions,
    importantEntities,
    contextChains,
  } = ctx;

  const bullets: string[] = [];

  if (mode === "quick") {
    // 3–5 crisp bullet points
    if (keyPoints[0]) bullets.push(keyPoints[0].point);
    if (problems[0]) {
      const linkedSol = solutions[0];
      bullets.push(
        linkedSol
          ? `Issue & Fix: ${problems[0].problem} → ${linkedSol.solution}`
          : `Issue Identified: ${problems[0].problem}`
      );
    }
    if (decisions[0]) bullets.push(`Decision: ${decisions[0].decision}`);
    if (actionItems[0]) {
      bullets.push(
        `Next Step: ${actionItems[0].task} (Owner: ${actionItems[0].assigned_to || "Not specified"}, Deadline: ${actionItems[0].deadline || "Not specified"})`
      );
    }
    for (const kp of keyPoints.slice(1)) {
      if (bullets.length >= 5) break;
      if (!bullets.includes(kp.point)) bullets.push(kp.point);
    }
    const finalBullets = bullets.slice(0, 5);
    return {
      overview: finalBullets.join(" "),
      modeBullets: finalBullets,
    };
  }

  if (mode === "executive") {
    if (decisions.length > 0) {
      bullets.push(
        `Strategic Decisions (${decisions.length}): ${decisions.map((d) => d.decision).slice(0, 2).join(" | ")}`
      );
    }
    if (risks.length > 0 || problems.length > 0) {
      bullets.push(
        `Key Risks & Blockers: ${[...risks.map((r) => r.risk), ...problems.map((p) => p.problem)].slice(0, 2).join(" | ")}`
      );
    }
    if (deadlines.length > 0) {
      bullets.push(
        `Critical Milestones: ${deadlines.map((d) => `${d.date_expression} — ${d.milestone}`).slice(0, 2).join(" | ")}`
      );
    }
    if (actionItems.length > 0) {
      bullets.push(
        `Resource Commitments: ${actionItems.length} action item(s) tracked (${actionItems.filter((a) => a.assigned_to).length} assigned, ${actionItems.filter((a) => !a.assigned_to).length} unassigned).`
      );
    }
    if (bullets.length === 0 && keyPoints[0]) {
      bullets.push(keyPoints[0].point);
    }
    const execOverview = `Executive Brief across ${bundle.participants.length} stakeholder(s): ${
      keyPoints[0]?.point || ""
    } ${
      decisions.length > 0
        ? `Leadership/participants aligned on ${decisions.length} decision(s), notably: ${decisions[0].decision}`
        : "No formal executive sign-off was recorded."
    } ${
      risks.length > 0
        ? `Primary risk flagged: ${risks[0].risk}`
        : ""
    }`.trim();

    return { overview: execOverview, modeBullets: bullets };
  }

  if (mode === "technical") {
    const techStack = importantEntities
      .filter((e) => e.type === "Technology" || e.type === "Metric / Term")
      .map((e) => e.name);
    if (techStack.length > 0) {
      bullets.push(`Technologies & Metrics Referenced: ${techStack.join(", ")}`);
    }
    for (const p of problems.slice(0, 3)) {
      bullets.push(`Technical Issue [Msg #${p.source_message_ids[0]}]: ${p.problem}`);
    }
    for (const s of solutions.slice(0, 3)) {
      bullets.push(`Proposed Engineering Fix (${s.outcome}): ${s.solution}`);
    }
    for (const d of decisions.slice(0, 2)) {
      bullets.push(`Architecture / Ops Decision: ${d.decision}`);
    }
    if (bullets.length === 0) {
      bullets.push(...keyPoints.slice(0, 4).map((k) => k.point));
    }
    const techOverview = `Technical Analysis${
      techStack.length > 0 ? ` [${techStack.slice(0, 5).join(", ")}]` : ""
    }: ${
      problems.length > 0
        ? `Root problem centered on: ${problems[0].problem}`
        : keyPoints[0]?.point || ""
    } ${
      solutions.length > 0
        ? `Engineering solution discussed: ${solutions[0].solution}`
        : ""
    } ${decisions[0] ? `Final technical decision: ${decisions[0].decision}` : ""}`.trim();

    return { overview: techOverview, modeBullets: bullets };
  }

  if (mode === "meeting") {
    const attendees = bundle.participants.filter(isRealNamedParticipant);
    bullets.push(
      `Attendees (${attendees.length || 1}): ${attendees.length > 0 ? attendees.join(", ") : "Not specified"}`
    );
    if (keyPoints.length > 0) {
      bullets.push(
        `Core Discussion: ${keyPoints.slice(0, 2).map((k) => k.point).join(" ")}`
      );
    }
    if (decisions.length > 0) {
      bullets.push(
        `Agreed Decisions: ${decisions.map((d) => d.decision).join(" | ")}`
      );
    }
    if (actionItems.length > 0) {
      for (const a of actionItems.slice(0, 4)) {
        bullets.push(
          `Follow-up Task: ${a.task} — Responsible: ${a.assigned_to || "Not specified"} | Due: ${a.deadline || "Not specified"}`
        );
      }
    }
    if (unresolvedQuestions.length > 0) {
      bullets.push(
        `Open Parking-Lot Questions: ${unresolvedQuestions.map((q) => q.question).slice(0, 2).join(" | ")}`
      );
    }

    const meetingOverview = `Meeting Summary (${
      attendees.length > 0 ? attendees.join(", ") : "Participants not named"
    }): Covered ${keyPoints.length} primary discussion point(s), reached ${decisions.length} decision(s), and logged ${actionItems.length} follow-up task(s). ${
      decisions[0] ? `Key agreement: ${decisions[0].decision}` : keyPoints[0]?.point || ""
    }`.trim();

    return { overview: meetingOverview, modeBullets: bullets };
  }

  if (mode === "action") {
    if (actionItems.length > 0) {
      for (const a of actionItems) {
        bullets.push(
          `[${a.importance}] ${a.task} — Owner: ${a.assigned_to || "Not specified"} | Deadline: ${a.deadline || "Not specified"}`
        );
      }
    } else {
      bullets.push("No explicit tasks or action commitments were stated in the source conversation.");
    }
    for (const dl of deadlines.slice(0, 3)) {
      bullets.push(
        `Deadline (${dl.date_expression}): ${dl.milestone} — Owner: ${dl.owner || "Not specified"}`
      );
    }
    const actionOverview =
      actionItems.length > 0
        ? `Action-Oriented Execution Plan: Extracted ${actionItems.length} concrete task(s), ${actionItems.filter((a) => a.assigned_to !== null).length} explicitly assigned owner(s), and ${deadlines.length} stated deadline(s). Any unspecified owners or dates are strictly marked "Not specified".`
        : `No actionable tasks, owners, or deadlines were specified in this conversation.`;

    return { overview: actionOverview, modeBullets: bullets };
  }

  // Default: "detailed" mode
  const maxSent =
    lengthPreference === "concise" ? 2 : lengthPreference === "comprehensive" ? 5 : 3;
  const narrativeParts: string[] = [];

  for (const kp of keyPoints.slice(0, maxSent)) {
    narrativeParts.push(kp.point);
    bullets.push(kp.point);
  }
  if (contextChains.length > 0) {
    narrativeParts.push(`Context Arc: ${contextChains[0].arc_summary}.`);
    bullets.push(`Context Continuity: ${contextChains[0].arc_summary}`);
  }
  if (decisions.length > 0 && !narrativeParts.some((p) => p.includes(decisions[0].decision))) {
    narrativeParts.push(`Final Decision: ${decisions[0].decision}`);
    bullets.push(`Decision: ${decisions[0].decision}`);
  }
  if (customInstructions) {
    bullets.push(`Custom Focus Applied: "${customInstructions}"`);
  }

  return {
    overview: narrativeParts.join(" "),
    modeBullets: bullets,
  };
}

/**
 * Strictly Grounded Follow-Up Question Answering Engine
 * Answers user follow-up questions exclusively from the analyzed conversation and extracted intelligence,
 * returning exact cited message IDs.
 */
export function answerFollowUpQuestionLocally(params: {
  question: string;
  messages: ParsedMessage[];
  structuredResult: ConvoBriefStructuredResult;
}): {
  answer: string;
  citedMessageIds: number[];
  confidence: string;
} {
  const { question, messages, structuredResult } = params;
  const qLower = question.toLowerCase().trim();

  // 1. Final decisions / what did we agree on?
  if (
    /\b(final\s+decisions?|decisions?\s+made|what\s+did\s+(?:we|they)\s+(?:decide|agree)|agreed?\s+on|agreements?|conclusions?)\b/.test(
      qLower
    )
  ) {
    if (structuredResult.important_decisions.length === 0) {
      return {
        answer:
          "No explicit final decisions or binding agreements were stated in the conversation. Only general discussion points or action items were recorded.",
        citedMessageIds: [],
        confidence: "Grounded (Verified Absence)",
      };
    }
    const cited = Array.from(
      new Set(
        structuredResult.important_decisions.flatMap(
          (d) => d.source_message_ids
        )
      )
    );
    const lines = structuredResult.important_decisions.map(
      (d, idx) =>
        `${idx + 1}. [${d.importance}] ${d.decision}${
          d.superseded_context ? ` (${d.superseded_context})` : ""
        } — Source: Msg #${d.source_message_ids.join(", #")}`
    );
    return {
      answer: `Based on the conversation, ${structuredResult.important_decisions.length} decision(s) were reached:\n${lines.join("\n")}`,
      citedMessageIds: cited,
      confidence: "Grounded (Direct Decision Match)",
    };
  }

  // 2. Pending tasks / action items / responsibilities / who is doing what?
  if (
    /\b(tasks?\s+(?:are\s+)?pending|pending\s+tasks?|action\s+items?|next\s+steps?|todo|to-do|who\s+is\s+responsible|responsibilities|assigned)\b/.test(
      qLower
    )
  ) {
    if (structuredResult.action_items.length === 0) {
      return {
        answer:
          "No explicit action items or pending tasks were identified in the conversation.",
        citedMessageIds: [],
        confidence: "Grounded (Verified Absence)",
      };
    }
    const cited = Array.from(
      new Set(structuredResult.action_items.flatMap((a) => a.source_message_ids))
    );
    const lines = structuredResult.action_items.map(
      (a, idx) =>
        `${idx + 1}. ${a.task}\n   • Assigned To: ${a.assigned_to || "Not specified"} | Deadline: ${a.deadline || "Not specified"} | Importance: ${a.importance} (Msg #${a.source_message_ids.join(", #")})`
    );
    return {
      answer: `Here are the ${structuredResult.action_items.length} action item(s) identified in the conversation:\n${lines.join("\n")}`,
      citedMessageIds: cited,
      confidence: "Grounded (Action Item Registry)",
    };
  }

  // 3. Unresolved problems / open questions / blockers
  if (
    /\b(unresolved|unanswered|remain\s+open|open\s+questions?|problems?\s+remain|issues?\s+remain|blockers?|risks?)\b/.test(
      qLower
    )
  ) {
    const openProblems = structuredResult.problems.filter(
      (p) => p.resolution_status !== "resolved"
    );
    const openQuestions = structuredResult.unresolved_questions;
    const risks = structuredResult.risks;

    if (
      openProblems.length === 0 &&
      openQuestions.length === 0 &&
      risks.length === 0
    ) {
      return {
        answer:
          "All explicitly raised problems appear addressed in the conversation, and no unanswered questions or active risks remain flagged.",
        citedMessageIds: [],
        confidence: "Grounded",
      };
    }

    const parts: string[] = [];
    const cited = new Set<number>();

    if (openProblems.length > 0) {
      parts.push(
        `Unresolved / Partially Addressed Problems (${openProblems.length}):\n` +
          openProblems
            .map((p) => {
              p.source_message_ids.forEach((id) => cited.add(id));
              return `• [${p.resolution_status}] ${p.problem} (Msg #${p.source_message_ids.join(", #")})`;
            })
            .join("\n")
      );
    }
    if (openQuestions.length > 0) {
      parts.push(
        `Unanswered Questions (${openQuestions.length}):\n` +
          openQuestions
            .map((q) => {
              q.source_message_ids.forEach((id) => cited.add(id));
              return `• ${q.question} — Asked by: ${q.asked_by || "Not specified"} (Msg #${q.source_message_ids.join(", #")})`;
            })
            .join("\n")
      );
    }
    if (risks.length > 0) {
      parts.push(
        `Flagged Risks (${risks.length}):\n` +
          risks
            .map((r) => {
              r.source_message_ids.forEach((id) => cited.add(id));
              return `• [${r.importance}] ${r.risk} (Msg #${r.source_message_ids.join(", #")})`;
            })
            .join("\n")
      );
    }

    return {
      answer: parts.join("\n\n"),
      citedMessageIds: Array.from(cited),
      confidence: "Grounded (Issue & Question Audit)",
    };
  }

  // 4. Deadlines / dates / when
  if (/\b(deadlines?|due\s+dates?|when\s+is|schedule|dates?|timeline)\b/.test(qLower)) {
    if (structuredResult.deadlines.length === 0) {
      return {
        answer:
          "No explicit deadlines or target dates were specified in the conversation.",
        citedMessageIds: [],
        confidence: "Grounded (Verified Absence)",
      };
    }
    const cited = Array.from(
      new Set(structuredResult.deadlines.flatMap((d) => d.source_message_ids))
    );
    const lines = structuredResult.deadlines.map(
      (d) =>
        `• ${d.date_expression}: ${d.milestone} (Owner: ${d.owner || "Not specified"}, Msg #${d.source_message_ids.join(", #")})`
    );
    return {
      answer: `Stated deadlines and dates in the conversation:\n${lines.join("\n")}`,
      citedMessageIds: cited,
      confidence: "Grounded (Temporal Extraction)",
    };
  }

  // 5. Most important information / critical highlights
  if (
    /\b(most\s+important|critical|top\s+priorit|key\s+takeaways?|main\s+points?|highlight)\b/.test(
      qLower
    )
  ) {
    const cited = new Set<number>();
    const highlights: string[] = [];

    for (const d of structuredResult.important_decisions.slice(0, 2)) {
      d.source_message_ids.forEach((id) => cited.add(id));
      highlights.push(`• [Decision - ${d.importance}] ${d.decision} (Msg #${d.source_message_ids.join(", #")})`);
    }
    for (const kp of structuredResult.key_points.slice(0, 3)) {
      kp.source_message_ids.forEach((id) => cited.add(id));
      highlights.push(`• [Key Point - ${kp.importance}] ${kp.point} (Msg #${kp.source_message_ids.join(", #")})`);
    }
    for (const a of structuredResult.action_items
      .filter((x) => x.importance === "Critical" || x.importance === "High Importance")
      .slice(0, 2)) {
      a.source_message_ids.forEach((id) => cited.add(id));
      highlights.push(
        `• [Action - ${a.importance}] ${a.task} (Owner: ${a.assigned_to || "Not specified"}, Deadline: ${a.deadline || "Not specified"}, Msg #${a.source_message_ids.join(", #")})`
      );
    }

    return {
      answer:
        highlights.length > 0
          ? `Most important grounded takeaways from "${structuredResult.conversation_title}":\n${highlights.join("\n")}`
          : structuredResult.overview,
      citedMessageIds: Array.from(cited),
      confidence: "Grounded (Importance Ranking)",
    };
  }

  // 6. General semantic/keyword search across conversation messages
  const qKeywords = extractKeywords(question, 8);
  const scoredMsgs = messages
    .filter((m) => !m.isGreetingOrNoise && !m.isDuplicate)
    .map((m) => {
      let score = 0;
      const lower = m.content.toLowerCase();
      for (const kw of qKeywords) {
        if (lower.includes(kw)) score += 15;
      }
      if (qKeywords.some((kw) => m.speaker.toLowerCase().includes(kw))) {
        score += 20;
      }
      return { msg: m, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (scoredMsgs.length === 0) {
    return {
      answer:
        "The conversation does not contain information addressing that specific question. To avoid hallucination, ConvoBrief AI only answers using facts present in the source transcript.",
      citedMessageIds: [],
      confidence: "Grounded (Not Mentioned in Source)",
    };
  }

  const lines = scoredMsgs.map(
    ({ msg }) =>
      `• [Msg #${msg.id} — ${msg.speaker}${msg.timestamp ? ` (${msg.timestamp})` : ""}]: "${msg.content}"`
  );

  return {
    answer: `Relevant statements found directly in the conversation transcript:\n${lines.join("\n")}`,
    citedMessageIds: scoredMsgs.map((s) => s.msg.id),
    confidence: "Grounded (Direct Transcript Evidence)",
  };
}
