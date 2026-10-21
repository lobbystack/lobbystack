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

import { expireTeamRequest, requestTeamForWidgetChat } from "./widgetLiveChat";

const context = { db: {} as never };
const chat = { businessId: "biz_1", conversationId: "conv_1" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEvent.mockResolvedValue("event_1");
});

describe("live chat telemetry", () => {
  it("records conversation.team_requested once the team is alerted", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ ok: true, waitMinutes: 3 });

    await expect(requestTeamForWidgetChat(context, { ...chat, locale: "en" })).resolves.toEqual({ ok: true, waitMinutes: 3 });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "conversation.team_requested",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      actorType: "worker",
      properties: { conversationId: "conv_1", channel: "web_chat" },
    }));
    expect(mocks.withBusinessTransaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordProductEvent.mock.invocationCallOrder[0]!);
  });

  it("records no request when the team already has the chat", async () => {
    mocks.withBusinessTransaction.mockResolvedValue({ ok: false, reason: "team_has_chat" });

    await expect(requestTeamForWidgetChat(context, { ...chat, locale: "en" })).resolves.toEqual({ ok: false, reason: "team_has_chat" });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });

  it("records conversation.team_request_expired when the receptionist takes the chat back", async () => {
    mocks.withBusinessTransaction.mockResolvedValue(true);

    await expect(expireTeamRequest(context, { ...chat, requestedAt: new Date(), locale: "fr" })).resolves.toEqual({ expired: true });

    expect(mocks.recordProductEvent).toHaveBeenCalledWith(context, expect.objectContaining({
      name: "conversation.team_request_expired",
      businessId: "biz_1",
      distinctId: "system:business:biz_1",
      actorType: "worker",
      properties: { conversationId: "conv_1", channel: "web_chat" },
    }));
  });

  it("records nothing when someone joined in time", async () => {
    mocks.withBusinessTransaction.mockResolvedValue(false);

    await expect(expireTeamRequest(context, { ...chat, requestedAt: new Date(), locale: "en" })).resolves.toEqual({ expired: false });

    expect(mocks.recordProductEvent).not.toHaveBeenCalled();
  });
});
