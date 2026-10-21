import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessContextSnapshot } from "@lobbystack/shared";

const mocks = vi.hoisted(() => ({
  readJson: vi.fn(),
  resolveWidgetSessionAccess: vi.fn(),
  enforceWidgetRateLimits: vi.fn(),
  requestIpHash: vi.fn(),
  registerWidgetVisitor: vi.fn(),
  getOrCreateWidgetConversation: vi.fn(),
  returnQuietTeamChat: vi.fn(),
  announceLateWidgetReply: vi.fn(),
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
  announceLateWidgetReply: mocks.announceLateWidgetReply,
  appendMessage: mocks.appendMessage,
  getOrCreateWidgetConversation: mocks.getOrCreateWidgetConversation,
  getCachedBusinessSnapshot: mocks.getCachedBusinessSnapshot,
  loadWidgetChatHistory: mocks.loadWidgetChatHistory,
  recordAiGenerationEvent: mocks.recordAiGenerationEvent,
  registerWidgetVisitor: mocks.registerWidgetVisitor,
  reserveWidgetChatUsageInTransaction: mocks.reserveWidgetChatUsageInTransaction,
  returnQuietTeamChat: mocks.returnQuietTeamChat,
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

/** An agent whose reply streams word by word, each once its gate opens. */
function agentReplyingIn(words: string[], gates: Array<Promise<void>> = []) {
  mocks.loadWidgetChatHistory.mockResolvedValue([{ id: "m1", direction: "inbound", body: "Are you open on Sunday?", createdAt: new Date() }]);
  return {
    stream: vi.fn(async (options: { abortSignal?: AbortSignal }) => ({
      textStream: (async function* () {
        for (const [index, word] of words.entries()) {
          await gates[index];
          // Like the request to the model provider, an aborted signal ends the reply.
          options.abortSignal?.throwIfAborted();
          yield word;
        }
      })(),
      totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }),
      finishReason: Promise.resolve("stop"),
    })),
  };
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

function widgetRequest(overrides: Record<string, unknown> = {}, signal?: AbortSignal): Request {
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
    ...(signal ? { signal } : {}),
  });
}

