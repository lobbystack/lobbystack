import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessContextSnapshot } from "@lobbystack/shared";

const mocks = vi.hoisted(() => ({
  readJson: vi.fn(),
  resolveWidgetSessionAccess: vi.fn(),
  enforceWidgetRateLimits: vi.fn(),
  requestIpHash: vi.fn(),
  registerWidgetVisitor: vi.fn(),
  getOrCreateWidgetConversation: vi.fn(),
  appendMessage: vi.fn(),
  queueOperatorAlert: vi.fn(),
  loadAutomationState: vi.fn(),
  getCachedBusinessSnapshot: vi.fn(),
  loadWidgetChatHistory: vi.fn(),
  recordAiGenerationEvent: vi.fn(),
  withBusinessTransaction: vi.fn(),
  reserveWidgetChatUsageInTransaction: vi.fn(),
  getWorkerDatabase: vi.fn(),
  createTextAiProvider: vi.fn(),
}));

vi.mock("@lobbystack/domain", () => ({
  appendMessage: mocks.appendMessage,
  getOrCreateWidgetConversation: mocks.getOrCreateWidgetConversation,
  getCachedBusinessSnapshot: mocks.getCachedBusinessSnapshot,
  loadWidgetChatHistory: mocks.loadWidgetChatHistory,
  recordAiGenerationEvent: mocks.recordAiGenerationEvent,
  registerWidgetVisitor: mocks.registerWidgetVisitor,
  reserveWidgetChatUsageInTransaction: mocks.reserveWidgetChatUsageInTransaction,
  queueOperatorAlert: mocks.queueOperatorAlert,
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(() => ({})) }));

vi.mock("@lobbystack/db", () => ({
  withBusinessTransaction: mocks.withBusinessTransaction,
  conversations: {},
}));

vi.mock("@lobbystack/providers", () => ({
  createTextAiProvider: mocks.createTextAiProvider,
}));

vi.mock("@/lib/api-helpers", () => ({
  getWorkerDatabase: mocks.getWorkerDatabase,
  readJson: mocks.readJson,
}));

vi.mock("@/lib/domain-context", () => ({
  createWorkerDomainContext: () => ({ db: {} }),
}));

vi.mock("@/lib/widget-access", () => ({
  resolveWidgetSessionAccess: mocks.resolveWidgetSessionAccess,
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
  visitorId,
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
  mocks.resolveWidgetSessionAccess.mockResolvedValue({ ok: true, session });
  mocks.enforceWidgetRateLimits.mockResolvedValue({ allowed: true });
  mocks.requestIpHash.mockReturnValue("ip-hash");
  mocks.getOrCreateWidgetConversation.mockResolvedValue({ conversationId });
  mocks.appendMessage.mockResolvedValue(inboundMessageId);
  mocks.queueOperatorAlert.mockResolvedValue(undefined);
  mocks.recordAiGenerationEvent.mockResolvedValue("event-id");
  mocks.registerWidgetVisitor.mockResolvedValue({ visitorId, contactId: null });
  mocks.getWorkerDatabase.mockReturnValue({ db: {} });
  mocks.withBusinessTransaction.mockImplementation(async (_db, _ctx, callback) => await callback(automationTx([])));
  mocks.reserveWidgetChatUsageInTransaction.mockResolvedValue({ allowed: true, plan: "scale" });
  mocks.createTextAiProvider.mockReturnValue({
    streamReply: vi.fn().mockReturnValue({
      textStream: (async function* () { yield "Thanks"; })(),
      usage: Promise.resolve({ provider: "test", model: "test", latencyMs: 1, inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
      finishReason: Promise.resolve("stop"),
    }),
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/widget/chat", () => {
  it("rejects when the widget key cannot be resolved", async () => {
    mocks.resolveWidgetSessionAccess.mockResolvedValue({
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
    expect(mocks.createTextAiProvider).not.toHaveBeenCalled();
    expect(body).toContain("human_handoff");
  });

  it("returns HTTP 402 without calling the model when chat allowance is spent", async () => {
    mocks.reserveWidgetChatUsageInTransaction.mockResolvedValue({ allowed: false, plan: "starter" });
    const response = await POST(widgetRequest());
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "chat_ai_limit_reached" });
    expect(mocks.createTextAiProvider).toHaveBeenCalled();
  });

  it("returns a configuration error before reserving chat allowance", async () => {
    mocks.createTextAiProvider.mockReturnValue(null);
    const response = await POST(widgetRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "ai_provider_unavailable" });
    expect(mocks.reserveWidgetChatUsageInTransaction).not.toHaveBeenCalled();
  });

  it("streams an AI reply and persists the outbound message when automation is active", async () => {
    vi.stubEnv("AI_CHAT_API_KEY", "test-api-key");
    mocks.getCachedBusinessSnapshot.mockResolvedValue({ businessId } as BusinessContextSnapshot);
    mocks.loadWidgetChatHistory.mockResolvedValue([]);
    const streamReply = vi.fn().mockReturnValue({
      textStream: (async function* () {
        yield "Thanks";
        yield " for reaching out!";
      })(),
      usage: Promise.resolve({ provider: "test", model: "test", latencyMs: 1, inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
      finishReason: Promise.resolve("stop"),
    });
    class FakeSignedProvider {
      streamReply = streamReply;
    }
    mocks.createTextAiProvider.mockReturnValue(new FakeSignedProvider());

    const response = await POST(widgetRequest());
    const body = await readSse(response);
    expect(response.status).toBe(200);
    expect(body).toContain("text-delta");
    expect(body).toContain("Thanks");
    expect(body).toContain("for reaching out!");
    expect(mocks.appendMessage).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ direction: "outbound", channel: "web_chat", aiGenerated: true }));
    await vi.waitFor(() => expect(mocks.recordAiGenerationEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      businessId,
      conversationId,
      isStreaming: true,
      provider: "test",
      model: "test",
    })));
  });

  it("does not expose provider error details in the UI stream", async () => {
    mocks.createTextAiProvider.mockReturnValue({
      streamReply: vi.fn().mockReturnValue({
        textStream: (async function* () { throw new Error("secret provider token"); })(),
        usage: Promise.resolve({ provider: "test", model: "test", latencyMs: 1 }),
        finishReason: Promise.resolve("error"),
      }),
    });
    const body = await readSse(await POST(widgetRequest()));
    expect(body).toContain("The chat could not be processed.");
    expect(body).not.toContain("secret provider token");
    await vi.waitFor(() => expect(mocks.recordAiGenerationEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      businessId,
      conversationId,
      isError: true,
      error: "generation_failed",
      provider: "unknown",
      model: "unknown",
    })));
  });
});
