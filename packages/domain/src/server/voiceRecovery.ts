import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { calls, withBusinessTransaction, type Database } from "@lobbystack/db";

import { completeCall } from "./voice";

/**
 * Web-voice admission reserves allowance before the gateway allocates the provider call. If the
 * gateway dies between those two steps the durable call row can be left open, and the reserved
 * allowance is never converted to usage or released. This module reconciles those rows.
 *
 * Two rules shape every branch here:
 *
 * 1. A reservation is only released when consumption is *proven*. Our own wall clock cannot prove
 *    how long the provider billed, so elapsed time never decides a refund on its own.
 * 2. Completion is idempotent, not exactly-once. `completeCall` only finalizes a call whose
 *    `ended_at` is still null, and usage corrections key on the existing `voice:${callId}`
 *    identity, so a second reconciler is a no-op instead of a double charge.
 */

export const WEB_VOICE_DEFAULT_CAP_MS = 5 * 60_000;
export const WEB_VOICE_RECONCILE_GRACE_MS = 10 * 60_000;
export const WEB_VOICE_RECONCILE_MAX_BATCH = 200;

const reconcilableStatuses = ["started", "in_progress", "allocating"];

export type WebVoiceProviderKind = "unallocated_unknown" | "allocated";

/**
 * The gateway writes a `webcall_<session>` placeholder before it talks to OpenAI and replaces it
 * with the provider's call ID after. A placeholder therefore means "we cannot see whether a
 * provider call was allocated": it covers both a crash before allocation and a crash after
 * allocation but before binding.
 */
export function classifyWebVoiceProviderId(providerCallId: string): WebVoiceProviderKind {
  return providerCallId.startsWith("webcall_") ? "unallocated_unknown" : "allocated";
}

export type StalledWebVoiceCall = {
  callId: string;
  businessId: string;
  providerKind: WebVoiceProviderKind;
  status: string;
  startedAt: string;
  ageMs: number;
  reservedSeconds: number;
  requiredOperatorAction: "verify_provider_then_complete" | "attest_provider_unconsumed";
};

function reservedSecondsFor(webCallMaxDurationMs: number | null): number {
  const normalized = Number.isFinite(webCallMaxDurationMs) && (webCallMaxDurationMs ?? 0) > 0
    ? Math.floor(webCallMaxDurationMs as number)
    : WEB_VOICE_DEFAULT_CAP_MS;
  return Math.max(0, Math.floor(normalized / 1_000));
}

function toSummary(row: {
  id: string;
  businessId: string;
  providerCallId: string;
  status: string;
  startedAt: Date;
  webCallMaxDurationMs: number | null;
}, nowMs: number): StalledWebVoiceCall {
  const providerKind = classifyWebVoiceProviderId(row.providerCallId);
  return {
    callId: row.id,
    businessId: row.businessId,
    providerKind,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    ageMs: Math.max(0, nowMs - row.startedAt.getTime()),
    reservedSeconds: reservedSecondsFor(row.webCallMaxDurationMs),
    requiredOperatorAction: providerKind === "allocated" ? "verify_provider_then_complete" : "attest_provider_unconsumed",
  };
}

/**
 * Bounded, PII-free view of open web-voice calls. Only reconciliation-safe columns are selected:
 * no contact, conversation, transcript, page URL, or user-agent data leaves this function.
 */
export async function listStalledWebVoiceCalls(
  db: Database,
  input: { businessId: string; olderThanMs: number; limit?: number; nowMs?: number },
): Promise<StalledWebVoiceCall[]> {
  const nowMs = input.nowMs ?? Date.now();
  const limit = Math.min(Math.max(1, Math.floor(input.limit ?? WEB_VOICE_RECONCILE_MAX_BATCH)), WEB_VOICE_RECONCILE_MAX_BATCH);
  const cutoff = new Date(nowMs - Math.max(0, input.olderThanMs));
  return await withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    // Bounded read: never let a stuck list hold locks or scan without limit.
    await tx.execute(sql`set local statement_timeout = '10s'`);
    await tx.execute(sql`set local lock_timeout = '2s'`);
    const rows = await tx.select({
      id: calls.id,
      businessId: calls.businessId,
      providerCallId: calls.providerCallId,
      status: calls.status,
      startedAt: calls.startedAt,
      webCallMaxDurationMs: calls.webCallMaxDurationMs,
    }).from(calls).where(and(
      eq(calls.businessId, input.businessId),
      eq(calls.transport, "web_voice"),
      isNull(calls.endedAt),
      lt(calls.startedAt, cutoff),
      inArray(calls.status, reconcilableStatuses),
    )).orderBy(asc(calls.startedAt)).limit(limit);
    return rows.map((row) => toSummary(row, nowMs));
  });
}

/**
 * Provider-reported seconds bounded by the reservation. Returns null when no reported duration
 * exists, which forces the caller into the manual path instead of guessing from elapsed time.
 */
export function boundedReconciledVoiceSeconds(input: {
  reservedSeconds: number;
  providerDurationSeconds?: number | null | undefined;
  mediaDurationSeconds?: number | null | undefined;
}): number | null {
  const reported = [input.providerDurationSeconds, input.mediaDurationSeconds].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
  if (reported.length === 0) return null;
  const reserved = Math.max(0, Math.floor(input.reservedSeconds));
  // Use the larger reported duration, capped at the reserved allowance.
  return Math.min(Math.max(...reported), reserved);
}

export type WebVoiceReconcileEvidence =
  | {
      kind: "provider_terminal";
      reference: string;
      providerCallId: string;
      providerDurationSeconds?: number | undefined;
      mediaDurationSeconds?: number | undefined;
    }
  | {
      kind: "operator_attestation";
      reference: string;
    };

