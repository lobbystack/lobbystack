import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ valid: vi.fn(), execute: vi.fn(), decide: vi.fn(), forward: vi.fn(), prompt: vi.fn(), handover: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ decideStaffFirstCall: mocks.decide, resolveRefusedCallForward: mocks.forward, loadStaffPrompt: mocks.prompt, loadStaffFirstHandover: mocks.handover }));
vi.mock("@lobbystack/providers/twilio/webhookSecurity", () => ({ resolveTwilioWebhookUrl: (url: string) => url, validateTwilioSignature: mocks.valid }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: { execute: mocks.execute } }) }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
import { POST } from "./route";

const NUMBER = "+15815550100";
const STAFF = "+14165550142";
const CALLER = "+14165550134";
const BUSINESS = "11111111-1111-4111-8111-111111111111";
const post = async (step: string, fields: Record<string, string>, query = "") => {
  const response = await POST(new Request(`https://admin.example.invalid/api/webhooks/twilio/staff-first/${step}${query}`, { method: "POST", body: new URLSearchParams({ CallSid: "CAfixture", From: CALLER, ...fields }) }), { params: Promise.resolve({ step }) });
  return { status: response.status, body: await response.text() };
};
const routed = `?business=${BUSINESS}&called=%2B15815550100`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_PROJECT_ID", "proj_1");
  vi.stubEnv("APP_BASE_URL", "https://admin.example.invalid");
  mocks.valid.mockReturnValue(true);
  mocks.execute.mockResolvedValue({ rows: [{ business_id: BUSINESS }] });
  mocks.handover.mockResolvedValue({ locale: "en" });
});

it("refuses a request without a valid Twilio signature", async () => {
  mocks.valid.mockReturnValue(false);
  expect((await post("incoming", { To: NUMBER })).status).toBe(401);
  expect(mocks.decide).not.toHaveBeenCalled();
});

it("answers 404 for a step it doesn't know", async () => {
  expect((await post("nothing", {})).status).toBe(404);
});

it("rings the staff phone with the business and dialled number in the action URL", async () => {
  mocks.decide.mockResolvedValue({ action: "ring", locale: "en", phone: STAFF, ringSeconds: 15 });
  const { body } = await post("incoming", { To: NUMBER });
  expect(body).toContain(`>${STAFF}</Number>`);
  expect(body).toContain(`staff-result?business=${BUSINESS}&amp;called=%2B15815550100`);
  expect(mocks.decide).toHaveBeenCalledWith({}, { businessId: BUSINESS, e164: NUMBER, from: CALLER, forwardedFrom: undefined });
});

it("passes the forwarding line on, for the loop guard", async () => {
  mocks.decide.mockResolvedValue({ action: "receptionist", locale: "en" });
  await post("incoming", { To: NUMBER, ForwardedFrom: STAFF });
  expect(mocks.decide).toHaveBeenCalledWith({}, expect.objectContaining({ forwardedFrom: STAFF }));
});

it("doesn't treat a withheld number as a caller", async () => {
  mocks.decide.mockResolvedValue({ action: "receptionist", locale: "en" });
  await post("incoming", { To: NUMBER, From: "anonymous" });
  expect(mocks.decide).toHaveBeenCalledWith({}, expect.objectContaining({ from: undefined }));
});

it("goes straight to the receptionist outside the mode's hours", async () => {
  mocks.decide.mockResolvedValue({ action: "receptionist", locale: "en" });
  const { body } = await post("incoming", { To: NUMBER });
  expect(body).toContain(`<Sip>sip:proj_1@sip.api.openai.com;transport=tls;secure=true?X-LobbyStack-Called=tel:${NUMBER}</Sip>`);
});

it("rejects a blocked caller", async () => {
  mocks.decide.mockResolvedValue({ action: "reject" });
  expect((await post("incoming", { To: NUMBER })).body).toContain('<Reject reason="busy"/>');
});

it("gives a busy signal to a number no business owns", async () => {
  mocks.execute.mockResolvedValue({ rows: [{ business_id: null }] });
  expect((await post("incoming", { To: NUMBER })).body).toContain("<Reject");
  expect(mocks.decide).not.toHaveBeenCalled();
});

it("answers 500 when the decision fails, so Twilio tries the fallback URL", async () => {
  mocks.decide.mockRejectedValue(new Error("database down"));
  expect((await post("incoming", { To: NUMBER })).status).toBe(500);
});

