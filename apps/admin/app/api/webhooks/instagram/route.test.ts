import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  receiveInstagramMessage: vi.fn(),
  resolveBusinessByInstagramAccount: vi.fn(),
}));

vi.mock("@lobbystack/domain", () => ({
  receiveInstagramMessage: mocks.receiveInstagramMessage,
  resolveBusinessByInstagramAccount: mocks.resolveBusinessByInstagramAccount,
}));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({ db: {} }) }));

import { GET, POST } from "./route";

const secret = "app-secret";

function signedRequest(payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  return new Request("https://app.example.com/api/webhooks/instagram", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "x-hub-signature-256": signature ?? `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` },
  });
}

const event = (message: Record<string, unknown>, sender = "visitor_1") => ({ object: "instagram", entry: [{ id: "ig_account", messaging: [{ sender: { id: sender }, recipient: { id: "ig_account" }, timestamp: 1_790_000_000_000, message: { mid: "mid_1", ...message } }] }] });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INSTAGRAM_APP_SECRET", secret);
  vi.stubEnv("INSTAGRAM_WEBHOOK_VERIFY_TOKEN", "verify-me");
  mocks.resolveBusinessByInstagramAccount.mockResolvedValue("biz_1");
  mocks.receiveInstagramMessage.mockResolvedValue({ duplicate: false, replyQueued: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("Instagram webhook", () => {
  it("echoes the challenge only for the configured verify token", async () => {
    const ok = await GET(new Request("https://app.example.com/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("123");
    const wrong = await GET(new Request("https://app.example.com/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=123"));
    expect(wrong.status).toBe(403);
  });

  it("rejects a payload with a bad signature", async () => {
    const response = await POST(signedRequest(event({ text: "Hi" }), "sha256=deadbeef"));
    expect(response.status).toBe(401);
    expect(mocks.receiveInstagramMessage).not.toHaveBeenCalled();
  });

  it("hands a text message to the business that owns the account", async () => {
    const response = await POST(signedRequest(event({ text: "Are you open Sunday?" })));
    expect(response.status).toBe(200);
    expect(mocks.resolveBusinessByInstagramAccount).toHaveBeenCalledWith(expect.anything(), "ig_account");
    expect(mocks.receiveInstagramMessage).toHaveBeenCalledWith(expect.anything(), { businessId: "biz_1", senderId: "visitor_1", providerMessageId: "mid_1", text: "Are you open Sunday?", sentAt: new Date(1_790_000_000_000) });
  });

  it("ignores echoes, deletions, attachments without text and unknown accounts", async () => {
    await POST(signedRequest(event({ text: "Our reply", is_echo: true })));
    await POST(signedRequest(event({ text: "gone", is_deleted: true })));
    await POST(signedRequest(event({})));
    mocks.resolveBusinessByInstagramAccount.mockResolvedValueOnce(null);
    const unknown = await POST(signedRequest(event({ text: "Hello?" })));
    expect(unknown.status).toBe(200);
    expect(mocks.receiveInstagramMessage).not.toHaveBeenCalled();
  });
});
