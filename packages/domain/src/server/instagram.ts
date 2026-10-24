import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { getPostHogDistinctIdForBusinessSystem } from "@lobbystack/telemetry";

import { auditLogs, contacts, conversations, conversationSessions, enqueueOutbox, instagramAccounts, messages, providerEvents, withBusinessTransaction, type DatabaseTransaction } from "@lobbystack/db";

import { requireBusinessAdmin, requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { insertMessageInTransaction } from "./conversations";
import { queueOperatorAlertInTransaction } from "./notifications";
import { recordProductEventBestEffort } from "./productEvents";
import { emitWebhookEventInTransaction } from "./publicApi/webhooks";

/** Instagram lets a business reply for this long after the person's last message. */
export const INSTAGRAM_REPLY_WINDOW_MS = 24 * 60 * 60_000;
/** Long-lived tokens last 60 days; refresh them once they have less than this left. */
export const INSTAGRAM_TOKEN_REFRESH_BEFORE_MS = 14 * 24 * 60 * 60_000;
// Instagram only refreshes a token that is at least a day old.
const INSTAGRAM_TOKEN_MIN_AGE_MS = 24 * 60 * 60_000;
const INSTAGRAM_DELIVERY_LEASE_MS = 10 * 60_000;
/**
 * This many receptionist replies in the window means another bot is probably
 * answering back: a loop replies every few seconds, while a person asking
 * quick follow-ups takes far longer between messages.
 */
export const INSTAGRAM_AI_REPLY_LIMIT = 15;
export const INSTAGRAM_AI_REPLY_WINDOW_MS = 5 * 60_000;

export type InstagramAccountStatus = { username: string | null; instagramUserId: string; status: string; lastError: string | null; tokenExpiresAt: Date; connectedAt: Date };

/** The business's connected Instagram account, without its token. Any member can see it; only owners and admins change it. */
export async function getInstagramAccount(context: DomainContext, input: { userId: string; businessId: string }): Promise<InstagramAccountStatus | null> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const [row] = await tx.select({ username: instagramAccounts.username, instagramUserId: instagramAccounts.instagramUserId, status: instagramAccounts.status, lastError: instagramAccounts.lastError, tokenExpiresAt: instagramAccounts.tokenExpiresAt, connectedAt: instagramAccounts.createdAt })
      .from(instagramAccounts).where(eq(instagramAccounts.businessId, input.businessId)).limit(1);
    return row ?? null;
  });
}

/**
 * Saves the business's Instagram account after login. Connecting again, with
 * the same or another account, replaces the earlier one: a business answers
 * one Instagram account. An account another workspace already connected is
 * refused, since Meta sends its messages to one place.
 */
