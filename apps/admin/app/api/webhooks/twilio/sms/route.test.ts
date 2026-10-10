import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ valid: vi.fn(), execute: vi.fn(), inbound: vi.fn(), shared: vi.fn(), isShared: vi.fn() }));
vi.mock("@lobbystack/db", () => ({}));
vi.mock("@lobbystack/domain", () => ({ receiveInboundSms: mocks.inbound, receiveSharedSenderSms: mocks.shared, isSharedSmsSender: mocks.isShared }));
vi.mock("@lobbystack/providers/twilio/webhookSecurity", () => ({ resolveTwilioWebhookUrl: (url: string) => url, validateTwilioSignature: mocks.valid }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: { execute: mocks.execute } }) }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
import { POST } from "./route";

const SHARED = "+18446562290";
const request = (fields: Record<string, string>) => new Request("https://admin.example.invalid/api/webhooks/twilio/sms", { method: "POST", body: new URLSearchParams({ MessageSid: "SMfixture", From: "+14165550100", ...fields }) });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.valid.mockReturnValue(true);
  mocks.execute.mockResolvedValue({ rows: [{ business_id: null }] });
  mocks.isShared.mockImplementation((to: string) => to === SHARED);
  mocks.shared.mockResolvedValue({ reply: null, contactsChanged: 0 });
});

it("hands a text to the shared sender to the shared-sender handler and replies with its answer", async () => {
  mocks.shared.mockResolvedValue({ reply: "LobbyStack: Help & info <here>.", contactsChanged: 0 });
  const response = await POST(request({ To: SHARED, Body: "HELP", OptOutType: "HELP" }));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Message>LobbyStack: Help &amp; info &lt;here&gt;.</Message></Response>");
  expect(mocks.shared).toHaveBeenCalledWith({}, { from: "+14165550100", body: "HELP", optOutType: "HELP" });
  expect(mocks.inbound).not.toHaveBeenCalled();
});

it("sends no reply to a STOP, and ignores a number no business owns that isn't the shared sender", async () => {
  expect(await (await POST(request({ To: SHARED, Body: "STOP" }))).text()).toBe("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
  expect(mocks.shared).toHaveBeenCalledWith({}, { from: "+14165550100", body: "STOP" });
  mocks.shared.mockClear();
  expect((await POST(request({ To: "+14165550999", Body: "STOP" }))).status).toBe(200);
  expect(mocks.shared).not.toHaveBeenCalled();
  expect(mocks.inbound).not.toHaveBeenCalled();
});

it("keeps a business's own number on its conversation path", async () => {
  mocks.execute.mockResolvedValue({ rows: [{ business_id: "business" }] });
  await POST(request({ To: "+14165550123", Body: "Hi" }));
  expect(mocks.inbound).toHaveBeenCalledWith({}, expect.objectContaining({ businessId: "business", to: "+14165550123", body: "Hi" }));
  expect(mocks.shared).not.toHaveBeenCalled();
});

it("fails so Twilio can retry when the opt-out can't be saved", async () => {
  mocks.shared.mockRejectedValue(new Error("database unavailable"));
  expect((await POST(request({ To: SHARED, Body: "STOP" }))).status).toBe(500);
});

it("checks a text to the shared sender from its separate Twilio account with the alert signing key", async () => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACmain");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "main-token");
  vi.stubEnv("TWILIO_ALERT_ACCOUNT_SID", "ACalert");
  vi.stubEnv("TWILIO_ALERT_SMS_FROM", SHARED);
  vi.stubEnv("TWILIO_ALERT_WEBHOOK_KEY_ID", "webhooks_alert");
  vi.stubEnv("TWILIO_ALERT_WEBHOOK_SECRET", "alert-signing-secret");
  const signed = (fields: Record<string, string>, keySid?: string) => new Request("https://admin.example.invalid/api/webhooks/twilio/sms", { method: "POST", headers: keySid ? { "x-twilio-signature-key-sid": keySid } : {}, body: new URLSearchParams({ MessageSid: "SMfixture", From: "+14165550100", ...fields }) });
  try {
    expect((await POST(signed({ AccountSid: "ACalert", To: SHARED, Body: "STOP" }, "webhooks_alert"))).status).toBe(200);
    expect(mocks.valid).toHaveBeenLastCalledWith(expect.objectContaining({ authToken: "alert-signing-secret" }));
    expect(mocks.shared).toHaveBeenCalledWith({}, { from: "+14165550100", body: "STOP" });
    // The alert account can't sign for a business's own number, and the main account keeps its auth token.
    await POST(signed({ AccountSid: "ACalert", To: "+14165550123", Body: "Hi" }, "webhooks_alert"));
    expect(mocks.valid).toHaveBeenLastCalledWith(expect.objectContaining({ authToken: undefined }));
    await POST(signed({ AccountSid: "ACmain", To: "+14165550123", Body: "Hi" }));
    expect(mocks.valid).toHaveBeenLastCalledWith(expect.objectContaining({ authToken: "main-token" }));
  } finally {
    vi.unstubAllEnvs();
  }
});
