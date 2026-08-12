import { and, eq, sql } from "drizzle-orm";

import { calls, contacts, conversations, conversationSessions, enqueueOutbox, messages, transcripts, withBusinessTransaction } from "@lobbystack/db";
import { isTerminalTwilioCallStatus } from "@lobbystack/shared";

import type { DomainContext } from "./context";
import { queueOperatorAlertInTransaction } from "./notifications";
import { finalizeWebVoiceUsageInTransaction, normalizeWebCallMaxDurationMs, reserveWebVoiceUsageInTransaction } from "./billing";

export async function startCall(
  context: DomainContext,
  input: {
    businessId: string;
    provider: string;
    providerCallId: string;
    from: string;
    to: string;
    transport: string;
    gatewaySessionId?: string;
    startedAt?: string;
    originUrl?: string;
    userAgent?: string;
    widgetId?: string;
    sessionPurpose?: string;
    prospectDemoId?: string;
    maxDurationMs?: number;
    billable?: boolean;
  },
): Promise<{ callId: string; conversationId: string; contactId: string; duplicate: boolean; blocked: boolean; webCallMaxDurationMs?: number }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const existing = await tx.select({ id: calls.id, conversationId: calls.conversationId, contactId: calls.contactId, webCallMaxDurationMs: calls.webCallMaxDurationMs }).from(calls).where(and(eq(calls.provider, input.provider), eq(calls.providerCallId, input.providerCallId))).limit(1);
    if (existing[0]?.conversationId && existing[0]?.contactId) {
      const contact = (await tx.select({ operatorBlockedAt: contacts.operatorBlockedAt }).from(contacts).where(and(eq(contacts.id, existing[0].contactId), eq(contacts.businessId, input.businessId))).limit(1))[0];
      return { callId: existing[0].id, conversationId: existing[0].conversationId, contactId: existing[0].contactId, duplicate: true, blocked: Boolean(contact?.operatorBlockedAt), ...(existing[0].webCallMaxDurationMs !== null ? { webCallMaxDurationMs: existing[0].webCallMaxDurationMs } : {}) };
    }
    const existingContacts = await tx.select({ id: contacts.id, operatorBlockedAt: contacts.operatorBlockedAt }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.from))).limit(1);
    const contactId = existing[0]?.contactId ?? existingContacts[0]?.id ?? (await tx.insert(contacts).values({ businessId: input.businessId, phone: input.from }).returning({ id: contacts.id }))[0]?.id;
    if (!contactId) {
      throw new Error("Call contact could not be created.");
    }
    const blocked = Boolean(existingContacts[0]?.operatorBlockedAt);
    const conversationId = existing[0]?.conversationId ?? (await tx.insert(conversations).values({ businessId: input.businessId, contactId, channel: "voice", status: "open", automationState: "ai_active" }).returning({ id: conversations.id }))[0]?.id;
    if (!conversationId) {
      throw new Error("Call conversation could not be created.");
    }
    const callId = existing[0]?.id ?? (await tx.insert(calls).values({
      businessId: input.businessId,
      conversationId,
      contactId,
      provider: input.provider,
      providerCallId: input.providerCallId,
      transport: input.transport,
      ...(input.originUrl !== undefined ? { originUrl: input.originUrl } : {}),
      ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
      ...(input.widgetId !== undefined ? { widgetId: input.widgetId } : {}),
      ...(input.sessionPurpose !== undefined ? { sessionPurpose: input.sessionPurpose } : {}),
      ...(input.prospectDemoId !== undefined ? { prospectDemoId: input.prospectDemoId } : {}),
      ...(input.transport === "web_voice" ? { webCallMaxDurationMs: normalizeWebCallMaxDurationMs(input.maxDurationMs) } : {}),
      ...(blocked ? { status: "blocked", disposition: "blocked_contact" } : {}),
      ...(input.gatewaySessionId !== undefined ? { gatewaySessionId: input.gatewaySessionId } : {}),
      startedAt: new Date(input.startedAt ?? Date.now()),
    }).returning({ id: calls.id }))[0]?.id;
    if (!callId) {
      throw new Error("Call could not be persisted.");
    }
    let webCallMaxDurationMs = input.transport === "web_voice" ? normalizeWebCallMaxDurationMs(input.maxDurationMs) : undefined;
    if (input.transport === "web_voice" && input.billable !== false) {
      const allowance = await reserveWebVoiceUsageInTransaction(tx, { businessId: input.businessId, callId, ...(input.maxDurationMs !== undefined ? { maxDurationMs: input.maxDurationMs } : {}) });
      if (!allowance.allowed) {
        const error = new Error(allowance.errorCode ?? "voice_limit_reached") as Error & { status: number; code: string };
        error.status = 402;
        error.code = allowance.errorCode ?? "voice_limit_reached";
        throw error;
      }
      webCallMaxDurationMs = allowance.maxDurationMs;
      await tx.update(calls).set({ webCallMaxDurationMs, updatedAt: new Date() }).where(and(eq(calls.id, callId), eq(calls.businessId, input.businessId)));
    }
    await tx.insert(conversationSessions).values({
      businessId: input.businessId,
      conversationId,
      callId,
      channel: input.transport.includes("web") ? "web_voice" : "voice",
      status: "open",
      startedAt: new Date(input.startedAt ?? Date.now()),
    }).onConflictDoNothing();
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "call",
      aggregateId: callId,
      dedupeKey: `call:${callId}:started`,
      payload: { type: "call.started", entityId: callId, revision: 0 },
    });
    return { callId, conversationId, contactId, duplicate: false, blocked, ...(webCallMaxDurationMs !== undefined ? { webCallMaxDurationMs } : {}) };
  });
}

