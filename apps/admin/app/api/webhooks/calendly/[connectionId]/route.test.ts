import { createHmac } from "node:crypto";

import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), webhook: vi.fn(), queue: vi.fn(), report: vi.fn(), clientRate: vi.fn(), connectionRate: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ resolveBusinessByCalendarWebhook: mocks.resolve, getCalendarWebhook: mocks.webhook, queueCalendarWebhookSync: mocks.queue }));
vi.mock("@/lib/api-helpers", () => ({ asApiResponse: (error: unknown) => { mocks.report(error); return new Response("error", { status: 500 }); }, jsonError: (message: string, status = 400) => Response.json({ error: message }, { status }) }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
vi.mock("@/lib/calendar-webhook-limit", () => ({ enforceCalendarWebhookClientLimit: mocks.clientRate, enforceCalendarWebhookConnectionLimit: mocks.connectionRate }));
vi.mock("@/lib/trusted-client-ip", () => ({ trustedClientIp: () => "203.0.113.7" }));

import { SecretBox } from "@lobbystack/providers";
import { POST } from "./route";

const connectionId = "8c9d0e1f-2a3b-4c4d-8e5f-6a7b8c9d0e1f";
const secret = "webhook-secret";
const signature = (raw: string, key: string, stamp: number) => `t=${stamp},v1=${createHmac("sha256", key).update(`${stamp}.${raw}`).digest("hex")}`;
const deliver = (payload: unknown, sign = secret, id = connectionId, stamp = Math.floor(Date.now() / 1000)) => {
  const raw = JSON.stringify(payload);
  return POST(new Request(`https://app.example.test/api/webhooks/calendly/${id}`, { method: "POST", body: raw, headers: { "calendly-webhook-signature": signature(raw, sign, stamp) } }), { params: Promise.resolve({ connectionId: id }) });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ENCRYPTION_KEY", "encryption-secret");
  vi.stubEnv("CALENDLY_CLIENT_ID", "client");
  vi.stubEnv("CALENDLY_CLIENT_SECRET", "secret");
  vi.stubEnv("CALENDLY_REDIRECT_URI", "https://app.example.test/api/calendar/calendly/callback");
  vi.stubEnv("CALENDLY_WEBHOOK_SIGNING_KEY", "app-signing-key");
  vi.stubEnv("CALENDLY_PLACEHOLDER_EMAIL_DOMAIN", "noreply.example.test");
  mocks.resolve.mockResolvedValue("business");
  mocks.webhook.mockResolvedValue({ provider: "calendly", externalWebhookId: "11", encryptedWebhookSecret: new SecretBox("encryption-secret").encrypt(secret) });
  mocks.queue.mockResolvedValue(undefined);
  mocks.clientRate.mockResolvedValue({ allowed: true });
  mocks.connectionRate.mockResolvedValue({ allowed: true });
});
afterEach(() => vi.unstubAllEnvs());

it("queues a sync for a signed booking change, once per delivery", async () => {
  const payload = { event: "invitee.created", created_at: "2026-11-01T12:00:00Z", payload: { uri: "invitee" } };
  expect((await deliver(payload)).status).toBe(200);
  expect((await deliver(payload)).status).toBe(200);
  expect(mocks.queue).toHaveBeenCalledTimes(2);
  expect(mocks.queue.mock.calls[0]![1]).toEqual({ businessId: "business", connectionId, deliveryKey: expect.stringMatching(/^[a-f0-9]{32}$/) });
  // The same body gives the same key, so the outbox drops the second sync.
  expect(mocks.queue.mock.calls[1]![1].deliveryKey).toBe(mocks.queue.mock.calls[0]![1].deliveryKey);
});

it("accepts a delivery signed with the OAuth app's key", async () => {
  expect((await deliver({ event: "invitee.created" }, "app-signing-key")).status).toBe(200);
  expect(mocks.queue).toHaveBeenCalledOnce();
});

it("refuses a replayed delivery, and a Cal.com connection's id", async () => {
  expect((await deliver({ event: "invitee.created" }, secret, connectionId, Math.floor(Date.now() / 1000) - 600)).status).toBe(401);
  mocks.webhook.mockResolvedValueOnce({ provider: "calcom", externalWebhookId: "11", encryptedWebhookSecret: new SecretBox("encryption-secret").encrypt(secret) });
  expect((await deliver({ event: "invitee.created" })).status).toBe(200);
  expect(mocks.queue).not.toHaveBeenCalled();
});

it("refuses a delivery signed with another secret", async () => {
  expect((await deliver({ event: "invitee.created" }, "forged")).status).toBe(401);
  expect(mocks.queue).not.toHaveBeenCalled();
});

it("acknowledges deliveries it has nothing to do for", async () => {
  expect((await deliver({ event: "invitee_no_show.created" })).status).toBe(200);
  mocks.resolve.mockResolvedValueOnce(null);
  expect((await deliver({ event: "invitee.created" })).status).toBe(200);
  expect(mocks.queue).not.toHaveBeenCalled();
  expect((await deliver({ event: "invitee.created" }, secret, "not-a-uuid")).status).toBe(404);
  expect(mocks.resolve).toHaveBeenCalledTimes(2);
});

it("answers 5xx when the sync can't be queued, so Calendly delivers again", async () => {
  mocks.queue.mockRejectedValueOnce(new Error("database unavailable"));
  expect((await deliver({ event: "invitee.canceled" })).status).toBe(500);
  expect(mocks.report).toHaveBeenCalledOnce();
});

it("rate limits each client before reading the body or the database", async () => {
  mocks.clientRate.mockResolvedValueOnce({ allowed: false, status: 429, reason: "rate_limit_ip_minute" });
  expect((await deliver({ event: "invitee.created" })).status).toBe(429);
  expect(mocks.clientRate).toHaveBeenCalledWith({ ip: "203.0.113.7" });
  expect(mocks.resolve).not.toHaveBeenCalled();
});

it("counts a delivery against its connection only once the signature checks out", async () => {
  expect((await deliver({ event: "invitee.created" }, "forged")).status).toBe(401);
  expect(mocks.connectionRate).not.toHaveBeenCalled();
  mocks.connectionRate.mockResolvedValueOnce({ allowed: false, status: 429, reason: "rate_limit_connection_minute" });
  expect((await deliver({ event: "invitee.created" })).status).toBe(429);
  expect(mocks.connectionRate).toHaveBeenCalledWith({ connectionId });
  expect(mocks.queue).not.toHaveBeenCalled();
});

it("refuses a body over 256 KB from its declared length or as it streams, before any lookup", async () => {
  const declared = new Request(`https://app.example.test/api/webhooks/calendly/${connectionId}`, { method: "POST", body: "{}", headers: { "content-length": String(300 * 1024) } });
  expect((await POST(declared, { params: Promise.resolve({ connectionId }) })).status).toBe(413);
  const streamed = new Request(`https://app.example.test/api/webhooks/calendly/${connectionId}`, { method: "POST", body: new ReadableStream({ start(controller) { for (let index = 0; index < 5; index++) controller.enqueue(new Uint8Array(64 * 1024)); controller.close(); } }), duplex: "half" } as RequestInit);
  expect((await POST(streamed, { params: Promise.resolve({ connectionId }) })).status).toBe(413);
  expect(mocks.resolve).not.toHaveBeenCalled();
});
