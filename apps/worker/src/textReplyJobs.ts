import { randomUUID } from "node:crypto";

import { createAgentModel, createReceptionistAgent, describeAgentUsage } from "@lobbystack/agent-core";
import type { JobEnvelope } from "@lobbystack/contracts";
import { withBusinessTransaction } from "@lobbystack/db";
import { alertUnansweredText, getCachedBusinessSnapshot, loadTextReplyContext, recordAiGenerationEvent, refreshBusinessSnapshot, reserveTextReplyUsageInTransaction, saveTextReply, type DomainContext } from "@lobbystack/domain";
import { normalizeRuntimeLocale, runtimeLocaleName, type RuntimeLocale } from "@lobbystack/shared";

import { instagramReplyText, NO_REPLY_INSTRUCTIONS } from "./instagramJobs";

type LanguageModel = ReturnType<typeof createAgentModel>;
type JobResult = { status: "completed" | "skipped"; entityId?: string };

/** About two segments of plain text. A reply past this is cut, because carriers bill by the segment. */
export const TEXT_REPLY_MAX_CHARS = 320;

const OPERATION = "sms.aiReply";

// A text costs money by the segment and arrives with no formatting, so replies stay shorter than Instagram's.
const TEXT_INSTRUCTIONS = [
  "You are replying to text messages sent to the business's phone number, not a website chat.",
  `Write plain text only: no markdown, bullet symbols, headings or tables. Keep each reply under ${TEXT_REPLY_MAX_CHARS - 40} characters.`,
  "If someone asks whether you're a person, say you're an automated assistant.",
  "If they ask to stop getting texts, tell them to reply STOP.",
  "If you can't help, offer to take a message so someone from the team replies by text.",
  ...NO_REPLY_INSTRUCTIONS,
].join(" ");

// The first reply opens with this, in the business's language, whatever the model wrote. It stays
// in code because a prompt can't promise it, and comes after the cut so the cut can't drop it.
const TEXT_REPLY_DISCLOSURE: Record<RuntimeLocale, (name: string) => string> = {
  en: (name) => `Automated assistant for ${name}. Reply STOP to opt out.`,
  fr: (name) => `Assistant automatisé de ${name}. Répondez STOP pour vous désabonner.`,
  es: (name) => `Asistente automatizado de ${name}. Responda STOP para darse de baja.`,
  sr: (name) => `Automatizovani asistent firme ${name}. Odgovorite STOP za odjavu.`,
  de: (name) => `Automatischer Assistent von ${name}. Antworten Sie STOP zum Abmelden.`,
  pt: (name) => `Assistente automatizado de ${name}. Responda STOP para cancelar.`,
  it: (name) => `Assistente automatico di ${name}. Rispondi STOP per annullare l'iscrizione.`,
  nl: (name) => `Geautomatiseerde assistent van ${name}. Antwoord STOP om af te melden.`,
};

export async function replyToTextMessage(domain: DomainContext, job: JobEnvelope, options: { model?: LanguageModel } = {}, execution: { isFinalAttempt?: boolean } = {}): Promise<JobResult> {
  const businessId = job.businessId;
  const conversationId = String(job.payload.conversationId ?? "");
  const messageId = String(job.payload.messageId ?? "");
  if (!businessId || !conversationId || !messageId) return { status: "skipped", entityId: messageId };
  const reply = await loadTextReplyContext(domain, { businessId, conversationId, messageId });
  if (!reply) return { status: "skipped", entityId: messageId };
  const traceId = randomUUID();
  const startedAt = performance.now();
  // Set once a tool saves a message or books: another attempt would do it twice.
  let acted = false;
  try {
    const model = options.model ?? createAgentModel();
    if (!model) throw new Error("The AI chat provider is not configured.");
    const allowance = await withBusinessTransaction(domain.db, { businessId, actorType: "worker" }, async (tx) => await reserveTextReplyUsageInTransaction(tx, { businessId, conversationId }));
    if (!allowance.allowed) {
      await alertUnansweredText(domain, { businessId, conversationId });
      return { status: "skipped", entityId: messageId };
    }
    const snapshot = await getCachedBusinessSnapshot(domain, { businessId }) ?? (await refreshBusinessSnapshot(domain, { businessId }), await getCachedBusinessSnapshot(domain, { businessId }));
    if (!snapshot) throw new Error("The business snapshot is unavailable.");
    const locale = normalizeRuntimeLocale(snapshot.defaultLocale);
    const agent = createReceptionistAgent({
      model,
      // No callerPhone: a text's sender can be spoofed, so it can't verify an appointment change.
      context: { domain, snapshot, channel: "sms", conversationId },
      extraInstructions: `${TEXT_INSTRUCTIONS} They're texting from ${reply.phone}: use it as their contact and callback number unless they give another. Reply in the language of the person's latest message; if it's unclear, use ${runtimeLocaleName(locale)}.`,
      onAction: () => { acted = true; },
    });
    const result = await agent.generate({ messages: reply.history.map((row) => ({ role: row.direction === "inbound" ? "user" as const : "assistant" as const, content: row.body })) });
    if (!result.text.trim()) throw new Error("The AI assistant returned an empty reply.");
    const text = instagramReplyText(result.text);
    const savedId = text ? await saveTextReply(domain, { businessId, conversationId, answeringMessageId: messageId, body: textReplyBody(text, reply.firstReply ? TEXT_REPLY_DISCLOSURE[locale](snapshot.displayName.slice(0, 60)) : undefined) }) : null;
    void recordAiGenerationEvent(domain, { businessId, operation: OPERATION, conversationId, ...(savedId ? { messageId: savedId } : {}), traceId, isStreaming: false, ...describeAgentUsage(result.usage, performance.now() - startedAt) }).catch(() => undefined);
    // Null when the model chose not to answer, the team took over, or a newer text arrived while the reply was written.
    return savedId ? { status: "completed", entityId: savedId } : { status: "skipped", entityId: messageId };
  } catch (error) {
    // Only a stable category: provider errors can quote the conversation.
    void recordAiGenerationEvent(domain, { businessId, operation: OPERATION, conversationId, traceId, provider: "unknown", model: "unknown", latencyMs: performance.now() - startedAt, isStreaming: false, isError: true, error: "generation_failed" }).catch(() => undefined);
    // The team got no alert when the text came in, because this job was going to answer it.
    if (acted || execution.isFinalAttempt) await alertUnansweredText(domain, { businessId, conversationId });
    if (acted) return { status: "skipped", entityId: messageId };
    throw error;
  }
}

/** The reply as it goes out, disclosure first: cut to what's left at the last full sentence that fits, or the last word when none does. */
export function textReplyBody(text: string, disclosure?: string): string {
  return disclosure ? `${disclosure} ${cutToLength(text, TEXT_REPLY_MAX_CHARS - disclosure.length - 1)}` : cutToLength(text, TEXT_REPLY_MAX_CHARS);
}

function cutToLength(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (sentenceEnd > 0) return cut.slice(0, sentenceEnd + 1);
  const wordEnd = cut.lastIndexOf(" ");
  return wordEnd > 0 ? cut.slice(0, wordEnd) : cut;
}