function savedReplies() {
  return mocks.appendMessage.mock.calls.map(([, message]) => message as { direction: string; body: string }).filter((message) => message.direction === "outbound");
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
  mocks.returnQuietTeamChat.mockResolvedValue("human_handoff");
  mocks.announceLateWidgetReply.mockResolvedValue(undefined);
  mocks.appendMessage.mockResolvedValue(inboundMessageId);
  mocks.queueOperatorAlert.mockResolvedValue(undefined);
  mocks.recordAiGenerationEvent.mockResolvedValue("event-id");
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
    mocks.resolveWidgetSessionAccess.mockResolvedValue({ ok: true, session: { ...session, config: { liveChat: { enabled: true } } } });
    mocks.getOrCreateWidgetConversation.mockResolvedValue({ conversationId, automationState: "human_handoff" });
    const response = await POST(widgetRequest());
    const body = await readSse(response);
    expect(response.status).toBe(200);
    expect(mocks.appendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.appendMessage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ direction: "inbound", channel: "web_chat" }));
    expect(mocks.queueOperatorAlert).toHaveBeenCalled();
    expect(mocks.createAgentModel).not.toHaveBeenCalled();
    expect(body).toContain("human_handoff");
    // The team is still in the chat.
    expect(mocks.returnQuietTeamChat).toHaveBeenCalledWith(expect.anything(), { businessId, conversationId });
  });

  it("answers in a chat the team took over and then went quiet in, when the widget has live chat on", async () => {
    mocks.resolveWidgetSessionAccess.mockResolvedValue({ ok: true, session: { ...session, config: { liveChat: { enabled: true } } } });
    mocks.getOrCreateWidgetConversation.mockResolvedValue({ conversationId, automationState: "human_handoff" });
    mocks.returnQuietTeamChat.mockResolvedValue("ai_active");
    mocks.createReceptionistAgent.mockReturnValue(agentReplyingIn(["We're open Sunday."]));

    const body = await readSse(await POST(widgetRequest()));

    expect(body).toContain("We're open Sunday.");
    expect(body).toContain('"messageMetadata":{"automationState":"ai_active"}');
    expect(savedReplies()).toEqual([expect.objectContaining({ body: "We're open Sunday.", aiGenerated: true })]);
  });

  it("keeps a chat the team paused paused when the widget has live chat off, however long the team stays quiet", async () => {
    mocks.getOrCreateWidgetConversation.mockResolvedValue({ conversationId, automationState: "human_handoff" });
    // The team would count as quiet if anything asked.
    mocks.returnQuietTeamChat.mockResolvedValue("ai_active");

    const body = await readSse(await POST(widgetRequest()));

    expect(mocks.returnQuietTeamChat).not.toHaveBeenCalled();
    expect(mocks.createAgentModel).not.toHaveBeenCalled();
    expect(mocks.createReceptionistAgent).not.toHaveBeenCalled();
    expect(body).toContain('"messageMetadata":{"automationState":"human_handoff"}');
    expect(savedReplies()).toEqual([]);
  });

  it("doesn't check on the team in a chat the receptionist has", async () => {
    await readSse(await POST(widgetRequest()));
    expect(mocks.returnQuietTeamChat).not.toHaveBeenCalled();
  });

  it("saves the visitor's message without saving the visitor, which its session did", async () => {
    await readSse(await POST(widgetRequest()));
    expect(mocks.appendMessage).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ conversationId, direction: "inbound", channel: "web_chat" }));
    expect(mocks.registerWidgetVisitor).not.toHaveBeenCalled();
  });

  /** Sends a chat request and reads its reply up to `words`, as the visitor's browser does. */
  async function readReplyUntil(words: string, connection: AbortController) {
    const response = await POST(widgetRequest({}, connection.signal));
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";
    while (!received.includes(words)) {
      const { done, value } = await reader.read();
      if (done) throw new Error(`The reply ended before its first words: ${received}`);
      received += decoder.decode(value, { stream: true });
    }
    return reader;
  }

  it("stops the model when the visitor leaves mid-reply, and saves the words they saw", async () => {
    mocks.appendMessage.mockImplementation(async (_context: unknown, message: { direction: string }) => message.direction === "outbound" ? "reply-1" : inboundMessageId);
    let openRest!: () => void;
    const rest = new Promise<void>((resolve) => { openRest = resolve; });
    const agent = agentReplyingIn(["We're open ", "Sunday 10 to 4."], [Promise.resolve(), rest]);
    mocks.createReceptionistAgent.mockReturnValue(agent);
    const connection = new AbortController();
    const reader = await readReplyUntil("We're open", connection);

    // The visitor clicks a link on the site: the browser drops the request.
    connection.abort();
    await reader.cancel();
    openRest();

    // The model call got the request's signal, so the provider request ends with it.
    expect(agent.stream.mock.calls[0]![0].abortSignal?.aborted).toBe(true);
    await vi.waitFor(() => expect(savedReplies()).toEqual([expect.objectContaining({ body: "We're open ", aiGenerated: true })]));
    // The widget on the next page hears about the reply, in case it loaded the chat first.
    await vi.waitFor(() => expect(mocks.announceLateWidgetReply).toHaveBeenCalledWith(expect.anything(), { businessId, conversationId, messageId: "reply-1" }));
    await vi.waitFor(() => expect(mocks.recordAiGenerationEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ conversationId, messageId: "reply-1", inputTokens: 1, outputTokens: 1, isError: true, error: "request_aborted" })));
  });

  it("saves nothing when the visitor leaves before the reply's first words", async () => {
    let openReply!: () => void;
    const reply = new Promise<void>((resolve) => { openReply = resolve; });
    const agent = agentReplyingIn(["We're open Sunday."], [reply]);
    mocks.createReceptionistAgent.mockReturnValue(agent);
    const connection = new AbortController();
    const reader = await readReplyUntil('"type":"text-start"', connection);

    connection.abort();
    await reader.cancel();
    openReply();

    await vi.waitFor(() => expect(mocks.recordAiGenerationEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ conversationId, isError: true, error: "request_aborted" })));
    expect(agent.stream.mock.calls[0]![0].abortSignal?.aborted).toBe(true);
    expect(savedReplies()).toEqual([]);
    expect(mocks.announceLateWidgetReply).not.toHaveBeenCalled();
  });

  it("doesn't announce a reply the visitor stayed for", async () => {
    mocks.createReceptionistAgent.mockReturnValue(agentReplyingIn(["We're open ", "Sunday 10 to 4."]));
    const body = await readSse(await POST(widgetRequest()));
    expect(body).toContain("Sunday 10 to 4.");
    expect(savedReplies()).toEqual([expect.objectContaining({ body: "We're open Sunday 10 to 4." })]);
    expect(mocks.announceLateWidgetReply).not.toHaveBeenCalled();
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

  // Reasoning counts toward the output cap, so a step can use it up before writing any text.
  it("answers in the chat's language when the reply hits the output cap before any text", async () => {
    mocks.getCachedBusinessSnapshot.mockResolvedValue({ businessId } as BusinessContextSnapshot);
    mocks.loadWidgetChatHistory.mockResolvedValue([]);
    // eslint-disable-next-line require-yield -- the model wrote no text before the cap.
    mocks.createReceptionistAgent.mockReturnValue(agentStreaming((async function* () {})(), "length"));

    const body = await readSse(await POST(widgetRequest({ locale: "fr" })));

    const fallback = "Désolé, ma réponse a été coupée. Posez votre question à nouveau, ou laissez votre nom et votre numéro, et quelqu'un de l'équipe vous recontactera.";
    expect(body).toContain(JSON.stringify(fallback).slice(1, -1));
    expect(body).not.toContain("The chat could not be processed.");
    expect(savedReplies()).toEqual([expect.objectContaining({ body: fallback, channel: "web_chat" })]);
  });

  it("keeps the error for an empty reply that didn't hit the cap", async () => {
    // eslint-disable-next-line require-yield -- the model wrote no text.
    mocks.createReceptionistAgent.mockReturnValue(agentStreaming((async function* () {})(), "stop"));
    const body = await readSse(await POST(widgetRequest()));
    expect(body).toContain("The chat could not be processed.");
    expect(savedReplies()).toEqual([]);
  });

  it.each([
    ["the business's caller language", { defaultLocale: "de" }, {}, "German"],
    ["French when the widget shows French", { defaultLocale: "de" }, { locale: "fr" }, "French"],
    ["Serbian when the widget shows Serbian", { defaultLocale: "de" }, { locale: "sr" }, "Serbian (Latin script)"],
    ["the business's language when the widget falls back to English", { defaultLocale: "nl" }, { locale: "en" }, "Dutch"],
    ["the widget's set language over the business's", { defaultLocale: "de", config: { localeOverride: "es" } }, {}, "Spanish"],
  ])("answers website chat in %s", async (_case, sessionOverrides, body, language) => {
    vi.stubEnv("AI_CHAT_API_KEY", "test-api-key");
    mocks.resolveWidgetSessionAccess.mockResolvedValue({ ok: true, session: { ...session, ...sessionOverrides } });
    mocks.getCachedBusinessSnapshot.mockResolvedValue({ businessId } as BusinessContextSnapshot);
    mocks.loadWidgetChatHistory.mockResolvedValue([]);
    await readSse(await POST(widgetRequest(body)));
    expect(mocks.createReceptionistAgent).toHaveBeenCalledWith(expect.objectContaining({ extraInstructions: `Reply in ${language} unless the visitor clearly asks to switch languages.` }));
  });

  it("lets a visitor ask for someone from the team when the widget has live chat on, and tells the widget the chat waits for them", async () => {
    mocks.resolveWidgetSessionAccess.mockResolvedValue({ ok: true, session: { ...session, config: { liveChat: { enabled: true } } } });
    mocks.getCachedBusinessSnapshot.mockResolvedValue({ businessId } as BusinessContextSnapshot);
    mocks.loadWidgetChatHistory.mockResolvedValue([]);
    mocks.createReceptionistAgent.mockImplementation((input: { context: { liveChat?: { onTeamRequested?: () => void } } }) => ({
      stream: vi.fn(async () => {
        input.context.liveChat?.onTeamRequested?.();
        return { textStream: (async function* () { yield "I've let the team know."; })(), totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }), finishReason: Promise.resolve("stop") };
      }),
    }));

    const body = await readSse(await POST(widgetRequest({ locale: "fr" })));

    expect(mocks.createReceptionistAgent).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ liveChat: expect.objectContaining({ locale: "fr" }) }) }));
    expect(body).toContain('"messageMetadata":{"automationState":"human_handoff","waitingForTeam":true}');
    expect(mocks.appendMessage).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ body: "I've let the team know.", direction: "outbound", aiGenerated: true }));
  });

  it("offers no live chat when the widget has it off", async () => {
    mocks.getCachedBusinessSnapshot.mockResolvedValue({ businessId } as BusinessContextSnapshot);
    mocks.loadWidgetChatHistory.mockResolvedValue([]);

    const body = await readSse(await POST(widgetRequest()));

    expect(mocks.createReceptionistAgent.mock.calls[0]![0].context).not.toHaveProperty("liveChat");
    expect(body).toContain('"messageMetadata":{"automationState":"ai_active"}');
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
