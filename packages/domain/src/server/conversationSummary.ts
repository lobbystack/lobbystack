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
const nonReasonPattern = /^(?:hello|hi|hey|yes|no|okay|ok|uh|um|bye|goodbye|thanks|thank you)[\s.!?,;-]*$/iu;

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

export function buildConversationSessionSummary(input: {
  locale?: string | null;
  currentIntent?: string | null;
  conversationSummary?: string | null;
  disposition?: string | null;
  transcript?: Array<string | ConversationTranscriptTurn>;
}): ConversationSessionSummary {
  const existingSummary = normalizedSummary(input.conversationSummary);
  if (input.currentIntent === "message_taking") {
    return { kind: "message_taking", ...(existingSummary ? { summary: existingSummary } : {}) };
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
