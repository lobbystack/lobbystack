import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listStalledWebVoiceCalls: vi.fn(),
  completeReconciledWebVoiceCall: vi.fn(),
  summarizeReconciliation: vi.fn((candidates: Array<{ providerKind: string }>) => ({
    total: candidates.length,
    unallocatedUnknown: candidates.filter((candidate) => candidate.providerKind === "unallocated_unknown").length,
    allocated: candidates.filter((candidate) => candidate.providerKind === "allocated").length,
  })),
}));

vi.mock("../../packages/domain/src/server/voiceRecovery", () => mocks);
vi.mock("@lobbystack/db", () => ({ createDatabaseClient: vi.fn() }));

import { parseVoiceRecoveryArgs, runVoiceRecovery } from "./voice-recovery";

const businessId = "11111111-1111-4111-8111-111111111111";
const callId = "22222222-2222-4222-8222-222222222222";
const db = {} as never;

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    callId,
    businessId,
    providerKind: "allocated",
    status: "started",
    startedAt: new Date().toISOString(),
    ageMs: 90_000,
    reservedSeconds: 300,
    requiredOperatorAction: "verify_provider_then_complete",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.listStalledWebVoiceCalls.mockReset();
  mocks.completeReconciledWebVoiceCall.mockReset();
});

describe("voice recovery arguments", () => {
  it("defaults to a bounded dry-run listing", () => {
    expect(parseVoiceRecoveryArgs(["--business-id", businessId])).toMatchObject({
      businessId, apply: false, olderThanMinutes: 15, limit: 100,
    });
  });

  it("rejects resolution flags without --apply", () => {
    expect(() => parseVoiceRecoveryArgs(["--business-id", businessId, "--call-id", callId])).toThrow();
    expect(() => parseVoiceRecoveryArgs(["--business-id", businessId, "--evidence", "operator-attestation"])).toThrow();
  });

  it("requires a call ID, evidence, and reference to apply", () => {
    expect(() => parseVoiceRecoveryArgs(["--business-id", businessId, "--apply"])).toThrow();
    expect(() => parseVoiceRecoveryArgs(["--business-id", businessId, "--apply", "--call-id", callId])).toThrow();
    expect(() => parseVoiceRecoveryArgs(["--business-id", businessId, "--apply", "--call-id", callId, "--reference", "OPS-1"])).toThrow();
  });

  it("requires a real provider ID and reported seconds for provider-terminal evidence", () => {
    expect(() => parseVoiceRecoveryArgs(["--business-id", businessId, "--apply", "--call-id", callId, "--evidence", "provider-terminal", "--reference", "OPS-1"])).toThrow();
    expect(() => parseVoiceRecoveryArgs(["--business-id", businessId, "--apply", "--call-id", callId, "--evidence", "provider-terminal", "--reference", "OPS-1", "--provider-call-id", "webcall_session", "--provider-duration-seconds", "10"])).toThrow();
    expect(() => parseVoiceRecoveryArgs(["--business-id", businessId, "--apply", "--call-id", callId, "--evidence", "provider-terminal", "--reference", "OPS-1", "--provider-call-id", "rtc_real"])).toThrow();
  });

  it("rejects provider seconds on an operator attestation", () => {
    expect(() => parseVoiceRecoveryArgs(["--business-id", businessId, "--apply", "--call-id", callId, "--evidence", "operator-attestation", "--reference", "OPS-1", "--provider-duration-seconds", "10"])).toThrow();
  });

  it("accepts a fully attested provider-terminal resolution", () => {
    expect(parseVoiceRecoveryArgs(["--business-id", businessId, "--apply", "--call-id", callId, "--evidence", "provider-terminal", "--reference", "OPS-1", "--provider-call-id", "rtc_real", "--provider-duration-seconds", "42"])).toMatchObject({
      apply: true, evidence: "provider-terminal", providerDurationSeconds: 42,
    });
  });
});

describe("voice recovery run", () => {
  it("lists candidates and reports counts without customer PII", async () => {
    mocks.listStalledWebVoiceCalls.mockResolvedValueOnce([
      candidate(),
      candidate({ callId: "33333333-3333-4333-8333-333333333333", providerKind: "unallocated_unknown", requiredOperatorAction: "attest_provider_unconsumed" }),
    ]);
    const report = await runVoiceRecovery(db, { businessId });
    expect(report).toMatchObject({
      mode: "dry-run",
      businessId,
      examined: 2,
      summary: { total: 2, allocated: 1, unallocatedUnknown: 1 },
      pageFull: false,
    });
    const serialized = JSON.stringify(report).toLowerCase();
    for (const forbidden of ["phone", "email", "transcript", "originurl", "useragent", "widgetid", "contactid", "conversationid", "prospectdemo"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(mocks.listStalledWebVoiceCalls).toHaveBeenCalledWith(db, expect.objectContaining({ businessId, olderThanMs: 15 * 60_000, limit: 100 }));
    expect(mocks.completeReconciledWebVoiceCall).not.toHaveBeenCalled();
  });

  it("applies a provider-terminal resolution through the domain helper", async () => {
    mocks.completeReconciledWebVoiceCall.mockResolvedValueOnce({ outcome: "completed", callId, disposition: "reconciled_provider_terminal", boundedSeconds: 42 });
    const report = await runVoiceRecovery(db, {
      businessId, apply: true, callId, evidence: "provider-terminal", reference: "OPS-9", providerCallId: "rtc_real", providerDurationSeconds: 42,
    });
    expect(report).toEqual({ mode: "apply", callId, outcome: "completed", disposition: "reconciled_provider_terminal", boundedSeconds: 42 });
    expect(mocks.completeReconciledWebVoiceCall).toHaveBeenCalledWith(db, {
      businessId, callId,
      evidence: { kind: "provider_terminal", reference: "OPS-9", providerCallId: "rtc_real", providerDurationSeconds: 42 },
      nowMs: expect.any(Number),
    });
  });

  it("surfaces a rejected resolution with its code", async () => {
    mocks.completeReconciledWebVoiceCall.mockResolvedValueOnce({ outcome: "rejected", callId, code: "call_not_settled", message: "too recent" });
    await expect(runVoiceRecovery(db, {
      businessId, apply: true, callId, evidence: "operator-attestation", reference: "OPS-10",
    })).resolves.toEqual({ mode: "apply", callId, outcome: "rejected:call_not_settled" });
  });
});
