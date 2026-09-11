import { describe, expect, it, vi } from "vitest";

const recordUnitEconomicsEvent = vi.hoisted(() => vi.fn());

vi.mock("@lobbystack/domain", () => ({ recordUnitEconomicsEvent }));

import { recordVoiceAiCostLedger } from "./voice-ai-cost";

describe("recordVoiceAiCostLedger", () => {
  it("persists voice AI cost with a stable event key without creating analytics events", async () => {
    await recordVoiceAiCostLedger({ db: {} } as never, {
      businessId: "business_123",
      eventKey: "voice_ai:response:call_123:response_123",
      costUsd: 0.012345,
      occurredAt: "2026-09-09T12:00:00.000Z",
      provider: "openai",
      model: "gpt-realtime",
      operation: "voice.response_generation",
      callId: "call_123",
      conversationId: "conversation_123",
    });

    expect(recordUnitEconomicsEvent).toHaveBeenCalledWith(expect.anything(), {
      businessId: "business_123",
      eventKey: "voice_ai:response:call_123:response_123",
      eventKind: "voice_ai",
      channel: "voice",
      costUsd: 0.012345,
      occurredAt: new Date("2026-09-09T12:00:00.000Z"),
      quantity: 1,
      quantityUnit: "generation",
      provider: "openai",
      model: "gpt-realtime",
      operation: "voice.response_generation",
      callId: "call_123",
      conversationId: "conversation_123",
    });
  });
});