export async function upsertTranscript(
  context: DomainContext,
  input: { businessId: string; callId: string; sequence: number; speaker: string; text: string; final: boolean; confidence?: number },
): Promise<{ transcriptId: string; revision: number }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx.insert(transcripts).values({
      businessId: input.businessId,
      callId: input.callId,
      sequence: input.sequence,
      speaker: input.speaker,
      text: input.text,
      final: input.final,
      ...(input.confidence !== undefined ? { confidence: Math.round(input.confidence * 100) } : {}),
    }).onConflictDoUpdate({
      target: [transcripts.callId, transcripts.sequence],
      set: {
        speaker: input.speaker,
        text: input.text,
        final: input.final,
        ...(input.confidence !== undefined ? { confidence: Math.round(input.confidence * 100) } : {}),
        revision: sql`${transcripts.revision} + 1`,
        updatedAt: new Date(),
      },
    }).returning({ id: transcripts.id, revision: transcripts.revision });
    if (!row) {
      throw new Error("Transcript could not be persisted.");
    }
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "transcript",
      aggregateId: row.id,
      dedupeKey: `transcript:${input.callId}:${input.sequence}:${row.revision}`,
      payload: { type: "transcript.upserted", entityId: row.id, callId: input.callId, revision: row.revision },
    });
    return { transcriptId: row.id, revision: row.revision };
  });
}

export async function completeCall(
  context: DomainContext,
  input: { businessId: string; callId: string; status: string; endedAt: string; disposition?: string; providerDurationSeconds?: number },
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [call] = await tx.update(calls).set({
      status: input.status,
      endedAt: new Date(input.endedAt),
      ...(input.disposition !== undefined ? { disposition: input.disposition } : {}),
      ...(input.providerDurationSeconds !== undefined ? { providerDurationSeconds: input.providerDurationSeconds } : {}),
      revision: sql`${calls.revision} + 1`,
      updatedAt: new Date(),
    }).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).returning({ id: calls.id, revision: calls.revision, transport: calls.transport, startedAt: calls.startedAt });
    if (!call) {
      return;
    }
    if (call.transport === "web_voice") {
      const durationSeconds = input.providerDurationSeconds ?? Math.max(0, (new Date(input.endedAt).getTime() - call.startedAt.getTime()) / 1_000);
      await finalizeWebVoiceUsageInTransaction(tx, { businessId: input.businessId, callId: call.id, durationSeconds });
    }
    await enqueueOutbox(tx, {
      topic: "realtime.publish",
      businessId: input.businessId,
      aggregateType: "call",
      aggregateId: call.id,
      dedupeKey: `call:${call.id}:completed:${call.revision}`,
      payload: { type: "call.completed", entityId: call.id, revision: call.revision },
    });
    await enqueueOutbox(tx, {
      topic: "conversation.finalizeSession",
      businessId: input.businessId,
      aggregateType: "call",
      aggregateId: call.id,
      dedupeKey: `call:${call.id}:finalize`,
      payload: { callId: call.id },
    });
  });
}

