import { demoSnapshot, type BusinessContextSnapshot } from "@lobbystack/shared";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/domain", async () => ({
  countKnowledgeTokens: (await import("../../domain/src/knowledgeRanking")).countKnowledgeTokens,
  KNOWLEDGE_SEARCH_TOKEN_BUDGET: 3000,
  knowledgeQueryTerms: (await import("../../domain/src/knowledgeRanking")).knowledgeQueryTerms,
  requestTeamForWidgetChat: vi.fn(),
}));

import { requestTeamForWidgetChat } from "@lobbystack/domain";
import { createReceptionistTools, type AgentToolContext } from "./tools";

type Execute = (input: object, options: object) => Promise<Record<string, unknown>>;

const onTeamRequested = vi.fn();
const liveChat = { locale: "fr" as const, onTeamRequested };
const chat = { domain: { db: {} as never }, channel: "web_chat" as const, conversationId: "conv_1", snapshot: demoSnapshot };

function requestTeamMember(context: AgentToolContext, input: object = {}) {
  return (createReceptionistTools(context).requestTeamMember!.execute! as Execute)(input, { toolCallId: "1", messages: [] });
}

const withHours = (hours: BusinessContextSnapshot["hours"]): AgentToolContext => ({ ...chat, liveChat, snapshot: { ...demoSnapshot, hours } });

beforeEach(() => {
  vi.clearAllMocks();
  // A Thursday at 10:00 in Toronto, when the demo business is open.
  vi.setSystemTime(new Date("2026-10-01T14:00:00Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

describe("requestTeamMember", () => {
  it("is offered only on a website chat whose widget has live chat on", () => {
    const noChatYet = { domain: chat.domain, channel: chat.channel, snapshot: chat.snapshot };
    const offered = (context: AgentToolContext) => "requestTeamMember" in createReceptionistTools(context);
    expect(offered({ ...chat, liveChat })).toBe(true);
    expect(offered(chat)).toBe(false);
    expect(offered({ ...noChatYet, liveChat })).toBe(false);
    expect(offered({ ...chat, liveChat, intakeOnly: true })).toBe(false);
    expect(offered({ ...chat, liveChat, channel: "web_voice" })).toBe(false);
    expect(offered({ ...chat, liveChat, channel: "voice" })).toBe(false);
  });

  it("asks the team to join during opening hours, with what the visitor needs", async () => {
    vi.mocked(requestTeamForWidgetChat).mockResolvedValue({ ok: true, waitMinutes: 3 });

    const result = await requestTeamMember({ ...chat, liveChat }, { reason: "A question about an invoice" });

    expect(result).toEqual({ ok: true, status: "The team was alerted. Someone should join this chat within 3 minutes. If nobody does, the chat comes back to you and the visitor is asked for a name and number for a callback." });
    expect(requestTeamForWidgetChat).toHaveBeenCalledWith(chat.domain, { businessId: demoSnapshot.businessId, conversationId: "conv_1", locale: "fr", reason: "A question about an invoice" });
    expect(onTeamRequested).toHaveBeenCalledTimes(1);
  });

  it("alerts nobody outside opening hours", async () => {
    // Thursday at 18:00 in Toronto, after closing.
    vi.setSystemTime(new Date("2026-10-01T22:00:00Z"));

    await expect(requestTeamMember({ ...chat, liveChat })).resolves.toEqual({ ok: false, reason: "It's outside opening hours, so nobody from the team can join the chat now." });
    // A closure counts as closed too.
    vi.setSystemTime(new Date("2026-10-01T14:00:00Z"));
    await expect(requestTeamMember({ ...chat, liveChat, snapshot: { ...demoSnapshot, closures: [{ startsAt: "2026-10-01T13:00:00Z", endsAt: "2026-10-02T13:00:00Z", reason: "Closed" }] } })).resolves.toMatchObject({ ok: false });

    expect(requestTeamForWidgetChat).not.toHaveBeenCalled();
    expect(onTeamRequested).not.toHaveBeenCalled();
  });

  it("can ask the team at any time when the business has set no opening hours", async () => {
    vi.setSystemTime(new Date("2026-10-01T22:00:00Z"));
    vi.mocked(requestTeamForWidgetChat).mockResolvedValue({ ok: true, waitMinutes: 3 });

    await expect(requestTeamMember(withHours([]))).resolves.toMatchObject({ ok: true });
    expect(requestTeamForWidgetChat).toHaveBeenCalledWith(chat.domain, { businessId: demoSnapshot.businessId, conversationId: "conv_1", locale: "fr" });
  });

  it("says so when the team already has the chat", async () => {
    vi.mocked(requestTeamForWidgetChat).mockResolvedValue({ ok: false, reason: "team_has_chat" });

    await expect(requestTeamMember({ ...chat, liveChat })).resolves.toEqual({ ok: false, reason: "The team already has this chat, or was already asked to join it." });
    expect(onTeamRequested).not.toHaveBeenCalled();
  });
});
