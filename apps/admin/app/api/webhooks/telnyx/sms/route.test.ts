import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signed: vi.fn(), receive: vi.fn(), status: vi.fn(), alertSend: vi.fn() }));
vi.mock("@/lib/telnyx-webhook", () => ({ readSignedTelnyxWebhook: async (request: Request) => ({ rawBody: await request.text(), signed: mocks.signed() }) }));
vi.mock("@/lib/carrier-webhooks", () => ({ receiveCarrierSms: mocks.receive, applyCarrierSmsStatus: mocks.status }));
vi.mock("@/lib/telephony", () => ({ getTelephony: () => ({ alertSms: { from: "+18885550100", sendSms: mocks.alertSend } }) }));
import { POST } from "./route";

const SHARED = "+18885550100";
const request = (eventType: string, payload: Record<string, unknown>) => new Request("https://admin.example.invalid/api/webhooks/telnyx/sms", { method: "POST", body: JSON.stringify({ data: { event_type: eventType, id: "evt_1", payload } }) });
const inbound = (to: string, text: string) => request("message.received", { id: "msg_in", from: { phone_number: "+14165550134" }, to: [{ phone_number: to }], text });
beforeEach(() => { vi.clearAllMocks(); mocks.signed.mockReturnValue(true); mocks.receive.mockResolvedValue({ reply: null }); });

it("records a text to a business's Telnyx number", async () => {
  expect((await POST(inbound("+12125550100", "Hi"))).status).toBe(200);
  expect(mocks.receive).toHaveBeenCalledWith({ kind: "sms.received", providerMessageId: "msg_in", from: "+14165550134", to: "+12125550100", body: "Hi" }, "telnyx");
  expect(mocks.alertSend).not.toHaveBeenCalled();
});

it("sends the shared sender's HELP reply through the API, since Telnyx takes no reply in the response", async () => {
  mocks.receive.mockResolvedValue({ reply: "LobbyStack sends appointment texts." });
  await POST(inbound(SHARED, "HELP"));
  expect(mocks.alertSend).toHaveBeenCalledWith({ from: SHARED, to: "+14165550134", body: "LobbyStack sends appointment texts." });
});

it("applies a status that came to the profile's webhook", async () => {
  await POST(request("message.finalized", { id: "msg_out", to: [{ phone_number: "+14165550134", status: "delivery_failed" }] }));
  expect(mocks.status).toHaveBeenCalledWith(expect.objectContaining({ providerMessageId: "msg_out", status: "undelivered" }), "telnyx", expect.any(URLSearchParams));
});

it("refuses an unsigned webhook and asks Telnyx to retry a failed one", async () => {
  mocks.signed.mockReturnValue(false);
  expect((await POST(inbound("+12125550100", "Hi"))).status).toBe(401);
  mocks.signed.mockReturnValue(true);
  mocks.receive.mockRejectedValue(new Error("db down"));
  expect((await POST(inbound("+12125550100", "Hi"))).status).toBe(503);
});