it("reaches the receptionist from the fallback URL without touching the database", async () => {
  const { body } = await post("fallback", { To: NUMBER });
  expect(body).toContain(`X-LobbyStack-Called=tel:${NUMBER}`);
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("forwards as a refused call when the deployment has no OpenAI project", async () => {
  vi.stubEnv("OPENAI_PROJECT_ID", "");
  mocks.decide.mockResolvedValue({ action: "receptionist", locale: "en" });
  mocks.forward.mockResolvedValue(STAFF);
  expect((await post("incoming", { To: NUMBER })).body).toContain(`<Dial>${STAFF}</Dial>`);
});

it("reads the staff prompt with the caller's details", async () => {
  mocks.prompt.mockResolvedValue({ business: "Harbor Dental", locale: "en", caller: { name: "Ada" } });
  const { body } = await post("staff-prompt", {}, `?business=${BUSINESS}`);
  expect(body).toContain("Call for Harbor Dental from Ada.");
  expect(mocks.prompt).toHaveBeenCalledWith({}, { businessId: BUSINESS, from: CALLER });
});

it("hangs up the staff leg when the prompt can't load, which leaves the call to the receptionist", async () => {
  mocks.prompt.mockRejectedValue(new Error("database down"));
  expect((await post("staff-prompt", {}, `?business=${BUSINESS}`)).body).toContain("<Hangup/>");
});

it("bridges a press of 1 and hangs up anything else", async () => {
  expect((await post("staff-press", { Digits: "1" })).body).not.toContain("Hangup");
  expect((await post("staff-press", { Digits: "7" })).body).toContain("<Hangup/>");
});

it("ends the call after a staff member accepted", async () => {
  expect((await post("staff-result", { DialCallStatus: "completed", DialBridged: "true", DialCallDuration: "42" }, routed)).body).toContain("<Hangup/>");
});

it.each(["no-answer", "busy", "failed", "completed"])("hands a %s ring to the receptionist with the handover message", async (DialCallStatus) => {
  mocks.handover.mockResolvedValue({ locale: "en", message: "Connecting you now." });
  const { body } = await post("staff-result", { DialCallStatus, DialBridged: "false" }, routed);
  expect(body).toContain("Connecting you now.");
  expect(body).toContain(`X-LobbyStack-Called=tel:${NUMBER}`);
  expect(body).toContain(`referUrl="https://admin.example.invalid/api/webhooks/twilio/staff-first/refer"`);
});

it("does nothing when the caller left during the ring", async () => {
  expect((await post("staff-result", { DialCallStatus: "no-answer", DialBridged: "false", CallStatus: "completed" }, routed)).body).not.toContain("<Dial");
});

it("still reaches the receptionist when the handover can't load", async () => {
  mocks.handover.mockRejectedValue(new Error("database down"));
  expect((await post("staff-result", { DialCallStatus: "no-answer", DialBridged: "false" }, routed)).body).toContain("<Sip>");
});

it("ends the call when the receptionist's leg finished", async () => {
  expect((await post("receptionist-result", { DialCallStatus: "completed", DialBridged: "true" }, routed)).body).toContain("<Hangup/>");
  expect(mocks.forward).not.toHaveBeenCalled();
});

it.each([["503"], ["486"], [undefined]])("forwards a call GPT-Live refused with %s", async (code) => {
  mocks.forward.mockResolvedValue("+14165550111");
  const { body } = await post("receptionist-result", { DialCallStatus: "failed", DialBridged: "false", ...(code ? { DialSipResponseCode: code } : {}) }, routed);
  expect(body).toContain("<Dial>+14165550111</Dial>");
  expect(mocks.forward).toHaveBeenCalledWith({}, { businessId: BUSINESS, e164: NUMBER, forwardedFrom: undefined });
});

it("gives a busy signal when a refused call has nowhere to go", async () => {
  mocks.forward.mockResolvedValue(null);
  expect((await post("receptionist-result", { DialCallStatus: "failed", DialBridged: "false" }, routed)).body).toContain("<Reject");
});

it("rejects a caller GPT-Live blocked, without forwarding", async () => {
  expect((await post("receptionist-result", { DialCallStatus: "failed", DialBridged: "false", DialSipResponseCode: "603" }, routed)).body).toContain("<Reject");
  expect(mocks.forward).not.toHaveBeenCalled();
});

it("finds the business for a refused call that came through the fallback URL", async () => {
  mocks.forward.mockResolvedValue("+14165550111");
  await post("receptionist-result", { DialCallStatus: "failed", DialBridged: "false" }, "?called=%2B15815550100");
  expect(mocks.forward).toHaveBeenCalledWith({}, expect.objectContaining({ businessId: BUSINESS }));
});

it("dials the target the receptionist chose", async () => {
  expect((await post("refer", { ReferTransferTarget: "tel:+14165550142" })).body).toContain(`>${STAFF}</Dial>`);
});

it("won't dial a transfer target outside the transfer countries", async () => {
  expect((await post("refer", { ReferTransferTarget: "tel:+8613800138000" })).body).toContain("<Hangup/>");
});
