import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeCall: vi.fn(),
  setTransferState: vi.fn(),
  startCall: vi.fn(),
  upsertTranscript: vi.fn(),
  reserveOutboundCallAttempt: vi.fn(),
  releaseCallTexts: vi.fn(),
  trialTransferNumber: vi.fn(),
}));

vi.mock("./voice", () => ({ completeCall: mocks.completeCall, setTransferState: mocks.setTransferState, startCall: mocks.startCall, upsertTranscript: mocks.upsertTranscript }));
vi.mock("./billing", () => ({ reserveOutboundCallAttempt: mocks.reserveOutboundCallAttempt }));
vi.mock("./demos", () => ({ recordProspectDemoCallOutcome: vi.fn() }));
vi.mock("./notifications", () => ({ releaseCallTexts: mocks.releaseCallTexts }));
vi.mock("./numberTrials", () => ({ trialTransferNumber: mocks.trialTransferNumber }));

import { finishLiveCall, LIVE_CALL_PROVIDER, liveCallRecordingJob, orphanedLiveCallSeconds, prepareLiveCallTransfer, recordLiveCallTransferResult, saveLiveCallTurn, startLivePhoneCall } from "./liveCalls";

const context = { db: {} as never };
const call = { businessId: "biz_1", callId: "call_1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.completeCall.mockResolvedValue(true);
});

describe("startLivePhoneCall", () => {
  it("records the call against the OpenAI session so retries stay idempotent", async () => {
    mocks.startCall.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", contactId: "contact_1", duplicate: false, blocked: false });
    await expect(startLivePhoneCall(context, { businessId: "biz_1", sessionId: "live_1", from: "+14165550100", to: "+15815020392" })).resolves.toMatchObject({ callId: "call_1", blocked: false });
    expect(mocks.startCall).toHaveBeenCalledWith(context, expect.objectContaining({ provider: LIVE_CALL_PROVIDER, providerCallId: "live_1", transport: "voice" }));
  });

  it("limits the call to its reservation, and not at all on an unlimited plan", async () => {
    mocks.startCall.mockResolvedValueOnce({ callId: "call_1", conversationId: "conv_1", contactId: "contact_1", duplicate: false, blocked: false, reservedSeconds: 500 });
    await expect(startLivePhoneCall(context, { businessId: "biz_1", sessionId: "live_1", to: "+15815020392" })).resolves.toMatchObject({ maxDurationMs: 500_000 });
    // A reservation made before calls were bounded still stops at the longest call.
    mocks.startCall.mockResolvedValueOnce({ callId: "call_1", conversationId: "conv_1", contactId: "contact_1", duplicate: true, blocked: false, reservedSeconds: 9_300 });
    await expect(startLivePhoneCall(context, { businessId: "biz_1", sessionId: "live_1", to: "+15815020392" })).resolves.toMatchObject({ maxDurationMs: 1_800_000 });
    mocks.startCall.mockResolvedValueOnce({ callId: "call_1", conversationId: "conv_1", contactId: "contact_1", duplicate: false, blocked: false });
    await expect(startLivePhoneCall(context, { businessId: "biz_1", sessionId: "live_1", to: "+15815020392" })).resolves.toMatchObject({ maxDurationMs: undefined });
  });
});

