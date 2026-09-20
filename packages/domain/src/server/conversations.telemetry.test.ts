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

import { setAutomationState } from "./conversations";

const context = { db: {} as never };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEvent.mockResolvedValue("event_1");
});

describe("automation pause telemetry", () => {
  it("records conversation.automation_paused with the conversation's actual channel", async () => {
    mocks.withBusinessTransaction.mockResolvedValue("sms");

    await setAutomationState(context, { userId: "user_1", businessId: "biz_1", conversationId: "conv_1", state: "human_handoff" });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "conversation.automation_paused",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      properties: { conversationId: "conv_1", channel: "sms" },
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("does not record conversation.automation_paused when automation is resumed", async () => {
    mocks.withBusinessTransaction.mockResolvedValue("sms");

    await setAutomationState(context, { userId: "user_1", businessId: "biz_1", conversationId: "conv_1", state: "ai_active" });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("does not record when the conversation could not be updated", async () => {
    mocks.withBusinessTransaction.mockResolvedValue(null);

    await setAutomationState(context, { userId: "user_1", businessId: "biz_1", conversationId: "conv_1", state: "human_handoff" });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});
