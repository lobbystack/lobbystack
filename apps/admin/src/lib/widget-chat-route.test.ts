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
  getCachedBusinessSnapshot: vi.fn(),
  loadWidgetChatHistory: vi.fn(),
  recordAiGenerationEvent: vi.fn(),
  withBusinessTransaction: vi.fn(),
  reserveWidgetChatUsageInTransaction: vi.fn(),
  getWorkerDatabase: vi.fn(),
  createAgentModel: vi.fn(),
  createReceptionistAgent: vi.fn(),
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

vi.mock("@lobbystack/db", () => ({
  withBusinessTransaction: mocks.withBusinessTransaction,
}));

vi.mock("@lobbystack/agent-core/model", () => ({
  createAgentModel: mocks.createAgentModel,
  describeAgentUsage: (raw: { inputTokens?: number; outputTokens?: number } | undefined, latencyMs: number) => ({ provider: "test", model: "test", latencyMs, ...raw }),
}));

vi.mock("@lobbystack/agent-core/agent", () => ({
  createReceptionistAgent: mocks.createReceptionistAgent,
}));

function agentStreaming(textStream: AsyncIterable<string>, finishReason = "stop") {
  return { stream: vi.fn().mockResolvedValue({ textStream, totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }), finishReason: Promise.resolve(finishReason) }) };
}

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
  mocks.getOrCreateWidgetConversation.mockResolvedValue({ conversationId, automationState: "ai_active" });
  mocks.appendMessage.mockResolvedValue(inboundMessageId);
  mocks.queueOperatorAlert.mockResolvedValue(undefined);
  mocks.recordAiGenerationEvent.mockResolvedValue("event-id");
  mocks.registerWidgetVisitor.mockResolvedValue({ visitorId, contactId: null });
  mocks.getWorkerDatabase.mockReturnValue({ db: {} });
  mocks.withBusinessTransaction.mockImplementation(async (_db, _ctx, callback) => await callback({}));
  mocks.reserveWidgetChatUsageInTransaction.mockResolvedValue({ allowed: true, plan: "scale" });
  mocks.createAgentModel.mockReturnValue({ modelId: "test" });
  mocks.createReceptionistAgent.mockReturnValue(agentStreaming((async function* () { yield "Thanks"; })()));
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
    mocks.getOrCreateWidgetConversation.mockResolvedValue({ conversationId, automationState: "human_handoff" });
    const response = await POST(widgetRequest());
    const body = await readSse(response);
    expect(response.status).toBe(200);
    expect(mocks.appendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.appendMessage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ direction: "inbound", channel: "web_chat" }));
    expect(mocks.queueOperatorAlert).toHaveBeenCalled();
    expect(mocks.createAgentModel).not.toHaveBeenCalled();
    expect(body).toContain("human_handoff");
  });

  it("queues one operator alert per conversation and day, not one per message", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
    mocks.getOrCreateWidgetConversation.mockResolvedValue({ conversationId, automationState: "human_handoff" });
    await POST(widgetRequest());
    await POST(widgetRequest({ content: "Can someone call me?" }));
    vi.useRealTimers();
    const keys = mocks.queueOperatorAlert.mock.calls.map(([, input]) => (input as { eventKey: string }).eventKey);
    expect(keys).toEqual([`widget-chat:${conversationId}:2026-10-09`, `widget-chat:${conversationId}:2026-10-09`]);
  });

  it("returns HTTP 402 without calling the model when chat allowance is spent", async () => {
    mocks.reserveWidgetChatUsageInTransaction.mockResolvedValue({ allowed: false, plan: "starter" });
    const response = await POST(widgetRequest());
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "chat_ai_limit_reached" });
    expect(mocks.createAgentModel).toHaveBeenCalled();
  });

  it("returns a configuration error before reserving chat allowance", async () => {
    mocks.createAgentModel.mockReturnValue(undefined);
    const response = await POST(widgetRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "ai_provider_unavailable" });
    expect(mocks.reserveWidgetChatUsageInTransaction).not.toHaveBeenCalled();
  });

  it("streams an AI reply and persists the outbound message when automation is active", async () => {
    vi.stubEnv("AI_CHAT_API_KEY", "test-api-key");
    mocks.getCachedBusinessSnapshot.mockResolvedValue({ businessId } as BusinessContextSnapshot);
    mocks.loadWidgetChatHistory.mockResolvedValue([]);
    mocks.createReceptionistAgent.mockReturnValue(agentStreaming((async function* () {
      yield "Thanks";
      yield " for reaching out!";
    })()));

    const response = await POST(widgetRequest());
    const body = await readSse(response);
    expect(response.status).toBe(200);
    expect(body).toContain("text-delta");
    expect(body).toContain("Thanks");
    expect(body).toContain("for reaching out!");
    expect(mocks.appendMessage).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ direction: "outbound", channel: "web_chat", aiGenerated: true }));
    expect(mocks.createReceptionistAgent).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ channel: "web_chat", conversationId }) }));
    await vi.waitFor(() => expect(mocks.recordAiGenerationEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      businessId,
      conversationId,
      isStreaming: true,
      provider: "test",
      model: "test",
    })));
  });

  it("does not expose provider error details in the UI stream", async () => {
    // eslint-disable-next-line require-yield -- mock generator must throw before yielding.
    mocks.createReceptionistAgent.mockReturnValue(agentStreaming((async function* () { throw new Error("secret provider token"); })(), "error"));
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
