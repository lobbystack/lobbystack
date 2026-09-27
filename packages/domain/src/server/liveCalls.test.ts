import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeCall: vi.fn(),
  setTransferState: vi.fn(),
  startCall: vi.fn(),
  upsertTranscript: vi.fn(),
  reserveOutboundCallAttempt: vi.fn(),
  recordUnitEconomicsEvent: vi.fn(),
  enqueueOutbox: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: vi.fn(async (_db: unknown, _context: unknown, callback: (tx: unknown) => unknown) => await callback({})),
  enqueueOutbox: mocks.enqueueOutbox,
}));

vi.mock("./voice", () => ({ completeCall: mocks.completeCall, setTransferState: mocks.setTransferState, startCall: mocks.startCall, upsertTranscript: mocks.upsertTranscript }));
vi.mock("./billing", () => ({ reserveOutboundCallAttempt: mocks.reserveOutboundCallAttempt }));
vi.mock("./unitEconomics", () => ({ recordUnitEconomicsEvent: mocks.recordUnitEconomicsEvent }));
vi.mock("./demos", () => ({ recordProspectDemoCallOutcome: vi.fn() }));

import { finishLiveCall, LIVE_CALL_PROVIDER, prepareLiveCallTransfer, saveLiveCallTurn, startLivePhoneCall } from "./liveCalls";

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
});

describe("finishLiveCall", () => {
  it("completes the call with the billed seconds and records the GPT-Live cost", async () => {
    await finishLiveCall(context, { ...call, seconds: 90, end: "caller_hung_up" });
    expect(mocks.completeCall).toHaveBeenCalledWith(context, expect.objectContaining({ callId: "call_1", status: "completed", disposition: "caller_hung_up", providerDurationSeconds: 90, mediaDurationSeconds: 90, providerCostUsd: expect.closeTo(0.075, 6) }));
    expect(mocks.recordUnitEconomicsEvent).toHaveBeenCalledWith(context, expect.objectContaining({ eventKey: "voice_ai:live_session:call_1", model: "gpt-live-1", costUsd: expect.closeTo(0.075, 6) }));
  });

  it("passes the measured length so an abandoned call isn't billed OpenAI's minimum", async () => {
    await finishLiveCall(context, { ...call, seconds: 15, measuredSeconds: 0.8, end: "caller_finished" });
    expect(mocks.completeCall).toHaveBeenCalledWith(context, expect.objectContaining({ providerDurationSeconds: 15, mediaDurationSeconds: 0.8 }));
  });

  it("queues Twilio pricing for a finished phone call", async () => {
    await finishLiveCall(context, { ...call, seconds: 60, end: "caller_finished", channel: "voice" });
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "call.syncPrice", payload: { callId: "call_1", providerCallStatus: "completed" } }));
  });

  it("doesn't queue Twilio pricing for a browser call", async () => {
    await finishLiveCall(context, { ...call, seconds: 60, end: "caller_finished", channel: "web_voice" });
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });

  it("uses the spam disposition billing already excludes", async () => {
    await finishLiveCall(context, { ...call, seconds: 40, end: "spam" });
    expect(mocks.completeCall).toHaveBeenCalledWith(context, expect.objectContaining({ disposition: "spam_ended" }));
  });

  it("marks transferred calls as transferred", async () => {
    await finishLiveCall(context, { ...call, seconds: 30, end: "transferred" });
    expect(mocks.completeCall).toHaveBeenCalledWith(context, expect.objectContaining({ status: "transferred", disposition: "transferred" }));
  });

  it("records no cost for a call that never connected", async () => {
    await finishLiveCall(context, { ...call, seconds: 0, end: "setup_failed" });
    expect(mocks.completeCall).toHaveBeenCalled();
    expect(mocks.recordUnitEconomicsEvent).not.toHaveBeenCalled();
  });
});

describe("prepareLiveCallTransfer", () => {
  it("reserves a transfer attempt before the call is referred", async () => {
    mocks.reserveOutboundCallAttempt.mockResolvedValue({ allowed: true });
    await expect(prepareLiveCallTransfer(context, call)).resolves.toBe(true);
    expect(mocks.reserveOutboundCallAttempt).toHaveBeenCalledWith(context, { businessId: "biz_1", sourceKey: "outbound_call:call_1" });
    expect(mocks.setTransferState).toHaveBeenLastCalledWith(context, expect.objectContaining({ transferState: "preparing" }));
  });

  it("refuses when the plan has no transfer attempts left", async () => {
    mocks.reserveOutboundCallAttempt.mockResolvedValue({ allowed: false });
    await expect(prepareLiveCallTransfer(context, call)).resolves.toBe(false);
    expect(mocks.setTransferState).toHaveBeenLastCalledWith(context, expect.objectContaining({ transferState: "released" }));
  });
});

describe("saveLiveCallTurn", () => {
  it("skips empty turns", async () => {
    await saveLiveCallTurn(context, { ...call, sequence: 1, speaker: "caller", text: "  " });
    expect(mocks.upsertTranscript).not.toHaveBeenCalled();
  });
});
