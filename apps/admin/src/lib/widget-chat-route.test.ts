import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessContextSnapshot } from "@lobbystack/shared";

const mocks = vi.hoisted(() => ({
  readJson: vi.fn(),
  resolveWidgetAccess: vi.fn(),
  enforceWidgetRateLimits: vi.fn(),
  requestIpHash: vi.fn(),
  registerWidgetVisitor: vi.fn(),
  getOrCreateWidgetConversation: vi.fn(),
  appendMessage: vi.fn(),
  queueOperatorAlert: vi.fn(),
  loadAutomationState: vi.fn(),
  getWidgetChatAllowance: vi.fn(),
  getCachedBusinessSnapshot: vi.fn(),
  loadWidgetChatHistory: vi.fn(),
  withBusinessTransaction: vi.fn(),
  reserveWidgetChatUsageInTransaction: vi.fn(),
  getWorkerDatabase: vi.fn(),
  OpenAiCompatibleTextProvider: vi.fn(),
}));

vi.mock("@lobbystack/domain", () => ({
  appendMessage: mocks.appendMessage,
  getOrCreateWidgetConversation: mocks.getOrCreateWidgetConversation,
  getCachedBusinessSnapshot: mocks.getCachedBusinessSnapshot,
  getWidgetChatAllowance: mocks.getWidgetChatAllowance,
  loadWidgetChatHistory: mocks.loadWidgetChatHistory,
  registerWidgetVisitor: mocks.registerWidgetVisitor,
  reserveWidgetChatUsageInTransaction: mocks.reserveWidgetChatUsageInTransaction,
  queueOperatorAlert: mocks.queueOperatorAlert,
}));

vi.mock("@lobbystack/db", () => ({
  withBusinessTransaction: mocks.withBusinessTransaction,
  conversations: {},
}));

vi.mock("@lobbystack/providers", () => ({
  OpenAiCompatibleTextProvider: mocks.OpenAiCompatibleTextProvider,
}));

vi.mock("@/lib/api-helpers", () => ({
  getWorkerDatabase: mocks.getWorkerDatabase,
  readJson: mocks.readJson,
}));

vi.mock("@/lib/domain-context", () => ({
  createWorkerDomainContext: () => ({ db: {} }),
}));

vi.mock("@/lib/widget-access", () => ({
  resolveWidgetAccess: mocks.resolveWidgetAccess,
}));

vi.mock("@/lib/widget-keys", () => ({
  requestIpHash: mocks.requestIpHash,
}));

vi.mock("@/lib/widget-policy", () => ({
  enforceWidgetRateLimits: mocks.enforceWidgetRateLimits,
}));

import { POST } from "../../app/api/widget/chat/route";

const businessId = "00000000-0000-4000-8000-000000000001";
const widgetKeyId = "00000000-0000-4000-8000-000000000002";
const conversationId = "00000000-0000-4000-8000-000000000003";
const visitorId = "00000000-0000-4000-8000-000000000004";
const inboundMessageId = "00000000-0000-4000-8000-000000000005";

const session = {
  businessId,
  widgetKeyId,
  keyHash: "hash",
  origin: "https://example.com",
  key: { status: "active", allowedOrigins: ["https://example.com"] },
  businessName: "Maple Family Clinic",
  businessSlug: "maple-clinic",
  defaultLocale: "en" as const,
  config: {},
};

function automationTx(rows: unknown) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(rows) }),
      }),
    }),
  };
}

