import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

import { appointments, calls, contacts, conversations, conversationSessions, enqueueOutbox, services, staff, storageObjects, transcripts, withBusinessTransaction } from "@lobbystack/db";
import { isTerminalTwilioCallStatus } from "@lobbystack/shared";

import { requireBusinessMembership } from "../authz";
import type { DomainContext } from "./context";
import { queueOperatorAlertInTransaction } from "./notifications";
import { applyNonAiUsageInTransaction, finalizeWebVoiceUsageInTransaction, normalizeWebCallMaxDurationMs, reserveWebVoiceUsageInTransaction } from "./billing";
import { enqueueUsageSyncInTransaction } from "./usage";
import { recordUnitEconomicsEventInTransaction } from "./unitEconomics";

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
    const anonymousWebCaller = input.from === "web";
    const existingContacts = anonymousWebCaller ? [] : await tx.select({ id: contacts.id, operatorBlockedAt: contacts.operatorBlockedAt }).from(contacts).where(and(eq(contacts.businessId, input.businessId), eq(contacts.phone, input.from))).limit(1);
    const contactId = existing[0]?.contactId ?? existingContacts[0]?.id ?? (await tx.insert(contacts).values({ businessId: input.businessId, ...(anonymousWebCaller ? {} : { phone: input.from }) }).returning({ id: contacts.id }))[0]?.id;
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
      ...(input.billable === false ? { billingExcluded: true } : {}),
      ...(blocked ? { status: "blocked", disposition: "blocked_contact" } : {}),
      ...(input.gatewaySessionId !== undefined ? { gatewaySessionId: input.gatewaySessionId } : {}),
      startedAt: new Date(input.startedAt ?? Date.now()),
    }).returning({ id: calls.id }))[0]?.id;
    if (!callId) {
      throw new Error("Call could not be persisted.");
    }
    let webCallMaxDurationMs = input.transport === "web_voice" ? normalizeWebCallMaxDurationMs(input.maxDurationMs) : undefined;
    if (input.billable !== false) {
      if (input.transport === "web_voice") {
        const allowance = await reserveWebVoiceUsageInTransaction(tx, { businessId: input.businessId, callId, ...(input.maxDurationMs !== undefined ? { maxDurationMs: input.maxDurationMs } : {}) });
        if (!allowance.allowed) {
          const error = new Error(allowance.errorCode ?? "voice_limit_reached") as Error & { status: number; code: string };
          error.status = 402;
          error.code = allowance.errorCode ?? "voice_limit_reached";
          throw error;
        }
        webCallMaxDurationMs = allowance.maxDurationMs;
        await tx.update(calls).set({ webCallMaxDurationMs, updatedAt: new Date() }).where(and(eq(calls.id, callId), eq(calls.businessId, input.businessId)));
      } else {
        const allowance = await applyNonAiUsageInTransaction(tx, { operation: "reserve", businessId: input.businessId, usageKind: "voice_seconds", sourceKey: `voice:${callId}` });
        if (!allowance.allowed) {
          const error = new Error(allowance.errorCode ?? "voice_limit_reached") as Error & { status: number; code: string };
          error.status = 402;
          error.code = allowance.errorCode ?? "voice_limit_reached";
          throw error;
        }
      }
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
    }).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).returning({ id: calls.id, revision: calls.revision, transport: calls.transport, startedAt: calls.startedAt, billingExcluded: calls.billingExcluded });
    if (!call) {
      return;
    }
    if (call.billingExcluded) {
      // Prospect demos and other explicitly non-billable calls never create usage.
    } else if (call.transport === "web_voice") {
      const durationSeconds = input.providerDurationSeconds ?? Math.max(0, (new Date(input.endedAt).getTime() - call.startedAt.getTime()) / 1_000);
      await finalizeWebVoiceUsageInTransaction(tx, { businessId: input.businessId, callId: call.id, durationSeconds });
    } else {
      const durationSeconds = input.providerDurationSeconds ?? Math.max(0, (new Date(input.endedAt).getTime() - call.startedAt.getTime()) / 1_000);
      const usageEventId = await applyNonAiUsageInTransaction(tx, { operation: "correct", businessId: input.businessId, sourceKey: `voice:${call.id}`, usageKind: "voice_seconds", quantity: durationSeconds });
      await enqueueUsageSyncInTransaction(tx, { businessId: input.businessId, usageEventId });
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
    const [call] = await tx.update(calls).set({ status: input.status, ...(input.providerDurationSeconds !== undefined ? { providerDurationSeconds: input.providerDurationSeconds } : {}), updatedAt: new Date(input.providerUpdatedAt), revision: sql`${calls.revision} + 1` }).where(and(eq(calls.businessId, input.businessId), eq(calls.providerCallId, input.providerCallId))).returning({ id: calls.id, revision: calls.revision, providerDurationSeconds: calls.providerDurationSeconds, startedAt: calls.startedAt });
    if (!call) {
      return { ignored: true };
    }
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "call", aggregateId: call.id, dedupeKey: `call:${call.id}:provider-status:${call.revision}`, payload: { type: "call.updated", entityId: call.id, revision: call.revision } });
    if (isTerminalTwilioCallStatus(input.status)) {
      const estimatedRate = Number(process.env.TWILIO_VOICE_ESTIMATED_COST_PER_MINUTE_USD ?? "0");
      if (Number.isFinite(estimatedRate) && estimatedRate > 0 && call.providerDurationSeconds !== null) {
        await recordUnitEconomicsEventInTransaction(tx, { businessId: input.businessId, eventKey: `voice_provider:${call.id}`, eventKind: "voice_provider", channel: "voice", costUsd: call.providerDurationSeconds / 60 * estimatedRate, occurredAt: call.startedAt, quantity: call.providerDurationSeconds, quantityUnit: "second", provider: "twilio_estimate", callId: call.id });
      }
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
    }).where(and(eq(calls.businessId, input.businessId), eq(calls.providerCallId, input.providerCallId))).returning({ id: calls.id, revision: calls.revision, providerDurationSeconds: calls.providerDurationSeconds, startedAt: calls.startedAt });
    if (!call) return false;
    if (input.providerCostUsd !== undefined) await recordUnitEconomicsEventInTransaction(tx, { businessId: input.businessId, eventKey: `voice_provider:${call.id}`, eventKind: "voice_provider", channel: "voice", costUsd: input.providerCostUsd, occurredAt: call.startedAt, ...(call.providerDurationSeconds !== null ? { quantity: call.providerDurationSeconds } : {}), quantityUnit: "second", provider: "twilio", callId: call.id });
    await enqueueOutbox(tx, { topic: "realtime.publish", businessId: input.businessId, aggregateType: "call", aggregateId: call.id, dedupeKey: `call:${call.id}:pricing:${call.revision}`, payload: { type: "call.updated", entityId: call.id, revision: call.revision } });
    return true;
  });
}