describe("finishLiveCall", () => {
  // What the write that finalizes the call is asked to write with it.
  const finalizing = () => mocks.completeCall.mock.lastCall![1] as { outbox: Array<{ topic: string; dedupeKey: string; payload: unknown; availableAt?: Date }>; costEvent?: Record<string, unknown> };

  it("completes the call with the billed seconds and records the GPT-Live cost in the same write", async () => {
    await finishLiveCall(context, { ...call, seconds: 90, end: "caller_hung_up" });
    expect(mocks.completeCall).toHaveBeenCalledWith(context, expect.objectContaining({ callId: "call_1", status: "completed", disposition: "caller_hung_up", providerDurationSeconds: 90, mediaDurationSeconds: 90, providerCostUsd: expect.closeTo(0.075, 6) }));
    expect(finalizing().costEvent).toMatchObject({ eventKey: "voice_ai:live_session:call_1", channel: "voice", model: "gpt-live-1", operation: "live_session", quantity: 90, costUsd: expect.closeTo(0.075, 6) });
    // Texts held while the call ran go out once it's over.
    expect(mocks.releaseCallTexts).toHaveBeenCalledWith(context, { businessId: call.businessId, callId: "call_1" });
  });

  it("passes the measured length so an abandoned call isn't billed OpenAI's minimum", async () => {
    await finishLiveCall(context, { ...call, seconds: 15, measuredSeconds: 0.8, end: "caller_finished" });
    expect(mocks.completeCall).toHaveBeenCalledWith(context, expect.objectContaining({ providerDurationSeconds: 15, mediaDurationSeconds: 0.8 }));
  });

  it("queues Twilio pricing for a finished phone call", async () => {
    await finishLiveCall(context, { ...call, seconds: 60, end: "caller_finished", channel: "voice" });
    expect(finalizing().outbox).toEqual([expect.objectContaining({ topic: "call.syncPrice", dedupeKey: "call:call_1:live-price", payload: { callId: "call_1", providerCallStatus: "completed" } })]);
  });

  it("doesn't queue Twilio pricing for a browser call", async () => {
    await finishLiveCall(context, { ...call, seconds: 60, end: "caller_finished", channel: "web_voice" });
    expect(finalizing().outbox).toEqual([]);
    expect(finalizing().costEvent).toMatchObject({ channel: "web_voice" });
  });

  it("writes the cost and the price job once when the finish fails after the call was finalized and is retried", async () => {
    // Like Postgres: only the write that finalizes the call commits what it carries.
    const committed: unknown[] = [];
    let finalized = false;
    mocks.completeCall.mockImplementation(async (_context: unknown, input: { outbox?: unknown[]; costEvent?: unknown }) => {
      if (finalized) return false;
      finalized = true;
      committed.push(...(input.outbox ?? []), ...(input.costEvent ? [input.costEvent] : []));
      return true;
    });
    mocks.releaseCallTexts.mockRejectedValueOnce(new Error("timeout exceeded when trying to connect"));
    const finish = () => finishLiveCall(context, { ...call, seconds: 60, end: "caller_finished", channel: "voice" });
    await expect(finish()).rejects.toThrow("timeout exceeded");
    await expect(finish()).resolves.toBe(false);
    expect(committed).toEqual([expect.objectContaining({ topic: "call.syncPrice" }), expect.objectContaining({ eventKey: "voice_ai:live_session:call_1" })]);
  });

  it("uses the spam disposition billing already excludes", async () => {
    await finishLiveCall(context, { ...call, seconds: 40, end: "spam" });
    expect(mocks.completeCall).toHaveBeenCalledWith(context, expect.objectContaining({ disposition: "spam_ended" }));
  });

  it("marks transferred calls as transferred", async () => {
    await finishLiveCall(context, { ...call, seconds: 30, end: "transferred" });
    expect(mocks.completeCall).toHaveBeenCalledWith(context, expect.objectContaining({ status: "transferred", disposition: "transferred" }));
  });

  it("records a call the worker's shutdown ended as service_restart", async () => {
    await finishLiveCall(context, { ...call, seconds: 120, end: "service_restart" });
    expect(mocks.completeCall).toHaveBeenCalledWith(context, expect.objectContaining({ status: "completed", disposition: "service_restart", providerDurationSeconds: 120 }));
  });

  it("queues the recording copy in the write that finalizes the call", async () => {
    await finishLiveCall(context, { ...call, seconds: 90, end: "caller_hung_up", channel: "web_voice", recording: { sessionId: "live_1" } });
    const { outbox } = finalizing();
    expect(outbox).toEqual([expect.objectContaining({ topic: "call.saveRecording", dedupeKey: "call:call_1:recording:1", payload: { callId: "call_1", sessionId: "live_1", attempt: 1 } })]);
    expect(outbox[0]!.availableAt!.getTime() - Date.now()).toBeGreaterThan(4_000);
  });

  it("records no cost and queues no price for a call that never connected", async () => {
    await finishLiveCall(context, { ...call, seconds: 0, end: "setup_failed" });
    expect(finalizing().outbox).toEqual([]);
    expect(finalizing()).not.toHaveProperty("costEvent");
  });
});