export async function setTransferState(
  context: DomainContext,
  input: { businessId: string; callId: string; transferState: string },
): Promise<void> {
  await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [call] = await tx.update(calls).set({ transferState: input.transferState, revision: sql`${calls.revision} + 1`, updatedAt: new Date() }).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).returning({ id: calls.id, revision: calls.revision });
    if (call) {
      await enqueueOutbox(tx, {
        topic: "realtime.publish",
        businessId: input.businessId,
        aggregateType: "call",
        aggregateId: call.id,
        dedupeKey: `call:${call.id}:transfer:${call.revision}`,
        payload: { type: "call.updated", entityId: call.id, revision: call.revision },
      });
      if (input.transferState === "failed") await queueOperatorAlertInTransaction(tx, { businessId: input.businessId, eventKind: "transferFailed", eventKey: `transferFailed:${call.id}`, subject: "Live call transfer failed", body: "A live call transfer failed. Open the call details to review it." });
    }
  });
}

export async function reconcileCallStatus(
  context: DomainContext,
  input: { businessId: string; providerCallId: string; status: string; providerDurationSeconds?: number; providerUpdatedAt: string },
): Promise<{ ignored: boolean; callId?: string }> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [call] = await tx.update(calls).set({ status: input.status, ...(input.providerDurationSeconds !== undefined ? { providerDurationSeconds: input.providerDurationSeconds } : {}), updatedAt: new Date(input.providerUpdatedAt), revision: sql`${calls.revision} + 1` }).where(and(eq(calls.businessId, input.businessId), eq(calls.providerCallId, input.providerCallId))).returning({ id: calls.id, revision: calls.revision });
    if (!call) {
      return { ignored: true };
    }
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "call", aggregateId: call.id, dedupeKey: `call:${call.id}:provider-status:${call.revision}`, payload: { type: "call.updated", entityId: call.id, revision: call.revision } });
    if (isTerminalTwilioCallStatus(input.status)) {
      await enqueueOutbox(tx, { topic: "call.syncPrice", businessId: input.businessId, aggregateType: "call", aggregateId: call.id, dedupeKey: `call:${call.id}:price:${input.status.trim().toLowerCase()}`, payload: { providerCallId: input.providerCallId, providerCallStatus: input.status } });
    }
    return { ignored: false, callId: call.id };
  });
}

export async function recordCallProviderPricing(
  context: DomainContext,
  input: { businessId: string; providerCallId: string; providerUpdatedAt?: string; providerPrice?: number; providerPriceUnit?: string; providerCostUsd?: number },
): Promise<boolean> {
  return await withBusinessTransaction(context.db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [call] = await tx.update(calls).set({
      ...(input.providerUpdatedAt ? { providerUpdatedAt: new Date(input.providerUpdatedAt) } : {}),
      ...(input.providerPrice !== undefined ? { providerPrice: input.providerPrice } : {}),
      ...(input.providerPriceUnit !== undefined ? { providerPriceUnit: input.providerPriceUnit } : {}),
      ...(input.providerCostUsd !== undefined ? { providerCostUsd: input.providerCostUsd } : {}),
      revision: sql`${calls.revision} + 1`,
      updatedAt: new Date(),
    }).where(and(eq(calls.businessId, input.businessId), eq(calls.providerCallId, input.providerCallId))).returning({ id: calls.id, revision: calls.revision });
    if (!call) return false;
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "call", aggregateId: call.id, dedupeKey: `call:${call.id}:pricing:${call.revision}`, payload: { type: "call.updated", entityId: call.id, revision: call.revision } });
    return true;
  });
}
