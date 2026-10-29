import { createHmac } from "node:crypto";

import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), webhook: vi.fn(), queue: vi.fn(), report: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ resolveBusinessByCalendarWebhook: mocks.resolve, getCalendarWebhook: mocks.webhook, queueCalendarWebhookSync: mocks.queue }));
vi.mock("@/lib/api-helpers", () => ({ asApiResponse: (error: unknown) => { mocks.report(error); return new Response("error", { status: 500 }); } }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));

import { SecretBox } from "@lobbystack/providers";
import { POST } from "./route";

const connectionId = "8c9d0e1f-2a3b-4c4d-8e5f-6a7b8c9d0e1f";
const secret = "webhook-secret";
const deliver = (payload: unknown, sign = secret, id = connectionId) => {
  const raw = JSON.stringify(payload);
  return POST(new Request(`https://app.example.test/api/webhooks/calcom/${id}`, { method: "POST", body: raw, headers: { "x-cal-signature-256": createHmac("sha256", sign).update(raw).digest("hex") } }), { params: Promise.resolve({ connectionId: id }) });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ENCRYPTION_KEY", "encryption-secret");
  mocks.resolve.mockResolvedValue("business");
  mocks.webhook.mockResolvedValue({ provider: "calcom", externalWebhookId: "11", encryptedWebhookSecret: new SecretBox("encryption-secret").encrypt(secret) });
  mocks.queue.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

it("queues a sync for a signed booking change, once per delivery", async () => {
  const payload = { triggerEvent: "BOOKING_CREATED", createdAt: "2026-11-01T12:00:00Z", payload: { uid: "b1" } };
  expect((await deliver(payload)).status).toBe(200);
  expect((await deliver(payload)).status).toBe(200);
  expect(mocks.queue).toHaveBeenCalledTimes(2);
  expect(mocks.queue.mock.calls[0]![1]).toEqual({ businessId: "business", connectionId, deliveryKey: expect.stringMatching(/^[a-f0-9]{32}$/) });
  // The same body gives the same key, so the outbox drops the second sync.
  expect(mocks.queue.mock.calls[1]![1].deliveryKey).toBe(mocks.queue.mock.calls[0]![1].deliveryKey);
});

it("refuses a delivery signed with another secret", async () => {
  expect((await deliver({ triggerEvent: "BOOKING_CREATED" }, "forged")).status).toBe(401);
  expect(mocks.queue).not.toHaveBeenCalled();
});

it("acknowledges deliveries it has nothing to do for", async () => {
  expect((await deliver({ triggerEvent: "MEETING_ENDED" })).status).toBe(200);
  mocks.resolve.mockResolvedValueOnce(null);
  expect((await deliver({ triggerEvent: "BOOKING_CREATED" })).status).toBe(200);
  expect(mocks.queue).not.toHaveBeenCalled();
  expect((await deliver({ triggerEvent: "BOOKING_CREATED" }, secret, "not-a-uuid")).status).toBe(404);
  expect(mocks.resolve).toHaveBeenCalledTimes(2);
});

it("answers 5xx when the sync can't be queued, so Cal.com delivers again", async () => {
  mocks.queue.mockRejectedValueOnce(new Error("database unavailable"));
  expect((await deliver({ triggerEvent: "BOOKING_CANCELLED" })).status).toBe(500);
  expect(mocks.report).toHaveBeenCalledOnce();
});
