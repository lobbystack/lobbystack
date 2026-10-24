import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ valid: vi.fn(), execute: vi.fn(), fallback: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ resolveNumberFallback: mocks.fallback }));
vi.mock("@lobbystack/providers/twilio/webhookSecurity", () => ({ resolveTwilioWebhookUrl: (url: string) => url, validateTwilioSignature: mocks.valid }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: { execute: mocks.execute } }) }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
import { POST } from "./route";

const NUMBER = "+15815550100";
const request = (fields: Record<string, string>) => new Request("https://admin.example.invalid/api/webhooks/twilio/voice", { method: "POST", body: new URLSearchParams({ CallSid: "CAfixture", From: "+14165550134", ...fields }) });
const twiml = (verb: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${verb}</Response>`;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.valid.mockReturnValue(true);
  mocks.execute.mockResolvedValue({ rows: [{ business_id: "biz_1" }] });
});

it("forwards a call the receptionist refused at the plan's limit to where the business's fallback points", async () => {
  mocks.fallback.mockResolvedValue({ action: "forward", to: "+14165550111" });
  const response = await POST(request({ To: NUMBER }));
  expect(await response.text()).toBe(twiml("<Dial>+14165550111</Dial>"));
  expect(mocks.fallback).toHaveBeenCalledWith({}, { businessId: "biz_1", e164: NUMBER });
});

it("gives a busy signal when the business has nowhere to forward the call", async () => {
  mocks.fallback.mockResolvedValue({ action: "reject" });
  expect(await (await POST(request({ To: NUMBER }))).text()).toBe(twiml('<Reject reason="busy"/>'));
});

it("finds the dialled number in Called when a trunk failover addresses To to the SIP URI", async () => {
  mocks.fallback.mockResolvedValue({ action: "forward", to: "+14165550111" });
  await POST(request({ To: "sip:proj_1@sip.api.openai.com", Called: NUMBER }));
  expect(mocks.fallback).toHaveBeenCalledWith({}, { businessId: "biz_1", e164: NUMBER });
});

it("doesn't forward a call back to the line that forwarded it here", async () => {
  mocks.fallback.mockResolvedValue({ action: "forward", to: "+14165550111" });
  expect(await (await POST(request({ To: NUMBER, ForwardedFrom: "+14165550111" }))).text()).toBe(twiml('<Reject reason="busy"/>'));
});

it("gives a busy signal to a number no business owns", async () => {
  mocks.execute.mockResolvedValue({ rows: [{ business_id: null }] });
  expect(await (await POST(request({ To: NUMBER }))).text()).toBe(twiml('<Reject reason="busy"/>'));
  expect(mocks.fallback).not.toHaveBeenCalled();
});

it("refuses a request without a valid Twilio signature", async () => {
  mocks.valid.mockReturnValue(false);
  expect((await POST(request({ To: NUMBER }))).status).toBe(401);
  expect(mocks.fallback).not.toHaveBeenCalled();
});