describe("prepareLiveCallTransfer", () => {
  const transfer = { ...call, destination: "+14165550199" };

  it("reserves a transfer attempt before the call is referred", async () => {
    mocks.reserveOutboundCallAttempt.mockResolvedValue({ allowed: true });
    await expect(prepareLiveCallTransfer(context, transfer)).resolves.toBe(true);
    expect(mocks.reserveOutboundCallAttempt).toHaveBeenCalledWith(context, { businessId: "biz_1", sourceKey: "outbound_call:call_1" });
    expect(mocks.setTransferState).toHaveBeenLastCalledWith(context, expect.objectContaining({ transferState: "preparing" }));
  });

  it("refuses when the plan has no transfer attempts left", async () => {
    mocks.reserveOutboundCallAttempt.mockResolvedValue({ allowed: false });
    await expect(prepareLiveCallTransfer(context, transfer)).resolves.toBe(false);
    expect(mocks.setTransferState).toHaveBeenLastCalledWith(context, expect.objectContaining({ transferState: "released" }));
  });

  it("during a free number trial, dials only the owner's verified phone, so never an employee's number", async () => {
    mocks.reserveOutboundCallAttempt.mockResolvedValue({ allowed: true });
    mocks.trialTransferNumber.mockResolvedValue("+14165550100");
    await expect(prepareLiveCallTransfer(context, transfer)).resolves.toBe(false);
    expect(mocks.trialTransferNumber).toHaveBeenCalledWith(context, transfer);
    // Refused before an attempt is used or the transfer state changes.
    expect(mocks.reserveOutboundCallAttempt).not.toHaveBeenCalled();
    expect(mocks.setTransferState).not.toHaveBeenCalled();
    await expect(prepareLiveCallTransfer(context, { ...call, destination: "+14165550100" })).resolves.toBe(true);
  });
});

describe("recordLiveCallTransferResult", () => {
  it("records an accepted REFER as referred, not completed", async () => {
    await recordLiveCallTransferResult(context, { ...call, state: "referred" });
    expect(mocks.setTransferState).toHaveBeenLastCalledWith(context, { ...call, transferState: "referred" });
    await recordLiveCallTransferResult(context, { ...call, state: "completed" });
    expect(mocks.setTransferState).toHaveBeenLastCalledWith(context, { ...call, transferState: "completed" });
  });
});

describe("saveLiveCallTurn", () => {
  it("skips empty turns", async () => {
    await saveLiveCallTurn(context, { ...call, sequence: 1, speaker: "caller", text: "  " });
    expect(mocks.upsertTranscript).not.toHaveBeenCalled();
  });
});

describe("liveCallRecordingJob", () => {
  it("waits twice as long before each later attempt", () => {
    const delays = [1, 2, 6].map((attempt) => Math.round((liveCallRecordingJob({ ...call, sessionId: "live_1", attempt }).availableAt!.getTime() - Date.now()) / 1_000));
    expect(delays).toEqual([5, 10, 160]);
  });
});

describe("orphanedLiveCallSeconds", () => {
  const startedAt = new Date("2026-10-07T10:00:00Z");
  it("runs from the start to the latest sign of activity", () => {
    expect(orphanedLiveCallSeconds({ startedAt, lastActivityAt: new Date("2026-10-07T10:01:20Z"), reservedSeconds: 600 })).toBe(80);
    expect(orphanedLiveCallSeconds({ startedAt, lastActivityAt: startedAt, reservedSeconds: 600 })).toBe(0);
  });

  it("never bills more than the call reserved", () => {
    expect(orphanedLiveCallSeconds({ startedAt, lastActivityAt: new Date("2026-10-07T10:12:00Z"), reservedSeconds: 600 })).toBe(600);
  });
});
