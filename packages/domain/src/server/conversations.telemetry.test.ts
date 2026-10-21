import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordProductEvent: vi.fn(),
  withBusinessTransaction: vi.fn(),
}));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("./productEvents", () => ({ recordProductEvent: mocks.recordProductEvent, recordProductEventBestEffort: mocks.recordProductEvent }));

import { appendMessage, setAutomationState } from "./conversations";

const context = { db: {} as never };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEvent.mockResolvedValue("event_1");
});

describe("automation pause telemetry", () => {
  it("records conversation.automation_paused with the conversation's actual channel", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ channel: "sms", pausedAi: true, waitedMs: null });

    await setAutomationState(context, { userId: "user_1", businessId: "biz_1", conversationId: "conv_1", state: "human_handoff" });

    expect(mocks.recordProductEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "conversation.automation_paused",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      properties: { conversationId: "conv_1", channel: "sms" },
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("does not record conversation.automation_paused when automation is resumed", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ channel: "web_chat", pausedAi: false, waitedMs: 20_000 });

    await setAutomationState(context, { userId: "user_1", businessId: "biz_1", conversationId: "conv_1", state: "ai_active" });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("does not record when the conversation could not be updated", async () => {
    mocks.withBusinessTransaction.mockResolvedValue(null);

    await setAutomationState(context, { userId: "user_1", businessId: "biz_1", conversationId: "conv_1", state: "human_handoff" });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("records conversation.team_joined, and no pause, when a team member joins a visitor who asked for a person", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ channel: "web_chat", pausedAi: false, waitedMs: 42_400 });

    await setAutomationState(context, { userId: "user_1", businessId: "biz_1", conversationId: "conv_1", state: "human_handoff" });

    expect(mocks.recordProductEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "conversation.team_joined",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      properties: { conversationId: "conv_1", channel: "web_chat", waitSeconds: 42 },
    }));
  });
});

describe("a team reply that takes a website chat over", () => {
  const reply = { userId: "user_1", businessId: "biz_1", conversationId: "conv_1", body: "Hi, this is Yuri.", direction: "outbound" as const, channel: "web_chat" as const };

  it("records conversation.automation_paused once the reply is saved", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ messageId: "msg_1", takeOver: { pausedAi: true, waitedMs: null } });

    await expect(appendMessage(context, reply)).resolves.toBe("msg_1");

    expect(mocks.recordProductEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "conversation.automation_paused",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      properties: { conversationId: "conv_1", channel: "web_chat" },
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("records conversation.team_joined when the reply answers a visitor waiting for a person", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ messageId: "msg_3", takeOver: { pausedAi: false, waitedMs: 95_000 } });

    await expect(appendMessage(context, reply)).resolves.toBe("msg_3");

    expect(mocks.recordProductEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "conversation.team_joined",
      properties: { conversationId: "conv_1", channel: "web_chat", waitSeconds: 95 },
    }));
  });

  it("records nothing when a person already had the chat", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ messageId: "msg_2", takeOver: null });

    await expect(appendMessage(context, reply)).resolves.toBe("msg_2");

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});
