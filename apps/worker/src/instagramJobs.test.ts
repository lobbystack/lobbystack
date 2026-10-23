import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ claim: vi.fn(), finish: vi.fn(), partSent: vi.fn(), release: vi.fn(), refresh: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ claimInstagramDelivery: mocks.claim, finishInstagramDelivery: mocks.finish, recordInstagramPartSent: mocks.partSent, releaseInstagramDelivery: mocks.release, refreshInstagramTokenIfDue: mocks.refresh }));
import { InstagramApiError } from "@lobbystack/providers/instagram/instagram";
import { sendInstagramMessage } from "./instagramJobs";

const job = { id: "job", type: "instagram.send", businessId: "business", payload: { messageId: "message" } } as never;
const domain = { db: {} } as never;
const provider = { sendTextMessage: vi.fn(), refreshAccessToken: vi.fn() };
const operations = { provider, decryptToken: (value: string) => `plain:${value}`, encryptToken: (value: string) => value };
const delivery = { encryptedAccessToken: "token", instagramUserId: "ig_account", recipientId: "visitor", body: "Short reply.", partsSent: 0, providerMessageId: null };
// Two pieces: each paragraph fits the 1,000-byte limit, together they don't.
const longBody = `${"a".repeat(600)}.\n\n${"b".repeat(600)}.`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue("current");
  mocks.claim.mockResolvedValue(delivery);
  provider.sendTextMessage.mockResolvedValue({ messageId: "mid_1" });
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
  mocks.refresh.mockResolvedValue("current");
  mocks.claim.mockResolvedValue({ ...delivery, body: longBody, partsSent: 1, providerMessageId: "mid_1" });
  provider.sendTextMessage.mockResolvedValue({ messageId: "mid_2" });
  await expect(sendInstagramMessage(domain, job, operations)).resolves.toMatchObject({ status: "completed" });
  expect(provider.sendTextMessage).toHaveBeenCalledOnce();
  expect(provider.sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ text: `${"b".repeat(600)}.` }));
  expect(mocks.finish).toHaveBeenCalledWith(domain, { businessId: "business", messageId: "message", status: "sent", providerMessageId: "mid_1" });
});
