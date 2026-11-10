import { and, eq } from "drizzle-orm";

import { businesses, calls, contacts, transcripts, type DatabaseTransaction } from "@lobbystack/db";
import type { CallSummaryEmailDetails, CallSummaryOutcome } from "@lobbystack/shared";

import { appBaseUrl } from "./appBaseUrl";
import type { CallOutcome } from "./callOutcome";
import { isRealCallCandidate } from "./firstRealConversation";
import { queueOperatorAlertInTransaction } from "./notifications";

/** The longest summary a text alert carries; the email shows it whole. */
const TEXT_SUMMARY_LENGTH = 240;

/**
 * Queues the team's alert for a call the agent just answered, once its
 * summary is saved: who called, when, for how long, and what happened. It
 * skips the calls that aren't a customer's (test calls, demos, calls where
 * the caller never spoke) and calls where the caller left a message, which
 * the voice message alert already covers.
 */
export async function queueCallSummaryAlertInTransaction(tx: DatabaseTransaction, input: { businessId: string; callId: string; outcome: CallOutcome; callerName?: string | undefined }): Promise<string[]> {
  if (input.outcome.kind === "message_taking") return [];
  const [call] = await tx.select({ contactId: calls.contactId, transport: calls.transport, widgetId: calls.widgetId, prospectDemoId: calls.prospectDemoId, mediaStartedAt: calls.mediaStartedAt, disposition: calls.disposition, status: calls.status, transferState: calls.transferState, startedAt: calls.startedAt, endedAt: calls.endedAt, providerDurationSeconds: calls.providerDurationSeconds })
    .from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId))).limit(1);
  if (!call || !isRealCallCandidate(call)) return [];
  const [callerTurn] = await tx.select({ id: transcripts.id }).from(transcripts).where(and(eq(transcripts.businessId, input.businessId), eq(transcripts.callId, input.callId), eq(transcripts.speaker, "caller"))).limit(1);
  if (!callerTurn) return [];
  const [business] = await tx.select({ name: businesses.name, timezone: businesses.timezone }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (!business) return [];
  const contact = call.contactId ? (await tx.select({ name: contacts.name, phone: contacts.phone }).from(contacts).where(and(eq(contacts.id, call.contactId), eq(contacts.businessId, input.businessId))).limit(1))[0] : undefined;
  const callerName = contact?.name?.trim() || input.callerName?.trim() || "";
  const callerPhone = contact?.phone?.trim() || "";
  const caller = callerName || callerPhone || "an unknown caller";
  const answeredAt = call.mediaStartedAt ?? call.startedAt;
  const durationSeconds = call.providerDurationSeconds ?? (call.endedAt ? Math.max(0, Math.round((call.endedAt.getTime() - answeredAt.getTime()) / 1_000)) : null);
  const booked = input.outcome.kind === "booked" ? input.outcome : undefined;
  const outcome: CallSummaryOutcome | "" = booked ? "booked" : call.status === "transferred" || call.transferState === "completed" ? "transferred" : "";
  const summary = input.outcome.kind === "summary" ? input.outcome.summary : "";
  const textSummary = summary.length > TEXT_SUMMARY_LENGTH ? `${summary.slice(0, TEXT_SUMMARY_LENGTH - 1).trimEnd()}…` : summary;
  // Each recipient's copy adds their language.
  const details: Omit<CallSummaryEmailDetails, "locale"> = {
    businessName: business.name,
    callerName,
    callerPhone,
    startedAt: answeredAt.toISOString(),
    timezone: business.timezone,
    durationSeconds: durationSeconds === null ? "" : String(durationSeconds),
    outcome,
    bookedAt: booked?.startsAt ?? "",
    bookedService: booked?.serviceName ?? "",
    summary,
    url: `${appBaseUrl()}/calls/${input.callId}`,
  };
  return await queueOperatorAlertInTransaction(tx, {
    businessId: input.businessId,
    eventKind: "callCompleted",
    eventKey: `callCompleted:${input.callId}`,
    subject: `New call from ${caller}`,
    body: [`${business.name}: new call from ${caller}.`, booked ? "They booked an appointment." : outcome === "transferred" ? "It was transferred to your team." : textSummary].filter(Boolean).join(" "),
    details,
  });
}