function widgetRequest(overrides: Record<string, unknown> = {}): Request {
  mocks.readJson.mockResolvedValue({
    widgetKey: "wk_live_abc",
    visitorId,
    messageId: "00000000-0000-4000-8000-000000000006",
    content: "Hi, I would like to book a checkup.",
    ...overrides,
  });
  return new Request("https://app.example.test/api/widget/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

async function readSse(response: Response): Promise<string> {
  return await response.text();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveWidgetAccess.mockResolvedValue({ ok: true, session });
  mocks.enforceWidgetRateLimits.mockResolvedValue({ allowed: true });
  mocks.requestIpHash.mockReturnValue("ip-hash");
  mocks.getOrCreateWidgetConversation.mockResolvedValue({ conversationId });
  mocks.appendMessage.mockResolvedValue(inboundMessageId);
  mocks.queueOperatorAlert.mockResolvedValue(undefined);
  mocks.registerWidgetVisitor.mockResolvedValue({ visitorId, contactId: null });
  mocks.getWorkerDatabase.mockReturnValue({ db: {} });
  mocks.withBusinessTransaction.mockImplementation(async (_db, _ctx, callback) => await callback(automationTx([])));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/widget/chat", () => {
  it("rejects when the widget key cannot be resolved", async () => {
    mocks.resolveWidgetAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "nope" }), { status: 401, headers: { "content-type": "application/json" } }),
    });
    const response = await POST(widgetRequest());
    expect(response.status).toBe(401);
    expect(mocks.appendMessage).not.toHaveBeenCalled();
  });

  it("rejects when the widget rate limit is exceeded", async () => {
    mocks.enforceWidgetRateLimits.mockResolvedValue({ allowed: false, status: 429, code: "widget_rate_limited", reason: "rate_limit" });
    const response = await POST(widgetRequest());
    expect(response.status).toBe(429);
  });

  it("suppresses the AI reply and alerts when the conversation is on human handoff", async () => {
    mocks.withBusinessTransaction.mockImplementation(async (_db, _ctx, callback) => await callback(automationTx([{ automationState: "human_handoff" }])));
    const response = await POST(widgetRequest());
    const body = await readSse(response);
    expect(response.status).toBe(200);
    expect(mocks.appendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.appendMessage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ direction: "inbound", channel: "web_chat" }));
    expect(mocks.queueOperatorAlert).toHaveBeenCalled();
    expect(mocks.OpenAiCompatibleTextProvider).not.toHaveBeenCalled();
    expect(body).toContain("human_handoff");
  });

  it("returns a billing-exhausted event and fallback without calling the model when chat allowance is spent", async () => {
    mocks.getWidgetChatAllowance.mockResolvedValue({ allowed: false, plan: "starter" });
    const response = await POST(widgetRequest());
    const body = await readSse(response);
    expect(response.status).toBe(200);
    expect(body).toContain("chat_ai_limit_reached");
    expect(body).toContain("Thanks for your message!");
    expect(mocks.OpenAiCompatibleTextProvider).not.toHaveBeenCalled();
    expect(mocks.appendMessage).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ direction: "outbound", aiGenerated: false }));
  });

  it("streams an AI reply and persists the outbound message when automation is active", async () => {
    vi.stubEnv("AI_CHAT_API_KEY", "test-api-key");
    mocks.getWidgetChatAllowance.mockResolvedValue({ allowed: true, plan: "scale" });
    mocks.getCachedBusinessSnapshot.mockResolvedValue({ businessId } as BusinessContextSnapshot);
    mocks.loadWidgetChatHistory.mockResolvedValue([]);
    const streamReply = vi.fn().mockReturnValue({
      [Symbol.asyncIterator]() {
        let index = 0;
        const parts = ["Thanks", " for reaching out!"];
        return {
          next: async () => ({ done: index >= parts.length, value: parts[index++] }),
        };
      },
    });
    class FakeSignedProvider {
      streamReply = streamReply;
    }
    mocks.OpenAiCompatibleTextProvider.mockImplementation(function () {
      return new FakeSignedProvider();
    });

    const response = await POST(widgetRequest());
    const body = await readSse(response);
    expect(response.status).toBe(200);
    expect(body).toContain("text-delta");
    expect(body).toContain("Thanks");
    expect(body).toContain("for reaching out!");
    expect(mocks.appendMessage).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ direction: "outbound", channel: "web_chat", aiGenerated: true }));
  });
});
