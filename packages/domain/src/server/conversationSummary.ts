export type ConversationSessionSummary =
  | { kind: "message_taking"; summary?: string }
  | { kind: "disposition"; disposition: string }
  | { kind: "summary"; summary: string };

function normalizedSummary(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

export function buildConversationSessionSummary(input: {
  locale?: string | null;
  currentIntent?: string | null;
  conversationSummary?: string | null;
  disposition?: string | null;
  transcript?: string[];
}): ConversationSessionSummary {
  const existingSummary = normalizedSummary(input.conversationSummary);
  if (input.currentIntent === "message_taking") {
    return { kind: "message_taking", ...(existingSummary ? { summary: existingSummary } : {}) };
  }
  if (input.disposition) {
    return { kind: "disposition", disposition: input.disposition };
  }
  if (existingSummary) {
    return { kind: "summary", summary: existingSummary };
  }
  const transcript = normalizedSummary(input.transcript?.join(" "));
  if (transcript) {
    const excerpt = transcript.length > 220 ? `${transcript.slice(0, 217).trimEnd()}...` : transcript;
    return { kind: "summary", summary: input.locale === "fr" ? `Résumé de l'appel : ${excerpt}` : `Call summary: ${excerpt}` };
  }
  return { kind: "summary", summary: input.locale === "fr" ? "Interaction vocale terminée." : "Voice interaction completed." };
}
