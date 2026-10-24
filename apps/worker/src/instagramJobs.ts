import { randomUUID } from "node:crypto";

import { createAgentModel, createReceptionistAgent, describeAgentUsage } from "@lobbystack/agent-core";
import type { JobEnvelope } from "@lobbystack/contracts";
import { withBusinessTransaction } from "@lobbystack/db";
import { claimInstagramDelivery, finishInstagramDelivery, getCachedBusinessSnapshot, instagramDeliveryLeaseEndsAt, loadInstagramReplyContext, recordAiGenerationEvent, recordInstagramPartSent, refreshBusinessSnapshot, refreshInstagramTokenIfDue, releaseInstagramDelivery, reserveWidgetChatUsageInTransaction, saveInstagramReply, type DomainContext } from "@lobbystack/domain";
import { InstagramApiError, splitInstagramText, type InstagramProvider } from "@lobbystack/providers/instagram/instagram";
import { normalizeRuntimeLocale, runtimeLocaleName } from "@lobbystack/shared";

type LanguageModel = ReturnType<typeof createAgentModel>;

export type InstagramOperations = {
  provider: Pick<InstagramProvider, "sendTextMessage" | "refreshAccessToken">;
  decryptToken: (value: string) => string;
  encryptToken: (value: string) => string;
};

type JobResult = { status: "completed" | "skipped"; entityId?: string } | { status: "deferred"; entityId: string; retryAt: Date };

const NO_REPLY = "NO_REPLY";
const NO_REPLY_MARKER = new RegExp(`\\b${NO_REPLY}\\b`, "gi");

// Instagram is a text chat like the website's, with its own limits: plain text, and short.
const INSTAGRAM_INSTRUCTIONS = [
  "You are replying to direct messages sent to the business's Instagram account, not a website chat.",
  "Write plain text only: no markdown, bullet symbols, headings or tables. Keep each reply to a few short sentences.",
  "If you can't help, offer to take a message so someone from the team gets back to them here.",
  `Not every message needs an answer. When the person's latest message only acknowledges or closes a finished exchange ("ok", "thanks", "great", "bye", a lone emoji or reaction) and they aren't waiting on anything, reply with exactly ${NO_REPLY} and nothing else.`,
  `Never use ${NO_REPLY} for a greeting, a question, a request, or when you still owe them an answer or confirmation.`,
  `If the other side is clearly another business's automated assistant rather than a person, reply with ${NO_REPLY}.`,
].join(" ");

export async function replyToInstagramMessage(domain: DomainContext, job: JobEnvelope, options: { model?: LanguageModel } = {}): Promise<JobResult> {
  const businessId = job.businessId;
  const conversationId = String(job.payload.conversationId ?? "");
  const messageId = String(job.payload.messageId ?? "");
  if (!businessId || !conversationId || !messageId) return { status: "skipped", entityId: messageId };
  const reply = await loadInstagramReplyContext(domain, { businessId, conversationId, messageId });
  if (!reply) return { status: "skipped", entityId: messageId };
  const model = options.model ?? createAgentModel();
  if (!model) throw new Error("The AI chat provider is not configured.");
  const allowance = await withBusinessTransaction(domain.db, { businessId, actorType: "worker" }, async (tx) => await reserveWidgetChatUsageInTransaction(tx, { businessId, conversationId }));
  if (!allowance.allowed) return { status: "skipped", entityId: messageId };
  const snapshot = await getCachedBusinessSnapshot(domain, { businessId }) ?? (await refreshBusinessSnapshot(domain, { businessId }), await getCachedBusinessSnapshot(domain, { businessId }));
  if (!snapshot) throw new Error("The business snapshot is unavailable.");
  const locale = normalizeRuntimeLocale(snapshot.defaultLocale);
  const agent = createReceptionistAgent({
    model,
    // A text conversation, so it gets the website chat's knowledge, tools and booking.
    context: { domain, snapshot, channel: "instagram", conversationId },
    extraInstructions: `${INSTAGRAM_INSTRUCTIONS} Reply in the language of the person's latest message; if it's unclear, use ${runtimeLocaleName(locale)}.`,
  });
  const traceId = randomUUID();
  const startedAt = performance.now();
  try {
    const result = await agent.generate({ messages: reply.history.slice(-20).map((row) => ({ role: row.direction === "inbound" ? "user" as const : "assistant" as const, content: row.body })) });
    if (!result.text.trim()) throw new Error("The AI assistant returned an empty reply.");
    const text = instagramReplyText(result.text);
    if (!text) {
      void recordAiGenerationEvent(domain, { businessId, operation: "instagram.reply", conversationId, traceId, isStreaming: false, ...describeAgentUsage(result.usage, performance.now() - startedAt) }).catch(() => undefined);
      return { status: "skipped", entityId: messageId };
    }
    const savedId = await saveInstagramReply(domain, { businessId, conversationId, answeringMessageId: messageId, body: text });
    void recordAiGenerationEvent(domain, { businessId, operation: "instagram.reply", conversationId, ...(savedId ? { messageId: savedId } : {}), traceId, isStreaming: false, ...describeAgentUsage(result.usage, performance.now() - startedAt) }).catch(() => undefined);
    // Null when the team took over or a newer message arrived while the reply was written.
    return savedId ? { status: "completed", entityId: savedId } : { status: "skipped", entityId: messageId };
  } catch (error) {
    // Only a stable category: provider errors can quote the conversation.
    void recordAiGenerationEvent(domain, { businessId, operation: "instagram.reply", conversationId, traceId, provider: "unknown", model: "unknown", latencyMs: performance.now() - startedAt, isStreaming: false, isError: true, error: "generation_failed" }).catch(() => undefined);
    throw error;
  }
}

