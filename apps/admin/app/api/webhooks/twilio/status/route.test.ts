import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ valid: vi.fn(), execute: vi.fn(), update: vi.fn() }));
vi.mock("@lobbystack/db", () => ({}));
vi.mock("@lobbystack/domain", () => ({ updateNotificationDeliveryStatus: mocks.update, updateOperatorNotificationDeliveryStatus: mocks.update, updateSmsDeliveryStatus: mocks.update }));
vi.mock("@lobbystack/shared", () => ({ normalizeTwilioFormFields: (params: URLSearchParams) => Object.fromEntries(params), resolveTwilioWebhookUrl: (url: string) => url, validateTwilioSignature: mocks.valid }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: { execute: mocks.execute } }) }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
import { POST } from "./route";

const request = () => new Request("https://admin.example.invalid/api/webhooks/twilio/status", { method: "POST", body: new URLSearchParams({ MessageSid: "SMfixture", MessageStatus: "delivered" }) });
beforeEach(() => { vi.clearAllMocks(); mocks.valid.mockResolvedValue(true); mocks.execute.mockResolvedValue({ rows: [{ business_id: "business" }] }); mocks.update.mockResolvedValue(undefined); });
it("acknowledges persisted statuses and rejects invalid signatures", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledOnce();
  mocks.valid.mockResolvedValue(false);
  expect((await POST(request())).status).toBe(401);
  expect(mocks.update).toHaveBeenCalledOnce();
});
it("does not acknowledge database or durable update failures", async () => {
  mocks.update.mockRejectedValue(new Error("private backend error"));
  const response = await POST(request());
  expect(response.status).toBe(503); expect(response.headers.get("retry-after")).toBe("60");
  expect(await response.text()).not.toContain("private backend error");
  mocks.execute.mockRejectedValue(new Error("connection unavailable"));
  expect((await POST(request())).status).toBe(503);
});
