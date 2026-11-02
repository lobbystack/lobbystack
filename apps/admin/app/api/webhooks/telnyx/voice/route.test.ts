import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signed: vi.fn(), fallback: vi.fn() }));
vi.mock("@/lib/telnyx-webhook", () => ({ readSignedTelnyxWebhook: async (request: Request) => ({ rawBody: await request.text(), signed: mocks.signed() }) }));
vi.mock("@/lib/carrier-webhooks", () => ({ fallbackForCall: mocks.fallback }));
import { POST } from "./route";

const request = (fields: Record<string, string>, query = "") => new Request(`https://admin.example.invalid/api/webhooks/telnyx/voice${query}`, { method: "POST", body: new URLSearchParams({ CallSid: "v3:call", From: "+14165550134", ...fields }) });
const texml = (verb: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${verb}</Response>`;
beforeEach(() => { vi.clearAllMocks(); mocks.signed.mockReturnValue(true); });
afterEach(() => vi.unstubAllEnvs());

it("forwards a call in fallback mode where the business's fallback points", async () => {
  mocks.fallback.mockResolvedValue({ action: "forward", to: "+14165550111" });
  expect(await (await POST(request({ To: "+12125550100", ToSipUri: "+12125550100@sip.telnyx.com" }))).text()).toBe(texml("<Dial><Number>+14165550111</Number></Dial>"));
  expect(mocks.fallback).toHaveBeenCalledWith({ dialled: ["+12125550100"], from: "+14165550134" });
});

it("gives a busy signal when there's nowhere to forward", async () => {
  mocks.fallback.mockResolvedValue({ action: "reject" });
  expect(await (await POST(request({ To: "+12125550100" }))).text()).toBe(texml('<Reject reason="busy"/>'));
});

it("takes an unsigned request only with the TeXML secret in its URL", async () => {
  vi.stubEnv("TELNYX_TEXML_WEBHOOK_SECRET", "s3cret");
  mocks.signed.mockReturnValue(false);
  mocks.fallback.mockResolvedValue({ action: "reject" });
  expect((await POST(request({ To: "+12125550100" }))).status).toBe(401);
  expect((await POST(request({ To: "+12125550100" }, "?key=wrong"))).status).toBe(401);
  expect((await POST(request({ To: "+12125550100" }, "?key=s3cret"))).status).toBe(200);
  expect(mocks.fallback).toHaveBeenCalledOnce();
});
