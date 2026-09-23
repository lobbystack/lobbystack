import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeCall: vi.fn(),
  withBusinessTransaction: vi.fn(),
  selectRows: [] as unknown[],
  execute: vi.fn(async () => undefined),
  limit: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@lobbystack/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./voice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./voice")>()),
  completeCall: mocks.completeCall,
}));

import {
  boundedReconciledVoiceSeconds,
  classifyWebVoiceProviderId,
  completeReconciledWebVoiceCall,
  listStalledWebVoiceCalls,
  summarizeReconciliation,
  WEB_VOICE_DEFAULT_CAP_MS,
  WEB_VOICE_RECONCILE_GRACE_MS,
} from "./voiceRecovery";

const businessId = "11111111-1111-4111-8111-111111111111";

function callRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    businessId,
    providerCallId: "rtc_real_call",
    status: "started",
    startedAt: new Date(Date.now() - 60 * 60_000),
    endedAt: null,
    webCallMaxDurationMs: 300_000,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.completeCall.mockReset();
  mocks.withBusinessTransaction.mockReset();
  mocks.selectRows = [];
  for (const method of [mocks.orderBy, mocks.where, mocks.from, mocks.limit, mocks.select] as const) method.mockReset();
  mocks.limit.mockImplementation(async () => mocks.selectRows);
  mocks.orderBy.mockReturnValue({ limit: mocks.limit });
  mocks.where.mockReturnValue({ orderBy: mocks.orderBy, limit: mocks.limit });
  mocks.from.mockReturnValue({ where: mocks.where });
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.withBusinessTransaction.mockImplementation(async (_db, _context, callback) =>
    callback({ execute: mocks.execute, select: mocks.select }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("web voice provider classification", () => {
  it("distinguishes the gateway placeholder from a real provider ID", () => {
    expect(classifyWebVoiceProviderId("webcall_2f0a5c4b")).toBe("unallocated_unknown");
    expect(classifyWebVoiceProviderId("webcall_")).toBe("unallocated_unknown");
    expect(classifyWebVoiceProviderId("rtc_abc123")).toBe("allocated");
  });
});

describe("bounded reconciled seconds", () => {
  it("refuses to derive a duration from elapsed time alone", () => {
    expect(boundedReconciledVoiceSeconds({ reservedSeconds: 300 })).toBeNull();
    expect(boundedReconciledVoiceSeconds({ reservedSeconds: 300, providerDurationSeconds: null, mediaDurationSeconds: null })).toBeNull();
    expect(boundedReconciledVoiceSeconds({ reservedSeconds: 300, providerDurationSeconds: -5 })).toBeNull();
  });

  it("bounds reported consumption by the reservation and never under-bills below it", () => {
    expect(boundedReconciledVoiceSeconds({ reservedSeconds: 300, providerDurationSeconds: 42 })).toBe(42);
    expect(boundedReconciledVoiceSeconds({ reservedSeconds: 300, providerDurationSeconds: 999 })).toBe(300);
    expect(boundedReconciledVoiceSeconds({ reservedSeconds: 300, mediaDurationSeconds: 5 })).toBe(5);
    expect(boundedReconciledVoiceSeconds({ reservedSeconds: 300, providerDurationSeconds: 42, mediaDurationSeconds: 7 })).toBe(42);
    expect(boundedReconciledVoiceSeconds({ reservedSeconds: 300, providerDurationSeconds: 0 })).toBe(0);
    expect(boundedReconciledVoiceSeconds({ reservedSeconds: 300, providerDurationSeconds: 120, mediaDurationSeconds: 400 })).toBe(300);
  });
});

describe("listStalledWebVoiceCalls", () => {
  it("returns only reconciliation-safe fields and a bounded page", async () => {
    mocks.selectRows = [callRow()];
    const result = await listStalledWebVoiceCalls({} as never, { businessId, olderThanMs: 60_000, limit: 10, nowMs: 1_800_000_000_000 });
    expect(result).toHaveLength(1);
    expect(Object.keys(result[0]!).sort()).toEqual([
      "ageMs", "businessId", "callId", "providerKind", "requiredOperatorAction", "reservedSeconds", "startedAt", "status",
    ]);
    expect(result[0]).toMatchObject({ providerKind: "allocated", reservedSeconds: 300, requiredOperatorAction: "verify_provider_then_complete" });
    // Bounded read must always constrain time and lock acquisition.
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.limit).toHaveBeenCalledWith(10);
  });

  it("falls back to the default cap and clamps the page size to the batch maximum", async () => {
    mocks.selectRows = [callRow({ providerCallId: "webcall_session", webCallMaxDurationMs: null })];
    const result = await listStalledWebVoiceCalls({} as never, { businessId, olderThanMs: 0, limit: 10_000, nowMs: Date.now() });
    expect(result[0]!.reservedSeconds).toBe(Math.floor(WEB_VOICE_DEFAULT_CAP_MS / 1_000));
    expect(result[0]!.requiredOperatorAction).toBe("attest_provider_unconsumed");
    expect(mocks.limit).toHaveBeenCalledWith(200);
  });
});

describe("completeReconciledWebVoiceCall", () => {
  it("rejects an unknown call without touching completion", async () => {
    mocks.selectRows = [];
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: "does-not-exist", evidence: { kind: "operator_attestation", reference: "OPS-1" },
    })).resolves.toEqual({ outcome: "not_found", callId: "does-not-exist" });
    expect(mocks.completeCall).not.toHaveBeenCalled();
  });

  it("treats an already-ended call as finalized instead of double-billing", async () => {
    mocks.selectRows = [callRow({ endedAt: new Date() })];
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string, evidence: { kind: "operator_attestation", reference: "OPS-2" },
    })).resolves.toEqual({ outcome: "already_finalized", callId: callRow().id });
    expect(mocks.completeCall).not.toHaveBeenCalled();
  });

  it("refuses a call whose status is not reconcilable", async () => {
    mocks.selectRows = [callRow({ status: "blocked" })];
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string,
      evidence: { kind: "provider_terminal", reference: "OPS-2b", providerCallId: "rtc_real_call", providerDurationSeconds: 30 },
    })).resolves.toMatchObject({ outcome: "rejected", code: "call_not_reconcilable" });
    expect(mocks.completeCall).not.toHaveBeenCalled();
  });

  it("requires a reference before any persistence", async () => {
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string, evidence: { kind: "operator_attestation", reference: "   " },
    })).resolves.toMatchObject({ outcome: "rejected", code: "reconciliation_reference_required" });
    expect(mocks.withBusinessTransaction).not.toHaveBeenCalled();
  });

  it("refuses provider-terminal claims when the durable row has no real provider ID", async () => {
    mocks.selectRows = [callRow({ providerCallId: "webcall_session" })];
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string,
      evidence: { kind: "provider_terminal", reference: "OPS-3", providerCallId: "rtc_real_call", providerDurationSeconds: 30 },
    })).resolves.toMatchObject({ outcome: "rejected", code: "provider_id_unavailable" });
    expect(mocks.completeCall).not.toHaveBeenCalled();
  });

  it("refuses a provider ID that does not match the durable row", async () => {
    mocks.selectRows = [callRow()];
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string,
      evidence: { kind: "provider_terminal", reference: "OPS-4", providerCallId: "rtc_other", providerDurationSeconds: 30 },
    })).resolves.toMatchObject({ outcome: "rejected", code: "provider_id_mismatch" });
    expect(mocks.completeCall).not.toHaveBeenCalled();
  });

  it("refuses a terminal call that has no reported provider seconds", async () => {
    mocks.selectRows = [callRow()];
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string,
      evidence: { kind: "provider_terminal", reference: "OPS-5", providerCallId: "rtc_real_call" },
    })).resolves.toMatchObject({ outcome: "rejected", code: "provider_duration_unknown" });
    expect(mocks.completeCall).not.toHaveBeenCalled();
  });

  it("refuses a call that is too recent to reconcile", async () => {
    mocks.selectRows = [callRow({ startedAt: new Date() })];
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string,
      evidence: { kind: "provider_terminal", reference: "OPS-6", providerCallId: "rtc_real_call", providerDurationSeconds: 30 },
    })).resolves.toMatchObject({ outcome: "rejected", code: "call_not_settled" });
    expect(mocks.completeCall).not.toHaveBeenCalled();
  });

  it("waits out the reservation window plus grace before provider-terminal recovery", async () => {
    // A 30-minute cap means a live gateway could still own the session at 20 minutes.
    mocks.selectRows = [callRow({ webCallMaxDurationMs: 1_800_000, startedAt: new Date(Date.now() - 20 * 60_000) })];
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string,
      evidence: { kind: "provider_terminal", reference: "OPS-6b", providerCallId: "rtc_real_call", providerDurationSeconds: 60 },
    })).resolves.toMatchObject({ outcome: "rejected", code: "call_not_settled" });
    expect(mocks.completeCall).not.toHaveBeenCalled();
  });

  it("completes a terminal call with provider-reported seconds bounded by the reservation", async () => {
    mocks.selectRows = [callRow()];
    mocks.completeCall.mockResolvedValueOnce(true);
    const result = await completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string,
      evidence: { kind: "provider_terminal", reference: "OPS-7", providerCallId: "rtc_real_call", providerDurationSeconds: 900 },
    });
    expect(result).toEqual({ outcome: "completed", callId: callRow().id, disposition: "reconciled_provider_terminal", boundedSeconds: 300 });
    expect(mocks.completeCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      callId: callRow().id,
      status: "completed",
      disposition: "reconciled_provider_terminal",
      // Elapsed time (an hour) must never leak into the billed duration.
      providerDurationSeconds: 300,
      mediaDurationSeconds: 300,
      // The binding is revalidated inside the finalizing write.
      expectedProviderCallId: "rtc_real_call",
    }));
  });

  it("refuses an operator attestation on a real provider call", async () => {
    mocks.selectRows = [callRow()];
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string, evidence: { kind: "operator_attestation", reference: "OPS-8" },
    })).resolves.toMatchObject({ outcome: "rejected", code: "provider_id_known" });
    expect(mocks.completeCall).not.toHaveBeenCalled();
  });

  it("refuses an operator attestation before the reservation window plus grace has passed", async () => {
    mocks.selectRows = [callRow({ providerCallId: "webcall_session", startedAt: new Date(Date.now() - 60_000) })];
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string, evidence: { kind: "operator_attestation", reference: "OPS-9" },
    })).resolves.toMatchObject({ outcome: "rejected", code: "call_not_settled" });
    expect(mocks.completeCall).not.toHaveBeenCalled();
  });

  it("releases a placeholder reservation only on explicit operator attestation", async () => {
    mocks.selectRows = [callRow({ providerCallId: "webcall_session", startedAt: new Date(Date.now() - (300 * 1_000 + WEB_VOICE_RECONCILE_GRACE_MS + 60_000)) })];
    mocks.completeCall.mockResolvedValueOnce(true);
    const result = await completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string, evidence: { kind: "operator_attestation", reference: "OPS-10" },
    });
    expect(result).toEqual({ outcome: "completed", callId: callRow().id, disposition: "reconciled_unconsumed_attested", boundedSeconds: 0 });
    expect(mocks.completeCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: "failed",
      disposition: "reconciled_unconsumed_attested",
      providerDurationSeconds: 0,
      mediaDurationSeconds: 0,
      expectedProviderCallId: "webcall_session",
    }));
  });

  it("reports a lost completion or binding race without claiming finalization", async () => {
    mocks.selectRows = [callRow()];
    mocks.completeCall.mockResolvedValueOnce(false);
    await expect(completeReconciledWebVoiceCall({} as never, {
      businessId, callId: callRow().id as string,
      evidence: { kind: "provider_terminal", reference: "OPS-11", providerCallId: "rtc_real_call", providerDurationSeconds: 10 },
    })).resolves.toMatchObject({ outcome: "rejected", callId: callRow().id, code: "completion_conflict" });
  });
});

describe("summarizeReconciliation", () => {
  it("counts candidates by provider kind", () => {
    const base = { businessId, status: "started", startedAt: new Date().toISOString(), ageMs: 1, reservedSeconds: 300, requiredOperatorAction: "attest_provider_unconsumed" as const };
    expect(summarizeReconciliation([
      { ...base, callId: "a", providerKind: "unallocated_unknown" },
      { ...base, callId: "b", providerKind: "allocated", requiredOperatorAction: "verify_provider_then_complete" },
      { ...base, callId: "c", providerKind: "allocated", requiredOperatorAction: "verify_provider_then_complete" },
    ])).toEqual({ total: 3, unallocatedUnknown: 1, allocated: 2 });
  });
});