/**
 * The reply to send, or null when the model chose not to answer. The NO_REPLY
 * marker never goes out, even when the model wrote it after some text.
 */
export function instagramReplyText(output: string): string | null {
  const raw = output.trim();
  const text = raw.replace(NO_REPLY_MARKER, "").trim();
  return text === raw || /[\p{L}\p{N}]/u.test(text) ? text : null;
}

export async function sendInstagramMessage(domain: DomainContext, job: JobEnvelope, operations: InstagramOperations | undefined, execution: { isFinalAttempt?: boolean } = {}): Promise<JobResult> {
  const businessId = job.businessId;
  const messageId = String(job.payload.messageId ?? "");
  if (!businessId || !messageId) return { status: "skipped", entityId: messageId };
  if (!operations) {
    // Without the app's credentials nothing can go out; say so on the message rather than leave it queued.
    const claimed = await claimInstagramDelivery(domain, { businessId, messageId });
    if (claimed) await finishInstagramDelivery(domain, { businessId, messageId, status: "failed", reason: "instagram_not_configured" });
    return { status: "skipped", entityId: messageId };
  }
  // The daily instagram.refreshToken job keeps the token current, so a send never waits on a refresh.
  const delivery = await claimInstagramDelivery(domain, { businessId, messageId });
  if (!delivery) {
    // A worker killed mid-send leaves the message held. Run again once the hold lapses instead of dropping it.
    const leaseEndsAt = await instagramDeliveryLeaseEndsAt(domain, { businessId, messageId });
    return leaseEndsAt ? { status: "deferred", entityId: messageId, retryAt: leaseEndsAt } : { status: "skipped", entityId: messageId };
  }
  if ("blocked" in delivery) {
    await finishInstagramDelivery(domain, { businessId, messageId, status: "failed", reason: delivery.blocked === "no_account" ? "instagram_disconnected" : "instagram_no_recipient" });
    return { status: "skipped", entityId: messageId };
  }
  let firstMessageId = delivery.providerMessageId ?? undefined;
  const parts = splitInstagramText(delivery.body);
  // A retry picks up after the pieces an earlier attempt already sent.
  for (let index = delivery.partsSent; index < parts.length; index += 1) {
    let sent: { messageId: string };
    try {
      sent = await operations.provider.sendTextMessage({ accessToken: operations.decryptToken(delivery.encryptedAccessToken), instagramUserId: delivery.instagramUserId, recipientId: delivery.recipientId, text: parts[index]! });
    } catch (error) {
      const apiError = error instanceof InstagramApiError ? error : undefined;
      if (apiError?.permanent || execution.isFinalAttempt) {
        await finishInstagramDelivery(domain, { businessId, messageId, status: "failed", reason: apiError?.reconnectRequired ? "instagram_reconnect_required" : `instagram_error${apiError?.code !== undefined ? `_${apiError.code}` : ""}`, reconnectRequired: apiError?.reconnectRequired === true });
        return { status: "skipped", entityId: messageId };
      }
      // The retry comes within seconds, long before the claim would lapse.
      await releaseInstagramDelivery(domain, { businessId, messageId });
      throw error;
    }
    firstMessageId ??= sent.messageId;
    if (index < parts.length - 1) await recordAfterSend(() => recordInstagramPartSent(domain, { businessId, messageId, partsSent: index + 1, providerMessageId: firstMessageId! }));
  }
  if (!firstMessageId) {
    await finishInstagramDelivery(domain, { businessId, messageId, status: "failed", reason: "instagram_empty_message" });
    return { status: "skipped", entityId: messageId };
  }
  await recordAfterSend(() => finishInstagramDelivery(domain, { businessId, messageId, status: "sent", providerMessageId: firstMessageId! }));
  return { status: "completed", entityId: messageId };
}

// Instagram already has the piece, so a failed write is tried again here.
// Handing the message back instead would send the piece twice.
async function recordAfterSend(write: () => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await write();
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
}

export async function refreshInstagramToken(domain: DomainContext, job: JobEnvelope, operations: InstagramOperations | undefined): Promise<JobResult> {
  if (!job.businessId || !operations) return { status: "skipped" };
  const outcome = await refreshInstagramTokenIfDue(domain, { businessId: job.businessId, decryptToken: operations.decryptToken, encryptToken: operations.encryptToken, refreshAccessToken: (token) => operations.provider.refreshAccessToken(token) });
  return { status: outcome === "refreshed" ? "completed" : "skipped", entityId: job.businessId };
}
