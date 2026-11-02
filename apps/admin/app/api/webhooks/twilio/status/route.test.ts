import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ valid: vi.fn(), execute: vi.fn(), update: vi.fn(), callStatus: vi.fn() }));
vi.mock("@lobbystack/db", () => ({}));
vi.mock("@lobbystack/domain", () => ({ updateNotificationDeliveryStatus: mocks.update, updateOperatorNotificationDeliveryStatus: mocks.update, updateSmsDeliveryStatus: mocks.update, recordStaffCallStatus: mocks.callStatus }));
vi.mock("@lobbystack/providers/twilio/webhookSecurity", () => ({ resolveTwilioWebhookUrl: (url: string) => url, validateTwilioSignature: mocks.valid }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: { execute: mocks.execute } }) }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
import { POST } from "./route";

const request = () => new Request("https://admin.example.invalid/api/webhooks/twilio/status", { method: "POST", body: new URLSearchParams({ MessageSid: "SMfixture", MessageStatus: "delivered" }) });
beforeEach(() => { vi.clearAllMocks(); mocks.valid.mockReturnValue(true); mocks.execute.mockResolvedValue({ rows: [{ business_id: "business" }] }); mocks.update.mockResolvedValue(undefined); mocks.callStatus.mockResolvedValue(undefined); });
it("acknowledges persisted statuses and rejects invalid signatures", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.update).toHaveBeenCalledOnce();
  mocks.valid.mockReturnValue(false);
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

// A number's StatusCallback reports its calls here once it's off the trunk, as on a staff-first number.
const callRequest = (fields: Record<string, string> = {}) => new Request("https://admin.example.invalid/api/webhooks/twilio/status", { method: "POST", body: new URLSearchParams({ CallSid: "CAfixture", CallStatus: "completed", To: "+14165550100", Called: "+14165550100", From: "+14165550134", CallDuration: "42", ...fields }) });
it("records a voice status callback and leaves the text handlers alone", async () => {
  const response = await POST(callRequest());
  expect(response.status).toBe(200);
  expect(mocks.callStatus).toHaveBeenCalledExactlyOnceWith({}, { businessId: "business", providerCallId: "CAfixture", status: "completed" });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("acknowledges a voice status callback for a number no business holds", async () => {
  mocks.execute.mockResolvedValue({ rows: [{ business_id: null }] });
  expect((await POST(callRequest())).status).toBe(200);
  expect(mocks.callStatus).not.toHaveBeenCalled();
});
it("rejects a voice status callback with a bad signature, and asks for a retry when saving fails", async () => {
  mocks.valid.mockReturnValue(false);
  expect((await POST(callRequest())).status).toBe(401);
  expect(mocks.callStatus).not.toHaveBeenCalled();
  mocks.valid.mockReturnValue(true);
  mocks.callStatus.mockRejectedValue(new Error("connection unavailable"));
  expect((await POST(callRequest())).status).toBe(503);
});
it("still refuses a text status callback with no status", async () => {
  const response = await POST(new Request("https://admin.example.invalid/api/webhooks/twilio/status", { method: "POST", body: new URLSearchParams({ MessageSid: "SMfixture" }) }));
  expect(response.status).toBe(503);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.callStatus).not.toHaveBeenCalled();
});
