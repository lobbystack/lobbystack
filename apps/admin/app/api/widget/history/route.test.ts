import { beforeEach, describe, expect, it, vi } from "vitest";

const businessId = "00000000-0000-4000-8000-000000000001";
const visitorId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000003";

const mocks = vi.hoisted(() => ({
  findCurrentWidgetConversationId: vi.fn(),
  getOrCreateWidgetConversation: vi.fn(),
  loadWidgetChatView: vi.fn(),
  registerWidgetVisitor: vi.fn(),
  widgetConfig: {} as Record<string, unknown>,
}));

vi.mock("@/lib/widget-access", () => ({
  resolveWidgetSessionAccess: async () => ({ ok: true, session: { businessId, widgetKeyId: "key-1", visitorId, config: mocks.widgetConfig } }),
}));
vi.mock("@/lib/widget-policy", () => ({ enforceWidgetRateLimits: async () => ({ allowed: true }) }));
vi.mock("@/lib/widget-keys", () => ({ requestIpHash: () => "ip-hash" }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
vi.mock("@/lib/api-helpers", () => ({ asApiResponse: (error: unknown) => { throw error; } }));
vi.mock("@lobbystack/domain", () => ({
  registerWidgetVisitor: mocks.registerWidgetVisitor,
  findCurrentWidgetConversationId: mocks.findCurrentWidgetConversationId,
  getOrCreateWidgetConversation: mocks.getOrCreateWidgetConversation,
  loadWidgetChatView: mocks.loadWidgetChatView,
}));

import { GET } from "./route";

const at = new Date("2026-10-14T21:00:00.000Z");

beforeEach(() => {
  mocks.findCurrentWidgetConversationId.mockReset().mockResolvedValue(conversationId);
  mocks.getOrCreateWidgetConversation.mockReset().mockResolvedValue({ conversationId, automationState: "ai_active" });
  mocks.loadWidgetChatView.mockReset();
  mocks.registerWidgetVisitor.mockReset();
  mocks.widgetConfig = {};
});

describe("GET /api/widget/history", () => {
  it("returns the chat with who from the team is in it, and their first name on their messages", async () => {
    mocks.loadWidgetChatView.mockResolvedValue({
      automationState: "human_handoff",
      waitingForTeam: false,
      teamMemberName: "Yuri",
      messages: [
        { id: "m1", direction: "inbound", body: "Can I talk to someone?", createdAt: at, fromTeam: false, teamMemberName: null },
        { id: "m2", direction: "outbound", body: "I've let the team know.", createdAt: at, fromTeam: false, teamMemberName: null },
        { id: "m3", direction: "outbound", body: "Hi, this is Yuri.", createdAt: at, fromTeam: true, teamMemberName: "Yuri" },
        { id: "m4", direction: "outbound", body: "One moment.", createdAt: at, fromTeam: true, teamMemberName: null },
      ],
    });

    const response = await GET(new Request("http://localhost/api/widget/history", { headers: { authorization: "Bearer token" } }));

    expect(await response.json()).toEqual({
      conversationId,
      automationState: "human_handoff",
      waitingForTeam: false,
      teamMemberName: "Yuri",
      messages: [
        { id: "m1", role: "user", content: "Can I talk to someone?", createdAt: at.toISOString() },
        { id: "m2", role: "assistant", content: "I've let the team know.", createdAt: at.toISOString() },
        { id: "m3", role: "assistant", content: "Hi, this is Yuri.", createdAt: at.toISOString(), fromTeam: true, teamMemberName: "Yuri" },
        { id: "m4", role: "assistant", content: "One moment.", createdAt: at.toISOString(), fromTeam: true, teamMemberName: null },
      ],
    });
    expect(mocks.findCurrentWidgetConversationId).toHaveBeenCalledWith({}, { businessId, widgetVisitorId: visitorId });
    expect(mocks.loadWidgetChatView).toHaveBeenCalledWith({}, { businessId, conversationId, liveChatOn: false });
  });

  it("tells the chat view when the widget has live chat on, as only then a quiet team's chat goes back to the receptionist", async () => {
    mocks.widgetConfig = { liveChat: { enabled: true } };
    mocks.loadWidgetChatView.mockResolvedValue({ automationState: "ai_active", waitingForTeam: false, teamMemberName: null, messages: [] });

    await GET(new Request("http://localhost/api/widget/history", { headers: { authorization: "Bearer token" } }));

    expect(mocks.loadWidgetChatView).toHaveBeenCalledWith({}, { businessId, conversationId, liveChatOn: true });
  });

  it("shows a visitor without a chat an empty one, and leaves starting it to their first message", async () => {
    mocks.findCurrentWidgetConversationId.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/widget/history", { headers: { authorization: "Bearer token" } }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ messages: [] });
    expect(mocks.getOrCreateWidgetConversation).not.toHaveBeenCalled();
    expect(mocks.loadWidgetChatView).not.toHaveBeenCalled();
  });

  it("reads the chat without saving the visitor, which its session did", async () => {
    mocks.loadWidgetChatView.mockResolvedValue({ automationState: "ai_active", waitingForTeam: false, teamMemberName: null, messages: [] });

    const response = await GET(new Request("http://localhost/api/widget/history", { headers: { authorization: "Bearer token" } }));

    expect(response.status).toBe(200);
    expect(mocks.registerWidgetVisitor).not.toHaveBeenCalled();
  });
});
