import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ claim: vi.fn(), finish: vi.fn(), partSent: vi.fn(), release: vi.fn(), leaseEndsAt: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ claimInstagramDelivery: mocks.claim, finishInstagramDelivery: mocks.finish, instagramDeliveryLeaseEndsAt: mocks.leaseEndsAt, recordInstagramPartSent: mocks.partSent, releaseInstagramDelivery: mocks.release }));
import { InstagramApiError } from "@lobbystack/providers/instagram/instagram";
import { instagramReplyText, sendInstagramMessage } from "./instagramJobs";

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
