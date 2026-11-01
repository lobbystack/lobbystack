import { describe, expect, it, vi, beforeEach } from "vitest";
import { DASHBOARD_TEST_CALL_WIDGET_ID, PROSPECT_DEMO_WIDGET_ID, WIDGET_VOICE_ID } from "@lobbystack/shared";

const mocks = vi.hoisted(() => ({ recordProductEventInTransaction: vi.fn() }));
vi.mock("./productEvents", () => ({ recordProductEventInTransaction: mocks.recordProductEventInTransaction }));

import { isRealCallCandidate, recordFirstRealCallInTransaction, recordFirstRealChatInTransaction } from "./firstRealConversation";

const phoneCall = { transport: "voice", widgetId: null, prospectDemoId: null, mediaStartedAt: new Date(), disposition: "caller_finished", status: "completed" };

describe("isRealCallCandidate", () => {
  it.each([
    ["a phone call that connected", phoneCall],
    ["a transferred call", { ...phoneCall, status: "transferred", disposition: "transferred" }],
    ["a call through the website widget", { ...phoneCall, transport: "web_voice", widgetId: WIDGET_VOICE_ID }],
  ])("accepts %s", (_name, call) => {
    expect(isRealCallCandidate(call)).toBe(true);
  });

  it.each([
    ["the operator's test call", { ...phoneCall, transport: "web_voice", widgetId: DASHBOARD_TEST_CALL_WIDGET_ID }],
    ["a prospect demo widget call", { ...phoneCall, transport: "web_voice", widgetId: PROSPECT_DEMO_WIDGET_ID }],
    ["the landing page's demo call", { ...phoneCall, transport: "web_voice", widgetId: "lobbystack-landing" }],
    ["a prospect demo", { ...phoneCall, prospectDemoId: "demo_1" }],
    ["a call that never connected", { ...phoneCall, mediaStartedAt: null }],
    ["spam", { ...phoneCall, disposition: "spam_ended" }],
    ["a call that failed to set up", { ...phoneCall, disposition: "setup_failed" }],
    ["a blocked caller", { ...phoneCall, status: "blocked", disposition: "blocked_contact" }],
    ["a failed call", { ...phoneCall, status: "failed" }],
  ])("refuses %s", (_name, call) => {
    expect(isRealCallCandidate(call)).toBe(false);
  });
});

/** Answers each select in turn, and the facts function, the way the production queries read them. */
function fakeTx(input: { selects: unknown[][]; facts?: { owner_user_id: string | null; team_phone: boolean }; claimed?: boolean }) {
  const selects = [...input.selects];
  const chain = { from: () => chain, where: () => chain, limit: async () => selects.shift() ?? [] };
  const insert = vi.fn(() => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => input.claimed === false ? [] : [{ businessId: "biz_1" }] }) }) }));
  const tx = { select: () => chain, insert, execute: async () => ({ rows: [input.facts ?? { owner_user_id: "owner_1", team_phone: false }] }) };
  return { tx: tx as never, insert };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordProductEventInTransaction.mockResolvedValue("event_1");
});

const endedCall = { ...phoneCall, id: "call_1", conversationId: "conv_1", contactId: "contact_1" };

describe("recordFirstRealCallInTransaction", () => {
  it.each([
    ["voice", endedCall],
    ["web_voice", { ...endedCall, transport: "web_voice", widgetId: WIDGET_VOICE_ID }],
  ])("records the %s channel on the owner", async (channel, call) => {
    const { tx } = fakeTx({ selects: [[], [{ id: "turn_1" }], [{ phone: "+14165550133" }]] });

    await recordFirstRealCallInTransaction(tx, { businessId: "biz_1", call });

    expect(mocks.recordProductEventInTransaction).toHaveBeenCalledWith(tx, {
      name: "conversation.first_real_recorded",
      businessId: "biz_1",
      distinctId: "user:owner_1",
      properties: { channel, conversationId: "conv_1" },
    });
  });

  it("falls back to the business's system person when it has no owner", async () => {
    const { tx } = fakeTx({ selects: [[], [{ id: "turn_1" }], [{ phone: null }]], facts: { owner_user_id: null, team_phone: false } });

    await recordFirstRealCallInTransaction(tx, { businessId: "biz_1", call: endedCall });

    expect(mocks.recordProductEventInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ distinctId: "system:business:biz_1" }));
  });

  it("skips a call from a team member's verified phone", async () => {
    const { tx, insert } = fakeTx({ selects: [[], [{ id: "turn_1" }], [{ phone: "+14165550111" }]], facts: { owner_user_id: "owner_1", team_phone: true } });

    await recordFirstRealCallInTransaction(tx, { businessId: "biz_1", call: endedCall });

    expect(insert).not.toHaveBeenCalled();
    expect(mocks.recordProductEventInTransaction).not.toHaveBeenCalled();
  });

  it("skips a caller who never spoke", async () => {
    const { tx, insert } = fakeTx({ selects: [[], []] });

    await recordFirstRealCallInTransaction(tx, { businessId: "biz_1", call: endedCall });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips a business that already has its first real conversation", async () => {
    const { tx, insert } = fakeTx({ selects: [[{ businessId: "biz_1" }]] });

    await recordFirstRealCallInTransaction(tx, { businessId: "biz_1", call: endedCall });

    expect(insert).not.toHaveBeenCalled();
  });

  it("sends nothing when another conversation claimed the row first", async () => {
    const { tx } = fakeTx({ selects: [[], [{ id: "turn_1" }], [{ phone: null }]], claimed: false });

    await recordFirstRealCallInTransaction(tx, { businessId: "biz_1", call: endedCall });

    expect(mocks.recordProductEventInTransaction).not.toHaveBeenCalled();
  });
});

describe("recordFirstRealChatInTransaction", () => {
  it.each(["web_chat", "instagram", "sms"])("records the %s channel once a customer wrote", async (channel) => {
    const { tx } = fakeTx({ selects: [[], [{ channel, contactId: null }], [{ id: "message_1" }]] });

    await recordFirstRealChatInTransaction(tx, { businessId: "biz_1", conversationId: "conv_1" });

    expect(mocks.recordProductEventInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ properties: { channel, conversationId: "conv_1" } }));
  });

  it("skips a reply on a call's conversation", async () => {
    const { tx, insert } = fakeTx({ selects: [[], [{ channel: "voice", contactId: "contact_1" }]] });

    await recordFirstRealChatInTransaction(tx, { businessId: "biz_1", conversationId: "conv_1" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips a message no customer prompted", async () => {
    const { tx, insert } = fakeTx({ selects: [[], [{ channel: "sms", contactId: "contact_1" }], []] });

    await recordFirstRealChatInTransaction(tx, { businessId: "biz_1", conversationId: "conv_1" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("skips a text from a team member's verified phone", async () => {
    const { tx, insert } = fakeTx({ selects: [[], [{ channel: "sms", contactId: "contact_1" }], [{ id: "message_1" }], [{ phone: "+14165550111" }]], facts: { owner_user_id: "owner_1", team_phone: true } });

    await recordFirstRealChatInTransaction(tx, { businessId: "biz_1", conversationId: "conv_1" });

    expect(insert).not.toHaveBeenCalled();
  });
});
