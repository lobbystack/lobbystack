import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordProductEvent: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent }));

import { completeCall, recordCallProviderPricing, recordVoiceSnapshotLoaded, setTransferState, startCall } from "./voice";

const context = { db: {} as never };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEvent.mockResolvedValue("event_1");
});

describe("voice call lifecycle telemetry", () => {
  it("records voice.call_started after startCall commits", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", contactId: "contact_1", duplicate: false, blocked: false });

    await startCall(context, { businessId: "biz_1", provider: "twilio", providerCallId: "CA1", from: "+14165550100", to: "+14165550199", transport: "voice" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "voice.call_started",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      properties: expect.objectContaining({ callId: "call_1", channel: "voice", provider: "twilio" }),
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("derives the web channel for browser calls", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ callId: "call_2", conversationId: "conv_1", contactId: "contact_1", duplicate: false, blocked: false });

    await startCall(context, { businessId: "biz_1", provider: "openai_realtime", providerCallId: "web_1", from: "web", to: "acme", transport: "web_voice" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "voice.call_started",
      properties: expect.objectContaining({ callId: "call_2", channel: "web_voice", provider: "openai_realtime" }),
    }));
  });

  it("does not record voice.call_started for a duplicate provider call", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ callId: "call_1", conversationId: "conv_1", contactId: "contact_1", duplicate: true, blocked: false });

    await startCall(context, { businessId: "biz_1", provider: "twilio", providerCallId: "CA1", from: "+14165550100", to: "+14165550199", transport: "voice" });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("records voice.call_completed with final disposition and duration after commit", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ callId: "call_1", transport: "voice", provider: "twilio", disposition: "appointment_request", durationSeconds: 42, providerDurationSeconds: 42, billingExcluded: false });

    await completeCall(context, { businessId: "biz_1", callId: "call_1", status: "completed", endedAt: "2027-01-01T10:00:42Z", disposition: "appointment_request", providerDurationSeconds: 42 });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "voice.call_completed",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      properties: expect.objectContaining({ callId: "call_1", channel: "voice", provider: "twilio", disposition: "appointment_request", durationSeconds: 42, providerDurationSeconds: 42 }),
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("does not record voice.call_completed when the call was not found", async () => {
    mocks.withBusinessTransaction.mockResolvedValue(null);

    await completeCall(context, { businessId: "biz_1", callId: "missing", status: "completed", endedAt: "2027-01-01T10:00:42Z" });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});

describe("voice transfer telemetry", () => {
  it("records voice.transfer_requested for the requested state", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ callId: "call_1", previousTransferState: "none", provider: "twilio", transport: "voice", changed: true });

    await setTransferState(context, { businessId: "biz_1", callId: "call_1", transferState: "requested" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "voice.transfer_requested",
      properties: expect.objectContaining({ callId: "call_1", channel: "voice", provider: "twilio", transferState: "requested", previousTransferState: "none" }),
    }));
  });

  it("records voice.transfer_completed for the completed state", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ callId: "call_1", previousTransferState: "preparing", provider: "twilio", transport: "voice", changed: true });

    await setTransferState(context, { businessId: "biz_1", callId: "call_1", transferState: "completed" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "voice.transfer_completed",
      properties: expect.objectContaining({ transferState: "completed" }),
    }));
  });

  it("records voice.transfer_state_changed for other states", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ callId: "call_1", previousTransferState: "preparing", provider: "twilio", transport: "voice", changed: true });

    await setTransferState(context, { businessId: "biz_1", callId: "call_1", transferState: "failed" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "voice.transfer_state_changed",
      properties: expect.objectContaining({ transferState: "failed" }),
    }));
  });

  it("does not record when the transfer state has not changed", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ callId: "call_1", previousTransferState: "failed", provider: "twilio", transport: "voice", changed: false });

    await setTransferState(context, { businessId: "biz_1", callId: "call_1", transferState: "failed" });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("does not record when the call does not exist", async () => {
    mocks.withBusinessTransaction.mockResolvedValue(null);

    await setTransferState(context, { businessId: "biz_1", callId: "missing", transferState: "requested" });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});

describe("voice provider cost telemetry", () => {
  it("records voice.provider_cost_recorded after the pricing record commits", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ callId: "call_1", provider: "twilio", transport: "voice", providerDurationSeconds: 42 });

    await expect(recordCallProviderPricing(context, { businessId: "biz_1", providerCallId: "CA1", providerPrice: 0.12, providerPriceUnit: "USD", providerCostUsd: 0.12 })).resolves.toBe(true);

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "voice.provider_cost_recorded",
      properties: expect.objectContaining({ callId: "call_1", channel: "voice", provider: "twilio", costUsd: 0.12, providerDurationSeconds: 42 }),
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("does not record a cost event when no provider cost was supplied", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ callId: "call_1", provider: "twilio", transport: "voice", providerDurationSeconds: 42 });

    await expect(recordCallProviderPricing(context, { businessId: "biz_1", providerCallId: "CA1", providerPrice: 0.12, providerPriceUnit: "USD" })).resolves.toBe(true);

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("does not record when the call was not found", async () => {
    mocks.withBusinessTransaction.mockResolvedValue(null);

    await expect(recordCallProviderPricing(context, { businessId: "biz_1", providerCallId: "CA1", providerCostUsd: 0.12 })).resolves.toBe(false);

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});

describe("voice snapshot telemetry", () => {
  it("records voice.snapshot_loaded for a served backend snapshot", async () => {
    await recordVoiceSnapshotLoaded(context, { businessId: "biz_1", channel: "voice", provider: "twilio" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "voice.snapshot_loaded",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      properties: { channel: "voice", provider: "twilio" },
    }));
    expect(mocks.recordProductEvent.mock.calls[0]?.[1]?.properties).not.toHaveProperty("callId");
  });
});
