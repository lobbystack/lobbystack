import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ claim: vi.fn(), finish: vi.fn(), partSent: vi.fn(), release: vi.fn(), leaseEndsAt: vi.fn(), alert: vi.fn(), load: vi.fn(), reserve: vi.fn(), save: vi.fn(), snapshot: vi.fn(), usage: vi.fn(), createAgent: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ alertUnansweredInstagram: mocks.alert, claimInstagramDelivery: mocks.claim, finishInstagramDelivery: mocks.finish, getBusinessSnapshotForAgent: mocks.snapshot, instagramDeliveryLeaseEndsAt: mocks.leaseEndsAt, loadInstagramReplyContext: mocks.load, recordAiGenerationEvent: mocks.usage, recordInstagramPartSent: mocks.partSent, releaseInstagramDelivery: mocks.release, reserveWidgetChatUsageInTransaction: mocks.reserve, saveInstagramReply: mocks.save }));
vi.mock("@lobbystack/agent-core", () => ({ createAgentModel: () => ({}), createConversationAgent: mocks.createAgent, describeAgentUsage: () => ({ provider: "openai", model: "test" }) }));
vi.mock("@lobbystack/db", () => ({ withBusinessTransaction: async (_db: unknown, _scope: unknown, run: (tx: unknown) => Promise<unknown>) => await run({}) }));
import { InstagramApiError } from "@lobbystack/providers/instagram/instagram";
import { instagramReplyText, replyToInstagramMessage, sendInstagramMessage } from "./instagramJobs";

const job = { id: "job", type: "instagram.send", businessId: "business", payload: { messageId: "message" } } as never;
const domain = { db: {} } as never;
const provider = { sendTextMessage: vi.fn(), refreshAccessToken: vi.fn() };
const operations = { provider, decryptToken: (value: string) => `plain:${value}`, encryptToken: (value: string) => value };
const delivery = { encryptedAccessToken: "token", instagramUserId: "ig_account", recipientId: "visitor", body: "Short reply.", partsSent: 0, providerMessageId: null };
// Two pieces: each paragraph fits the 1,000-byte limit, together they don't.
const longBody = `${"a".repeat(600)}.\n\n${"b".repeat(600)}.`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claim.mockResolvedValue(delivery);
  provider.sendTextMessage.mockResolvedValue({ messageId: "mid_1" });
});

describe("replyToInstagramMessage", () => {
  const replyJob = { id: "job", type: "instagram.reply", businessId: "business", payload: { conversationId: "conversation", messageId: "message" } } as never;
  const generating = (generate: () => Promise<unknown>) => mocks.createAgent.mockImplementation(({ onAction }: { onAction: () => void }) => ({ generate: async () => { onAction(); return await generate(); } }));

  beforeEach(() => {
    mocks.load.mockResolvedValue({ conversationId: "conversation", history: [{ direction: "inbound", body: "Call me back" }] });
    mocks.reserve.mockResolvedValue({ allowed: true });
    mocks.snapshot.mockResolvedValue({ defaultLocale: "en", displayName: "Javor" });
    mocks.usage.mockResolvedValue(null);
  });

  it("doesn't retry once a tool acted and the text came back empty, and tells the team", async () => {
    generating(async () => ({ text: "", usage: {} }));
    await expect(replyToInstagramMessage(domain, replyJob, { model: {} as never })).resolves.toEqual({ status: "skipped", entityId: "message" });
    expect(mocks.alert).toHaveBeenCalledWith(domain, { businessId: "business", conversationId: "conversation" });
  });

  it("retries a failure when no tool acted", async () => {
    mocks.createAgent.mockReturnValue({ generate: async () => { throw new Error("provider down"); } });
    await expect(replyToInstagramMessage(domain, replyJob, { model: {} as never })).rejects.toThrow("provider down");
    expect(mocks.alert).not.toHaveBeenCalled();
  });
});

it("sends without refreshing the token, which the daily job keeps current", async () => {
  await expect(sendInstagramMessage(domain, job, operations)).resolves.toMatchObject({ status: "completed" });
  expect(provider.refreshAccessToken).not.toHaveBeenCalled();
  expect(provider.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "plain:token", text: "Short reply." }));
});

it("runs again once the hold lapses when another run holds the message", async () => {
  const retryAt = new Date("2026-10-24T12:10:00Z");
  mocks.claim.mockResolvedValue(null);
  mocks.leaseEndsAt.mockResolvedValue(retryAt);
  await expect(sendInstagramMessage(domain, job, operations)).resolves.toEqual({ status: "deferred", entityId: "message", retryAt });
  expect(provider.sendTextMessage).not.toHaveBeenCalled();
});