export async function connectInstagramAccount(
  context: DomainContext,
  input: { userId: string; businessId: string; instagramUserId: string; username?: string; encryptedAccessToken: string; tokenExpiresAt: Date },
): Promise<void> {
  const owner = await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => (await tx.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_instagram_account(${input.instagramUserId}) as business_id`)).rows[0]?.business_id ?? null);
  if (owner && owner !== input.businessId) throw Object.assign(new Error("This Instagram account is already connected to another workspace."), { status: 409, code: "instagram_account_in_use" });
  await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const now = new Date();
    const [previous] = await tx.select({ instagramUserId: instagramAccounts.instagramUserId }).from(instagramAccounts).where(eq(instagramAccounts.businessId, input.businessId)).limit(1).for("update");
    if (previous && previous.instagramUserId !== input.instagramUserId) await closeInstagramConversationsInTransaction(tx, input.businessId, now);
    const values = { connectedByUserId: input.userId, instagramUserId: input.instagramUserId, username: input.username ?? null, encryptedAccessToken: input.encryptedAccessToken, tokenExpiresAt: input.tokenExpiresAt, status: "connected", lastError: null, updatedAt: now };
    await tx.insert(instagramAccounts).values({ businessId: input.businessId, ...values })
      .onConflictDoUpdate({ target: instagramAccounts.businessId, set: values });
    await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "instagram_account.connected", entityType: "instagram_account", entityId: null, payload: { instagramUserId: input.instagramUserId, ...(input.username ? { username: input.username } : {}) } });
  }).catch((error: unknown) => {
    // A disconnected account another workspace still holds: the unique index, not the resolver, catches it.
    if ((error as { code?: string }).code === "23505") throw Object.assign(new Error("This Instagram account is already connected to another workspace."), { status: 409, code: "instagram_account_in_use" });
    throw error;
  });
  await recordProductEventBestEffort(context, {
    name: "integration.instagram_connected",
    businessId: input.businessId,
    distinctId: getPostHogDistinctIdForBusinessSystem(input.businessId),
    properties: {},
  });
}

/** Removes the account and its token. Messages already received stay in the inbox. */
export async function disconnectInstagramAccount(context: DomainContext, input: { userId: string; businessId: string }): Promise<boolean> {
  return await withBusinessTransaction(context.db, { userId: input.userId, businessId: input.businessId, actorType: "operator" }, async (tx) => {
    await requireBusinessAdmin(tx, input);
    const removed = await tx.delete(instagramAccounts).where(eq(instagramAccounts.businessId, input.businessId)).returning({ instagramUserId: instagramAccounts.instagramUserId });
    if (removed[0]) {
      await closeInstagramConversationsInTransaction(tx, input.businessId, new Date());
      await tx.insert(auditLogs).values({ businessId: input.businessId, actorUserId: input.userId, eventType: "instagram_account.disconnected", entityType: "instagram_account", entityId: null, payload: { instagramUserId: removed[0].instagramUserId } });
    }
    return removed.length > 0;
  });
}

/**
 * Closes the business's open Instagram conversations when its account is
 * removed or replaced. Their sender IDs belong to that account, so a reply
 * through another account's token would go to the wrong place. The person's
 * next message, to whichever account they write to, opens a new conversation.
 */
async function closeInstagramConversationsInTransaction(tx: DatabaseTransaction, businessId: string, now: Date): Promise<void> {
  const closed = await tx.update(conversations).set({ status: "closed", updatedAt: now })
    .where(and(eq(conversations.businessId, businessId), eq(conversations.channel, "instagram"), eq(conversations.status, "open"))).returning({ id: conversations.id });
  if (!closed.length) return;
  await tx.update(conversationSessions).set({ status: "closed", closedAt: now, updatedAt: now })
    .where(and(eq(conversationSessions.businessId, businessId), inArray(conversationSessions.conversationId, closed.map((conversation) => conversation.id)), eq(conversationSessions.status, "open")));
  for (const conversation of closed) {
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId, aggregateType: "conversation", aggregateId: conversation.id, dedupeKey: `conversation:${conversation.id}:instagram-closed:${now.getTime()}`, payload: { type: "conversation.updated", entityId: conversation.id } });
  }
}

/** The business whose connected Instagram account received a message, or null. */
export async function resolveBusinessByInstagramAccount(context: DomainContext, instagramUserId: string): Promise<string | null> {
  return await withBusinessTransaction(context.db, { actorType: "worker" }, async (tx) => (await tx.execute<{ business_id: string | null }>(sql`select app.resolve_business_by_instagram_account(${instagramUserId}) as business_id`)).rows[0]?.business_id ?? null);
}

async function findOrCreateInstagramContact(tx: DatabaseTransaction, input: { businessId: string; instagramUserId: string }): Promise<{ id: string; operatorBlockedAt: Date | null; created: boolean }> {
  const existing = (await tx.select({ id: contacts.id, operatorBlockedAt: contacts.operatorBlockedAt }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.instagramUserId, input.instagramUserId))).limit(1))[0];
  if (existing) return { ...existing, created: false };
  const [created] = await tx.insert(contacts).values({ businessId: input.businessId, instagramUserId: input.instagramUserId })
    .onConflictDoNothing().returning({ id: contacts.id, operatorBlockedAt: contacts.operatorBlockedAt });
  if (created) return { ...created, created: true };
  // A concurrent webhook created it first.
  const raced = (await tx.select({ id: contacts.id, operatorBlockedAt: contacts.operatorBlockedAt }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.instagramUserId, input.instagramUserId))).limit(1))[0];
  if (!raced) throw new Error("Instagram contact could not be created.");
  return { ...raced, created: false };
}

/**
 * Saves a direct message someone sent the business's Instagram account and,
 * while the receptionist answers the conversation, queues its reply. Meta
 * retries webhooks, so a message already saved is skipped.
 */
export async function receiveInstagramMessage(
  context: DomainContext,
  input: { businessId: string; senderId: string; providerMessageId: string; text: string; sentAt: Date },
): Promise<{ messageId?: string; duplicate: boolean; replyQueued: boolean }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [event] = await tx.insert(providerEvents).values({ provider: "instagram", providerEventId: input.providerMessageId, eventType: "message.received", businessId: input.businessId, payload: { senderId: input.senderId, sentAt: input.sentAt.toISOString() } })
      .onConflictDoNothing({ target: [providerEvents.provider, providerEvents.providerEventId] }).returning({ id: providerEvents.id });
    if (!event) return { duplicate: true, replyQueued: false };
    const contact = await findOrCreateInstagramContact(tx, { businessId: input.businessId, instagramUserId: input.senderId });
    if (contact.created) await emitWebhookEventInTransaction(tx, { businessId: input.businessId, type: "contact.created", resourceId: contact.id });
    const conversation = (await tx.select({ id: conversations.id, automationState: conversations.automationState }).from(conversations).where(and(eq(conversations.businessId, input.businessId), eq(conversations.contactId, contact.id), eq(conversations.channel, "instagram"), eq(conversations.status, "open"))).orderBy(desc(conversations.updatedAt)).limit(1))[0]
      ?? (await tx.insert(conversations).values({ businessId: input.businessId, contactId: contact.id, channel: "instagram", status: "open", automationState: "ai_active" }).returning({ id: conversations.id, automationState: conversations.automationState }))[0];
    if (!conversation) throw new Error("Instagram conversation could not be created.");
    const messageId = await insertMessageInTransaction(tx, { businessId: input.businessId, conversationId: conversation.id, body: input.text, direction: "inbound", channel: "instagram", providerMessageId: input.providerMessageId });
    await tx.update(providerEvents).set({ status: "processed", updatedAt: new Date() }).where(eq(providerEvents.id, event.id));
    if (!messageId) return { duplicate: true, replyQueued: false };
    // One alert per conversation each hour, like texts.
    if (!contact.operatorBlockedAt) await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "widgetChat", eventKey: `instagram:${conversation.id}:${new Date().toISOString().slice(0, 13)}`, subject: "New Instagram message", body: input.text.slice(0, 240) || "Someone sent a message on Instagram." });
    const replyQueued = conversation.automationState === "ai_active" && !contact.operatorBlockedAt;
    if (replyQueued) {
      await enqueueOutbox(tx, { topic: "instagram.reply", businessId: input.businessId, aggregateType: "message", aggregateId: messageId, dedupeKey: `message:${messageId}:instagram-reply`, payload: { conversationId: conversation.id, messageId } });
    }
    return { messageId, duplicate: false, replyQueued };
  });
}

export type InstagramReplyContext = {
  conversationId: string;
  history: Array<{ direction: "inbound" | "outbound"; body: string }>;
};

/**
 * What the receptionist needs to answer an Instagram message, or null when it
 * shouldn't: the team took the conversation over, a newer message arrived
 * (its own job answers them together), Instagram's 24-hour window closed, or
 * it has replied so often lately that the conversation goes to the team.
 */
export async function loadInstagramReplyContext(context: DomainContext, input: { businessId: string; conversationId: string; messageId: string; now?: Date }): Promise<InstagramReplyContext | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    if (!await stillAnsweringInTransaction(tx, input)) return null;
    const rows = await tx.select({ id: messages.id, direction: messages.direction, body: messages.body, aiGenerated: messages.aiGenerated, createdAt: messages.createdAt }).from(messages)
      .where(and(eq(messages.businessId, input.businessId), eq(messages.conversationId, input.conversationId))).orderBy(desc(messages.createdAt)).limit(40);
    const latestInbound = rows[0]!;
    const now = input.now ?? new Date();
    if (now.getTime() - latestInbound.createdAt.getTime() > INSTAGRAM_REPLY_WINDOW_MS) return null;
    const recentAiReplies = rows.filter((row) => row.direction === "outbound" && row.aiGenerated && now.getTime() - row.createdAt.getTime() <= INSTAGRAM_AI_REPLY_WINDOW_MS).length;
    if (recentAiReplies >= INSTAGRAM_AI_REPLY_LIMIT) {
      await tx.update(conversations).set({ automationState: "human_handoff", automationPausedAt: now, automationPausedByUserId: null, updatedAt: now })
        .where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId)));
      await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "aiReplyFailed", eventKey: `instagram-reply-limit:${input.conversationId}`, subject: "Instagram conversation paused", body: "The receptionist stopped answering an Instagram conversation that kept replying back, which usually means another automated account. Open Messages to take it over or turn the receptionist back on." });
      return null;
    }
    return { conversationId: input.conversationId, history: rows.reverse().map((row) => ({ direction: row.direction === "inbound" ? "inbound" : "outbound", body: row.body })) };
  });
}

/**
 * Whether the receptionist still answers `messageId`: the conversation is an
 * open Instagram one it handles, the contact isn't blocked, and that message is
 * still the newest. A newer message has its own job, which answers them
 * together, and a reply that went out after it already answered it. Locks the
 * conversation, so the answer holds until the transaction ends.
 */
async function stillAnsweringInTransaction(tx: DatabaseTransaction, input: { businessId: string; conversationId: string; messageId: string }): Promise<boolean> {
  const [conversation] = await tx.select({ automationState: conversations.automationState, channel: conversations.channel, status: conversations.status, contactBlockedAt: contacts.operatorBlockedAt })
    .from(conversations).leftJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.businessId, input.businessId))).limit(1).for("update", { of: conversations });
  if (!conversation || conversation.channel !== "instagram" || conversation.status !== "open" || conversation.automationState !== "ai_active" || conversation.contactBlockedAt) return false;
  const [latest] = await tx.select({ id: messages.id, direction: messages.direction }).from(messages)
    .where(and(eq(messages.businessId, input.businessId), eq(messages.conversationId, input.conversationId))).orderBy(desc(messages.createdAt)).limit(1);
  return latest?.id === input.messageId && latest.direction === "inbound";
}

/**
 * Saves the receptionist's reply to `answeringMessageId` and queues it for
 * Instagram, or returns null when, while the reply was written, the team took
 * the conversation over or a newer message arrived.
 */
export async function saveInstagramReply(context: DomainContext, input: { businessId: string; conversationId: string; answeringMessageId: string; body: string }): Promise<string | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    if (!await stillAnsweringInTransaction(tx, { businessId: input.businessId, conversationId: input.conversationId, messageId: input.answeringMessageId })) return null;
    return await insertMessageInTransaction(tx, { businessId: input.businessId, conversationId: input.conversationId, body: input.body, direction: "outbound", channel: "instagram", aiGenerated: true });
  });
}

export type InstagramDelivery = { accessToken: string; instagramUserId: string; recipientId: string; body: string };

/**
 * Takes an outbound Instagram message for sending, or null when it's gone,
 * already sent, or held by another run. Returns what the send needs, with the
 * token still encrypted.
 */
export async function claimInstagramDelivery(context: DomainContext, input: { businessId: string; messageId: string }): Promise<{ encryptedAccessToken: string; instagramUserId: string; recipientId: string; body: string; partsSent: number; providerMessageId: string | null } | { blocked: "no_account" | "no_recipient" } | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const staleBefore = new Date(Date.now() - INSTAGRAM_DELIVERY_LEASE_MS);
    const [claimed] = await tx.update(messages).set({ status: "sending", revision: sql`${messages.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId), eq(messages.direction, "outbound"), eq(messages.channel, "instagram"), or(eq(messages.status, "queued"), and(eq(messages.status, "sending"), lt(messages.updatedAt, staleBefore)))))
      .returning({ body: messages.body, conversationId: messages.conversationId, providerStatus: messages.providerStatus, providerMessageId: messages.providerMessageId });
    if (!claimed) return null;
    const partsSent = Number(/^partial:(\d+)$/.exec(claimed.providerStatus ?? "")?.[1] ?? 0);
    const [recipient] = await tx.select({ instagramUserId: contacts.instagramUserId, conversationStatus: conversations.status }).from(conversations).innerJoin(contacts, eq(contacts.id, conversations.contactId)).where(and(eq(conversations.id, claimed.conversationId), eq(conversations.businessId, input.businessId))).limit(1);
    const [account] = await tx.select({ encryptedAccessToken: instagramAccounts.encryptedAccessToken, instagramUserId: instagramAccounts.instagramUserId, status: instagramAccounts.status }).from(instagramAccounts).where(eq(instagramAccounts.businessId, input.businessId)).limit(1);
    // A closed conversation belonged to an account that was disconnected or replaced.
    if (!account || account.status !== "connected" || recipient?.conversationStatus === "closed") return { blocked: "no_account" };
    if (!recipient?.instagramUserId) return { blocked: "no_recipient" };
    return { encryptedAccessToken: account.encryptedAccessToken, instagramUserId: account.instagramUserId, recipientId: recipient.instagramUserId, body: claimed.body, partsSent, providerMessageId: claimed.providerMessageId };
  });
}

