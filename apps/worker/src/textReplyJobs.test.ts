import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), alert: vi.fn(), reserve: vi.fn(), snapshot: vi.fn(), usage: vi.fn(), generate: vi.fn(), createAgent: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ alertUnansweredText: mocks.alert, getCachedBusinessSnapshot: mocks.snapshot, loadTextReplyContext: mocks.load, recordAiGenerationEvent: mocks.usage, refreshBusinessSnapshot: vi.fn(), reserveWidgetChatUsageInTransaction: mocks.reserve, saveTextReply: mocks.save }));
vi.mock("@lobbystack/agent-core", () => ({ createAgentModel: () => ({}), createReceptionistAgent: mocks.createAgent, describeAgentUsage: () => ({ provider: "openai", model: "test" }) }));
vi.mock("@lobbystack/db", () => ({ withBusinessTransaction: async (_db: unknown, _scope: unknown, run: (tx: unknown) => Promise<unknown>) => await run({}) }));

import { replyToTextMessage, TEXT_REPLY_MAX_CHARS, textReplyBody } from "./textReplyJobs";

const job = { id: "job", type: "sms.aiReply", businessId: "business", payload: { conversationId: "conversation", messageId: "message" } } as never;
const domain = { db: {} } as never;
const model = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ phone: "+14165550123", firstReply: false, history: [{ direction: "inbound", body: "Are you open Sunday?" }] });
  mocks.reserve.mockResolvedValue({ allowed: true });
  mocks.snapshot.mockResolvedValue({ defaultLocale: "en", displayName: "Javor" });
  mocks.save.mockResolvedValue("reply");
  mocks.usage.mockResolvedValue(null);
  mocks.generate.mockResolvedValue({ text: "We open at 9.", usage: {} });
  mocks.createAgent.mockReturnValue({ generate: mocks.generate });
});

it("answers on the sms channel, without treating the sender as a verified caller", async () => {
  await expect(replyToTextMessage(domain, job, { model })).resolves.toEqual({ status: "completed", entityId: "reply" });
  const { context, extraInstructions } = mocks.createAgent.mock.calls[0]![0];
  expect(context).toMatchObject({ channel: "sms", conversationId: "conversation" });
  expect(context.callerPhone).toBeUndefined();
  expect(extraInstructions).toContain("+14165550123");
  expect(mocks.save).toHaveBeenCalledWith(domain, { businessId: "business", conversationId: "conversation", answeringMessageId: "message", body: "We open at 9." });
  expect(mocks.usage).toHaveBeenCalledWith(domain, expect.objectContaining({ operation: "sms.aiReply", messageId: "reply" }));
});

it("opens the first reply with the disclosure, however long the reply, in the business's language", async () => {
  mocks.load.mockResolvedValue({ phone: "+14165550123", firstReply: true, history: [{ direction: "inbound", body: "Bonjour" }] });
  mocks.snapshot.mockResolvedValue({ defaultLocale: "fr", displayName: "Javor" });
  mocks.generate.mockResolvedValue({ text: `${"a".repeat(310)}. Merci.`, usage: {} });
  await replyToTextMessage(domain, job, { model });
  const { body } = mocks.save.mock.calls[0]![1];
  expect(body.startsWith("Assistant automatisé de Javor. Répondez STOP pour vous désabonner. ")).toBe(true);
  expect(body.length).toBeLessThanOrEqual(TEXT_REPLY_MAX_CHARS);
});

it("sends no disclosure when the model chooses not to answer the first text", async () => {
  mocks.load.mockResolvedValue({ phone: "+14165550123", firstReply: true, history: [{ direction: "inbound", body: "ok" }] });
  mocks.generate.mockResolvedValue({ text: "NO_REPLY", usage: {} });
  await expect(replyToTextMessage(domain, job, { model })).resolves.toMatchObject({ status: "skipped" });
  expect(mocks.save).not.toHaveBeenCalled();
});

it("writes nothing when the domain says not to answer", async () => {
  mocks.load.mockResolvedValue(null);
  await expect(replyToTextMessage(domain, job, { model })).resolves.toMatchObject({ status: "skipped" });
  expect(mocks.createAgent).not.toHaveBeenCalled();
  expect(mocks.reserve).not.toHaveBeenCalled();
});

it("sends nothing when the model chooses not to answer", async () => {
  mocks.generate.mockResolvedValue({ text: "NO_REPLY", usage: {} });
  await expect(replyToTextMessage(domain, job, { model })).resolves.toMatchObject({ status: "skipped" });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.alert).not.toHaveBeenCalled();
});

it("alerts the team when the plan has no chats left", async () => {
  mocks.reserve.mockResolvedValue({ allowed: false });
  await expect(replyToTextMessage(domain, job, { model })).resolves.toMatchObject({ status: "skipped" });
  expect(mocks.alert).toHaveBeenCalledWith(domain, { businessId: "business", conversationId: "conversation" });
  expect(mocks.createAgent).not.toHaveBeenCalled();
});

it("alerts the team only when the last attempt fails", async () => {
  mocks.generate.mockRejectedValue(new Error("provider down"));
  await expect(replyToTextMessage(domain, job, { model }, { isFinalAttempt: false })).rejects.toThrow("provider down");
  expect(mocks.alert).not.toHaveBeenCalled();
  await expect(replyToTextMessage(domain, job, { model }, { isFinalAttempt: true })).rejects.toThrow("provider down");
  expect(mocks.alert).toHaveBeenCalledOnce();
});

it("keeps a reply within the limit, cut at a full sentence or a word", () => {
  expect(textReplyBody("We open at 9.")).toBe("We open at 9.");
  const long = `${"a".repeat(200)}. ${"b ".repeat(200)}`;
  expect(textReplyBody(long)).toBe(`${"a".repeat(200)}.`);
  const words = "word ".repeat(100);
  expect(textReplyBody(words).length).toBeLessThanOrEqual(TEXT_REPLY_MAX_CHARS);
  expect(textReplyBody(words).endsWith("word")).toBe(true);
});