export type ReconcileWebVoiceOutcome =
  | { outcome: "completed"; callId: string; disposition: string; boundedSeconds: number }
  | { outcome: "already_finalized"; callId: string }
  | { outcome: "not_found"; callId: string }
  | { outcome: "rejected"; callId: string; code: string; message: string };

function reject(callId: string, code: string, message: string): ReconcileWebVoiceOutcome {
  return { outcome: "rejected", callId, code, message };
}

/**
 * Applies one operator- or provider-verified resolution. The caller must supply proof: either the
 * provider is confirmed terminal (with reported seconds) or an operator explicitly attests the
 * provider consumed nothing. There is no time-based release.
 */
export async function completeReconciledWebVoiceCall(
  db: Database,
  input: {
    businessId: string;
    callId: string;
    evidence: WebVoiceReconcileEvidence;
    nowMs?: number;
  },
): Promise<ReconcileWebVoiceOutcome> {
  const nowMs = input.nowMs ?? Date.now();
  const reference = input.evidence.reference?.trim();
  if (!reference) return reject(input.callId, "reconciliation_reference_required", "A reconciliation reference is required.");

  const current = await withBusinessTransaction(db, { businessId: input.businessId, actorType: "worker" }, async (tx) => {
    const [row] = await tx.select({
      id: calls.id,
      businessId: calls.businessId,
      providerCallId: calls.providerCallId,
      status: calls.status,
      startedAt: calls.startedAt,
      endedAt: calls.endedAt,
      webCallMaxDurationMs: calls.webCallMaxDurationMs,
    }).from(calls).where(and(eq(calls.id, input.callId), eq(calls.businessId, input.businessId), eq(calls.transport, "web_voice"))).limit(1);
    return row ?? null;
  });
  if (!current) return { outcome: "not_found", callId: input.callId };
  if (current.endedAt !== null) return { outcome: "already_finalized", callId: input.callId };
  if (!reconcilableStatuses.includes(current.status)) {
    return reject(input.callId, "call_not_reconcilable", "The call status is not reconcilable.");
  }

  const providerKind = classifyWebVoiceProviderId(current.providerCallId);
  const reservedSeconds = reservedSecondsFor(current.webCallMaxDurationMs);
  const ageMs = Math.max(0, nowMs - current.startedAt.getTime());
  // Wait past the configured cap and grace, then fence the completion against
  // the provider binding below. Age alone cannot prove that allocation ended.
  const settleAfterMs = reservedSeconds * 1_000 + WEB_VOICE_RECONCILE_GRACE_MS;

  let status: "completed" | "failed";
  let disposition: string;
  let providerDurationSeconds: number;
  let mediaDurationSeconds: number;
  let boundedSeconds: number;

  if (input.evidence.kind === "provider_terminal") {
    if (providerKind !== "allocated") {
      return reject(input.callId, "provider_id_unavailable", "The durable call has no real provider call ID to verify.");
    }
    if (input.evidence.providerCallId.trim() !== current.providerCallId) {
      return reject(input.callId, "provider_id_mismatch", "The supplied provider call ID does not match the durable row.");
    }
    if (ageMs < settleAfterMs) {
      return reject(input.callId, "call_not_settled", "The call is too recent to reconcile.");
    }
    const bounded = boundedReconciledVoiceSeconds({
      reservedSeconds,
      providerDurationSeconds: input.evidence.providerDurationSeconds ?? null,
      mediaDurationSeconds: input.evidence.mediaDurationSeconds ?? null,
    });
    if (bounded === null) {
      return reject(input.callId, "provider_duration_unknown", "A confirmed terminal call still needs reported provider seconds; elapsed time cannot decide a release.");
    }
    status = "completed";
    disposition = "reconciled_provider_terminal";
    providerDurationSeconds = bounded;
    mediaDurationSeconds = bounded;
    boundedSeconds = bounded;
  } else {
    if (providerKind === "allocated") {
      return reject(input.callId, "provider_id_known", "A call with a real provider ID must be verified, not attested.");
    }
    if (ageMs < settleAfterMs) {
      return reject(input.callId, "call_not_settled", "The call has not outlived its reservation window plus grace.");
    }
    // Operator attests nothing was consumed. Zero reported seconds release the whole reservation.
    status = "failed";
    disposition = "reconciled_unconsumed_attested";
    providerDurationSeconds = 0;
    mediaDurationSeconds = 0;
    boundedSeconds = 0;
  }

  const completed = await completeCall({ db }, {
    businessId: input.businessId,
    callId: input.callId,
    status,
    endedAt: new Date(nowMs).toISOString(),
    disposition,
    providerDurationSeconds,
    mediaDurationSeconds,
    // Revalidate the provider binding in the finalizing write. A late bind
    // (placeholder -> real provider ID) after the read above then fails the
    // WHERE, so its reservation is retained rather than released from a stale
    // view of the call.
    expectedProviderCallId: current.providerCallId,
  });
  if (!completed) return reject(input.callId, "completion_conflict", "The call changed during reconciliation. Inspect it again before retrying.");
  return { outcome: "completed", callId: input.callId, disposition, boundedSeconds };
}

export function summarizeReconciliation(candidates: StalledWebVoiceCall[]): {
  total: number;
  unallocatedUnknown: number;
  allocated: number;
} {
  return {
    total: candidates.length,
    unallocatedUnknown: candidates.filter((row) => row.providerKind === "unallocated_unknown").length,
    allocated: candidates.filter((row) => row.providerKind === "allocated").length,
  };
}