/** When a send holds this message, the time its claim lapses and another run may take it. */
export async function instagramDeliveryLeaseEndsAt(context: DomainContext, input: { businessId: string; messageId: string }): Promise<Date | null> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ updatedAt: messages.updatedAt }).from(messages).where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId), eq(messages.direction, "outbound"), eq(messages.channel, "instagram"), eq(messages.status, "sending"))).limit(1))[0];
    return row ? new Date(row.updatedAt.getTime() + INSTAGRAM_DELIVERY_LEASE_MS) : null;
  });
}

/**
 * Notes that one more piece of a long reply went out, so a retry sends only
 * the rest. It also renews the claim.
 */
export async function recordInstagramPartSent(context: DomainContext, input: { businessId: string; messageId: string; partsSent: number; providerMessageId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(messages).set({ providerStatus: `partial:${input.partsSent}`, providerMessageId: sql`coalesce(${messages.providerMessageId}, ${input.providerMessageId})`, updatedAt: new Date() })
      .where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId), eq(messages.status, "sending")));
  });
}

/** Hands a claimed message back after a send that may work on retry, so the retry can claim it again. */
export async function releaseInstagramDelivery(context: DomainContext, input: { businessId: string; messageId: string }): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    await tx.update(messages).set({ status: "queued", updatedAt: new Date() })
      .where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId), eq(messages.status, "sending")));
  });
}