type RecordingState = "available" | "pending" | "expired" | "missing";

function recordingState(input: { recordingObjectId: string | null; recordingStatus: string | null; retentionUntil: Date | null }): RecordingState {
  if (!input.recordingObjectId) return "missing";
  if (!input.recordingStatus || input.recordingStatus === "pending") return "pending";
  if (input.recordingStatus === "deleted" || (input.retentionUntil !== null && input.retentionUntil <= new Date())) return "expired";
  return "available";
}

export async function listCalls(
  context: DomainContext,
  input: { userId: string; businessId: string; search?: string; limit?: number; offset?: number },
): Promise<{ calls: Array<Record<string, unknown>>; pagination: { limit: number; offset: number; hasNext: boolean } }> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 100);
    const offset = Math.max(Math.trunc(input.offset ?? 0), 0);
    const search = input.search?.trim();
    const rows = await tx.select({
       id: calls.id,
      providerCallId: calls.providerCallId,
      status: calls.status,
      disposition: calls.disposition,
      reason: conversations.summary,
      startedAt: calls.startedAt,
      endedAt: calls.endedAt,
      providerDurationSeconds: calls.providerDurationSeconds,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      recordingObjectId: calls.recordingObjectId,
      recordingStatus: storageObjects.status,
       recordingRetentionUntil: storageObjects.retentionUntil,
       transcriptPreview: sql<string | null>`(select ${transcripts.text} from ${transcripts} where ${transcripts.callId} = ${calls.id} order by ${transcripts.sequence} desc limit 1)`,
    }).from(calls)
      .leftJoin(contacts, eq(calls.contactId, contacts.id))
      .leftJoin(conversations, eq(calls.conversationId, conversations.id))
      .leftJoin(storageObjects, eq(calls.recordingObjectId, storageObjects.id))
      .where(and(
        eq(calls.businessId, input.businessId),
        ...(search ? [or(ilike(contacts.name, `%${search}%`), ilike(contacts.phone, `%${search}%`), ilike(conversations.summary, `%${search}%`), ilike(calls.disposition, `%${search}%`), ilike(calls.providerCallId, `%${search}%`))!] : []),
      ))
      .orderBy(desc(calls.startedAt))
      .limit(limit + 1)
      .offset(offset);
    const hasNext = rows.length > limit;
    return {
      calls: rows.slice(0, limit).map((row) => ({
        id: row.id,
        providerCallId: row.providerCallId,
        status: row.status,
        disposition: row.disposition,
        reason: row.reason === row.disposition ? null : row.reason,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        providerDurationSeconds: row.providerDurationSeconds,
        contactName: row.contactName,
        contactPhone: row.contactPhone,
         recordingState: recordingState({ recordingObjectId: row.recordingObjectId, recordingStatus: row.recordingStatus, retentionUntil: row.recordingRetentionUntil }),
         transcriptPreview: row.transcriptPreview,
      })),
      pagination: { limit, offset, hasNext },
    };
  });
}