it("hands the message back when the token can't be read, so it isn't left held", async () => {
  const unreadable = { ...operations, decryptToken: () => { throw new Error("bad key"); } };
  await expect(sendInstagramMessage(domain, job, unreadable)).rejects.toThrow("bad key");
  expect(mocks.release).toHaveBeenCalledWith(domain, { businessId: "business", messageId: "message" });
});

it("saves a sent message again when the first write fails, without sending it twice", async () => {
  mocks.finish.mockRejectedValueOnce(new Error("connection reset")).mockResolvedValueOnce(undefined);
  await expect(sendInstagramMessage(domain, job, operations)).resolves.toMatchObject({ status: "completed" });
  expect(provider.sendTextMessage).toHaveBeenCalledOnce();
  expect(mocks.finish).toHaveBeenCalledTimes(2);
  expect(mocks.release).not.toHaveBeenCalled();
});

it("hands the message back after a send that may work on retry", async () => {
  provider.sendTextMessage.mockRejectedValueOnce(new InstagramApiError("Instagram message send failed with status 500.", 500, undefined, false, false));
  await expect(sendInstagramMessage(domain, job, operations)).rejects.toThrow("status 500");
  expect(mocks.release).toHaveBeenCalledWith(domain, { businessId: "business", messageId: "message" });
  expect(mocks.finish).not.toHaveBeenCalled();
});

it("marks the message failed, without handing it back, when Instagram refuses it for good", async () => {
  provider.sendTextMessage.mockRejectedValueOnce(new InstagramApiError("Instagram message send failed with status 400 (code 10).", 400, 10, false, true));
  await expect(sendInstagramMessage(domain, job, operations)).resolves.toMatchObject({ status: "skipped" });
  expect(mocks.finish).toHaveBeenCalledWith(domain, expect.objectContaining({ status: "failed", reason: "instagram_error_10" }));
  expect(mocks.release).not.toHaveBeenCalled();
});

it("records each piece of a long reply, so a retry sends only the rest", async () => {
  mocks.claim.mockResolvedValue({ ...delivery, body: longBody });
  provider.sendTextMessage.mockResolvedValueOnce({ messageId: "mid_1" }).mockRejectedValueOnce(new Error("socket hang up"));
  await expect(sendInstagramMessage(domain, job, operations)).rejects.toThrow("socket hang up");
  expect(mocks.partSent).toHaveBeenCalledWith(domain, { businessId: "business", messageId: "message", partsSent: 1, providerMessageId: "mid_1" });

  vi.clearAllMocks();
  mocks.claim.mockResolvedValue({ ...delivery, body: longBody, partsSent: 1, providerMessageId: "mid_1" });
  provider.sendTextMessage.mockResolvedValue({ messageId: "mid_2" });
  await expect(sendInstagramMessage(domain, job, operations)).resolves.toMatchObject({ status: "completed" });
  expect(provider.sendTextMessage).toHaveBeenCalledOnce();
  expect(provider.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ text: `${"b".repeat(600)}.` }));
  expect(mocks.finish).toHaveBeenCalledWith(domain, { businessId: "business", messageId: "message", status: "sent", providerMessageId: "mid_1" });
});

it("never sends the NO_REPLY marker", () => {
  expect(instagramReplyText(" NO_REPLY. ")).toBeNull();
  expect(instagramReplyText("no_reply")).toBeNull();
  expect(instagramReplyText("Glad to help! NO_REPLY")).toBe("Glad to help!");
  expect(instagramReplyText("We open at 9.")).toBe("We open at 9.");
});

describe("which agent answers an Instagram message", () => {
  const job = { id: "job", type: "instagram.reply", businessId: "business", payload: { conversationId: "conversation", messageId: "message" } } as never;
  const domain = { db: {} } as never;
  const answerWith = (reply: { agentId?: string }) => {
    mocks.load.mockResolvedValue({ conversationId: "conversation", history: [{ direction: "inbound", body: "Hi" }], ...reply });
    mocks.reserve.mockResolvedValue({ allowed: true });
    mocks.snapshot.mockResolvedValue({ defaultLocale: "en", displayName: "Javor" });
    mocks.save.mockResolvedValue("reply");
    mocks.usage.mockResolvedValue(null);
    mocks.createAgent.mockReturnValue({ generate: vi.fn(async () => ({ text: "Hello", usage: {} })) });
  };

  it("answers as the agent stored on the conversation", async () => {
    answerWith({ agentId: "after-hours" });
    await replyToInstagramMessage(domain, job, { model: {} as never });
    expect(mocks.snapshot).toHaveBeenCalledWith(domain, { businessId: "business", agentId: "after-hours" });
  });

  it("treats a job with nothing about agents, on a conversation with no agent yet, as the default agent", async () => {
    answerWith({});
    await replyToInstagramMessage(domain, job, { model: {} as never });
    expect(mocks.snapshot).toHaveBeenCalledWith(domain, { businessId: "business", agentId: undefined });
  });
});