/** Records how a send ended, and marks the account for reconnecting when its token stopped working. */
export async function finishInstagramDelivery(
  context: DomainContext,
  input: { businessId: string; messageId: string } & ({ status: "sent"; providerMessageId: string } | { status: "failed"; reason: string; reconnectRequired?: boolean }),
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const now = new Date();
    const [message] = await tx.update(messages).set(input.status === "sent"
      ? { status: "sent", providerMessageId: input.providerMessageId, providerStatus: "sent", providerUpdatedAt: now, revision: sql`${messages.revision} + 1`, updatedAt: now }
      : { status: "failed", providerStatus: input.reason.slice(0, 64), providerUpdatedAt: now, revision: sql`${messages.revision} + 1`, updatedAt: now })
      .where(and(eq(messages.id, input.messageId), eq(messages.businessId, input.businessId))).returning({ conversationId: messages.conversationId });
    if (input.status === "failed" && input.reconnectRequired) {
      await tx.update(instagramAccounts).set({ status: "reconnect_required", lastError: input.reason.slice(0, 500), updatedAt: now }).where(eq(instagramAccounts.businessId, input.businessId));
    }
    if (message) await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "message", aggregateId: input.messageId, dedupeKey: `message:${input.messageId}:instagram:${input.status}`, payload: { type: "message.deliveryUpdated", entityId: input.messageId, conversationId: message.conversationId } });
  });
}

