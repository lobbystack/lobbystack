export type ConversationSessionSummary =
  | { kind: "message_taking"; summary?: string }
  | { kind: "disposition"; disposition: string }
  | { kind: "summary"; summary: string };

export type ConversationTranscriptTurn = {
  speaker: string;
  text: string;
};

export type CallerContext = {
  callerName?: string;
  callReason?: string;
};

function normalizedSummary(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

const callerNamePattern = /^(?:(?:hello|hi|hey)[\s,!.-]*)?(?:my name is|this is|i am|i'm|je m'appelle|je suis)\s+([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,2})(?=$|[.!?,;])/iu;
const nonReasonPattern = /^(?:hello|hi|hey|yes|yeah|yep|no|nope|okay|ok|sure|uh|um|hmm|bye|goodbye|thanks|thank you|bonjour|allô|allo|salut|oui|non|merci|d'accord)[\s.!?,;-]*$/iu;

function bounded(value: string, maximum = 220): string {
  return value.length > maximum ? `${value.slice(0, maximum - 3).trimEnd()}...` : value;
}

export function extractCallerContext(transcript: ConversationTranscriptTurn[]): CallerContext {
  let callerName: string | undefined;
  let callReason: string | undefined;

  for (const turn of transcript) {
    if (turn.speaker !== "caller" && turn.speaker !== "user") continue;
    const text = normalizedSummary(turn.text);
    if (!text) continue;

    const nameMatch = text.match(callerNamePattern);
    if (!callerName && nameMatch?.[1]) callerName = nameMatch[1].trim();

    const withoutIntroduction = nameMatch
      ? text.slice(nameMatch[0].length).replace(/^[\s.!?,;:-]+/, "").trim()
      : text;
    if (!callReason && withoutIntroduction && !nonReasonPattern.test(withoutIntroduction)) {
      callReason = bounded(withoutIntroduction);
    }
  }

  return {
    ...(callerName ? { callerName } : {}),
    ...(callReason ? { callReason } : {}),
  };
}

export type CallSummaryLocale = "en" | "fr";

export function normalizeCallSummaryLocale(locale: string | null | undefined): CallSummaryLocale {
  return locale?.trim().toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** A model-written summary and caller name, before the domain validates them. */
export type GeneratedCallSummary = {
  summary?: string | null;
  callerName?: string | null;
};

const MAX_GENERATED_SUMMARY_LENGTH = 200;
const callerNameShape = /^[\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,3}$/u;
const placeholderNames = new Set(["unknown", "caller", "customer", "client", "inconnu", "anonyme", "anonymous", "none", "null"]);

function foldForComparison(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function callerWords(transcript: ConversationTranscriptTurn[]): Set<string> {
  const words = new Set<string>();
  for (const turn of transcript) {
    if (turn.speaker !== "caller" && turn.speaker !== "user") continue;
    for (const word of foldForComparison(turn.text).split(/[^\p{L}'’-]+/u)) {
      if (word) words.add(word);
    }
  }
  return words;
}

const wrappingCharacters = new Set(["\"", "'", "“", "”", "«", "»"]);

// Strip quotes and spaces from both ends with index scans, not a regex: an
// anchored regex on model output backtracks badly on long whitespace runs.
function trimWrapping(value: string): string {
  let start = 0;
  let end = value.length;
  const wraps = (character: string | undefined) => character !== undefined && (wrappingCharacters.has(character) || /\s/u.test(character));
  while (start < end && wraps(value[start])) start += 1;
  while (end > start && wraps(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

/** Accept a model-written summary only as one bounded line. */
export function sanitizeGeneratedSummary(value: string | null | undefined): string | undefined {
  const text = normalizedSummary(value);
  const normalized = text === undefined ? undefined : trimWrapping(text);
  if (!normalized) return undefined;
  return bounded(normalized, MAX_GENERATED_SUMMARY_LENGTH);
}

/**
 * Accept a model-extracted caller name only when it looks like a name and the
 * caller spoke every word of it, so a model cannot invent or embellish one.
 */
export function sanitizeGeneratedCallerName(value: string | null | undefined, transcript: ConversationTranscriptTurn[]): string | undefined {
  const name = normalizedSummary(value);
  if (!name || name.length > 60 || !callerNameShape.test(name) || placeholderNames.has(foldForComparison(name))) return undefined;
  const spoken = callerWords(transcript);
  const nameWords = foldForComparison(name).split(/\s+/u).map((word) => word.replace(/\.+$/u, ""));
  return nameWords.every((word) => spoken.has(word)) ? name : undefined;
}

export function buildConversationSessionSummary(input: {
  locale?: string | null;
  /** A model-written summary of this call; it replaces the transcript heuristic. */
  generatedSummary?: string | null | undefined;
  currentIntent?: string | null;
  conversationSummary?: string | null;
  disposition?: string | null;
  transcript?: Array<string | ConversationTranscriptTurn>;
}): ConversationSessionSummary {
  const existingSummary = normalizedSummary(input.conversationSummary);
  if (input.currentIntent === "message_taking") {
    return { kind: "message_taking", ...(existingSummary ? { summary: existingSummary } : {}) };
  }
  const generatedSummary = sanitizeGeneratedSummary(input.generatedSummary);
  if (generatedSummary) {
    return { kind: "summary", summary: generatedSummary };
  }
  if (existingSummary) {
    return { kind: "summary", summary: existingSummary };
  }
  const transcriptTurns = input.transcript?.filter((turn): turn is ConversationTranscriptTurn => typeof turn !== "string") ?? [];
  const callerContext = extractCallerContext(transcriptTurns);
  if (callerContext.callReason) {
    return { kind: "summary", summary: callerContext.callReason };
  }
  if (input.disposition) {
    return { kind: "disposition", disposition: input.disposition };
  }
  const transcript = normalizedSummary(input.transcript?.map((turn) => typeof turn === "string" ? turn : turn.text).join(" "));
  if (transcript) {
    const excerpt = bounded(transcript);
    return { kind: "summary", summary: input.locale === "fr" ? `Résumé de l'appel : ${excerpt}` : `Call summary: ${excerpt}` };
  }
  return { kind: "summary", summary: input.locale === "fr" ? "Interaction vocale terminée." : "Voice interaction completed." };
}