export async function getCallDetail(
  context: DomainContext,
  input: { userId: string; businessId: string; callId: string },
): Promise<{
  call: Record<string, unknown>;
  contact: Record<string, unknown> | null;
  outcome: string | null;
  timeline: Array<{ type: string; at: Date; status: string }>;
  transcript: Array<Record<string, unknown>>;
  recording: { state: RecordingState; objectId?: string; contentType?: string; retentionUntil?: Date };
  appointments: Array<Record<string, unknown>>;
  followUpTasks: Array<Record<string, unknown>>;
} | null> {
  return await withBusinessTransaction(context.db, { ...input, actorType: "operator" }, async (tx) => {
    await requireBusinessMembership(tx, input);
    const row = (await tx.select({
      id: calls.id,
      providerCallId: calls.providerCallId,
      provider: calls.provider,
      transport: calls.transport,
      status: calls.status,
      disposition: calls.disposition,
      reason: conversations.summary,
      transferState: calls.transferState,
      startedAt: calls.startedAt,
      endedAt: calls.endedAt,
      providerDurationSeconds: calls.providerDurationSeconds,
      gatewaySessionId: calls.gatewaySessionId,
      contactId: calls.contactId,
      recordingObjectId: calls.recordingObjectId,
      recordingStatus: storageObjects.status,
      recordingContentType: storageObjects.contentType,
      recordingRetentionUntil: storageObjects.retentionUntil,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      contactEmail: contacts.email,
      contactBlockedAt: contacts.operatorBlockedAt,
    }).from(calls)
      .leftJoin(contacts, eq(calls.contactId, contacts.id))
      .leftJoin(conversations, eq(calls.conversationId, conversations.id))
      .leftJoin(storageObjects, eq(calls.recordingObjectId, storageObjects.id))
      .where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId)))
      .limit(1))[0];
    if (!row) return null;

    const [transcript, appointmentRows] = await Promise.all([
      tx.select({ id: transcripts.id, sequence: transcripts.sequence, speaker: transcripts.speaker, text: transcripts.text, confidence: transcripts.confidence, final: transcripts.final, createdAt: transcripts.createdAt }).from(transcripts).where(and(eq(transcripts.callId, input.callId), eq(transcripts.businessId, input.businessId))).orderBy(asc(transcripts.sequence)),
      row.contactId
        ? tx.select({ id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt, timezone: appointments.timezone, status: appointments.status, serviceName: services.name, staffName: staff.name }).from(appointments).innerJoin(services, eq(appointments.serviceId, services.id)).innerJoin(staff, eq(appointments.staffId, staff.id)).where(and(eq(appointments.businessId, input.businessId), eq(appointments.contactId, row.contactId))).orderBy(asc(appointments.startsAt))
        : Promise.resolve([]),
    ]);
    const state = recordingState({ recordingObjectId: row.recordingObjectId, recordingStatus: row.recordingStatus, retentionUntil: row.recordingRetentionUntil });
    const timeline = [
      { type: "started", at: row.startedAt, status: row.status },
      ...(row.endedAt ? [{ type: "ended", at: row.endedAt, status: row.status }] : []),
    ];
    return {
      call: {
        id: row.id,
        providerCallId: row.providerCallId,
        provider: row.provider,
        transport: row.transport,
        status: row.status,
        disposition: row.disposition,
        transferState: row.transferState,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        providerDurationSeconds: row.providerDurationSeconds,
        gatewaySessionId: row.gatewaySessionId,
      },
      contact: row.contactId ? { id: row.contactId, name: row.contactName, phone: row.contactPhone, email: row.contactEmail, blockedAt: row.contactBlockedAt } : null,
      outcome: row.reason === row.disposition ? null : row.reason,
      timeline,
      transcript,
      recording: {
        state,
        ...(row.recordingObjectId ? { objectId: row.recordingObjectId } : {}),
        ...(row.recordingContentType ? { contentType: row.recordingContentType } : {}),
        ...(row.recordingRetentionUntil ? { retentionUntil: row.recordingRetentionUntil } : {}),
      },
      appointments: appointmentRows,
      // Follow-up tasks are not part of the replacement schema yet.
      followUpTasks: [],
    };
  });
}