/**
 * Refreshes the account's token when it has less than two weeks left, so an
 * account that gets no messages for a while doesn't lapse. A token Instagram
 * refuses marks the account for reconnecting. Instagram is called outside any
 * transaction, and the result is saved only if nothing replaced the token
 * meanwhile, such as the owner connecting again.
 */
export async function refreshInstagramTokenIfDue(
  context: DomainContext,
  input: { businessId: string; now?: Date; decryptToken: (value: string) => string; encryptToken: (value: string) => string; refreshAccessToken: (token: string) => Promise<{ accessToken: string; expiresIn: number }> },
): Promise<"refreshed" | "current" | "none" | "reconnect_required"> {
  const scope = { businessId: input.businessId, actorType: "worker" as const };
  const [account] = await withBusinessTransaction(context.db, scope, async (tx) => await tx.select().from(instagramAccounts).where(eq(instagramAccounts.businessId, input.businessId)).limit(1));
  if (!account || account.status !== "connected") return "none";
  const now = input.now ?? new Date();
  if (account.tokenExpiresAt.getTime() - now.getTime() > INSTAGRAM_TOKEN_REFRESH_BEFORE_MS) return "current";
  if (now.getTime() - account.updatedAt.getTime() < INSTAGRAM_TOKEN_MIN_AGE_MS && account.tokenExpiresAt.getTime() > now.getTime()) return "current";
  const unchanged = and(eq(instagramAccounts.id, account.id), eq(instagramAccounts.encryptedAccessToken, account.encryptedAccessToken), eq(instagramAccounts.status, "connected"));
  let refreshed: { accessToken: string; expiresIn: number };
  try {
    refreshed = await input.refreshAccessToken(input.decryptToken(account.encryptedAccessToken));
  } catch (error) {
    if (!(error as { reconnectRequired?: boolean }).reconnectRequired && account.tokenExpiresAt.getTime() > now.getTime()) throw error;
    return await withBusinessTransaction(context.db, scope, async (tx) => {
      const [marked] = await tx.update(instagramAccounts).set({ status: "reconnect_required", lastError: "Instagram authorization expired. Connect the account again.", updatedAt: now }).where(unchanged).returning({ id: instagramAccounts.id });
      if (!marked) return "current";
      await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "aiReplyFailed", eventKey: `instagram-reconnect:${account.id}:${now.toISOString().slice(0, 10)}`, subject: "Reconnect Instagram", body: "Instagram stopped accepting the receptionist's access. Open Integrations and connect Instagram again." });
      return "reconnect_required";
    });
  }
  const saved = await withBusinessTransaction(context.db, scope, async (tx) => await tx.update(instagramAccounts).set({ encryptedAccessToken: input.encryptToken(refreshed.accessToken), tokenExpiresAt: new Date(now.getTime() + refreshed.expiresIn * 1000), lastError: null, updatedAt: now }).where(unchanged).returning({ id: instagramAccounts.id }));
  return saved.length ? "refreshed" : "current";
}
