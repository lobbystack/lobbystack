import { demoSnapshot, type AppointmentChangeVerificationMode, type BusinessContextSnapshot } from "@lobbystack/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/domain", async () => ({
  countKnowledgeTokens: (await import("../../domain/src/knowledgeRanking")).countKnowledgeTokens,
  KNOWLEDGE_SEARCH_TOKEN_BUDGET: 3000,
  knowledgeQueryTerms: (await import("../../domain/src/knowledgeRanking")).knowledgeQueryTerms,
  verifyCallerForChange: vi.fn(),
  verifyCallerChangePasscode: vi.fn(),
  verifyCallerChangeCode: vi.fn(),
  issueAppointmentChangeOtp: vi.fn(),
}));

import { verifyCallerChangePasscode, verifyCallerForChange } from "@lobbystack/domain";
import { receptionistCapabilities, type Conversation } from "./capabilities";
import { createReceptionistTools, type CallControl, type KeypadPasscodeCheck } from "./tools";

type Execute = (input: object, options: object) => Promise<Record<string, unknown>>;

const callerPhone = "+14165550100";
const policy = (verificationMode: AppointmentChangeVerificationMode) => ({ appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode } });
const snapshotFor = (verificationMode: AppointmentChangeVerificationMode, extra: Partial<BusinessContextSnapshot> = {}): BusinessContextSnapshot => ({ ...demoSnapshot, timezone: "America/Toronto", ...policy(verificationMode), ...extra });

function tools(options: { verificationMode?: AppointmentChangeVerificationMode; callControl?: CallControl; snapshot?: Partial<BusinessContextSnapshot> } = {}) {
  const set = createReceptionistTools({
    domain: { db: {} as never },
    channel: "voice",
    callId: "call_1",
    callerPhone,
    snapshot: snapshotFor(options.verificationMode ?? "passcode_required", options.snapshot),
    ...(options.callControl ? { callControl: options.callControl } : {}),
  });
  const run = (name: string, input: object) => (set[name]!.execute! as Execute)(input, { toolCallId: "1", messages: [] });
  return { set, run };
}

// A phone call's controls, holding the PIN check the tool hands over.
function keypadCall(started = true) {
  const checks: KeypadPasscodeCheck[] = [];
  const callControl: CallControl = {
    hangup: vi.fn(async () => undefined),
    collectPasscode: vi.fn(async (check: KeypadPasscodeCheck) => { checks.push(check); return started; }),
  };
  return { callControl, checks };
}

const CHANGE_TOOLS = ["lookupAppointmentForChange", "verifyAppointmentForChange", "cancelAppointment", "rescheduleAppointment"];

beforeEach(() => { vi.clearAllMocks(); });

describe("appointment change tools when the business requires a keypad PIN", () => {
  it("offers the keypad PIN check instead of texted codes on a call that takes one", () => {
    const { set } = tools({ callControl: keypadCall().callControl });
    for (const name of [...CHANGE_TOOLS, "requestKeypadPasscode"]) expect(set).toHaveProperty(name);
    expect(set).not.toHaveProperty("sendAppointmentChangeOtp");
    expect(set).not.toHaveProperty("verifyAppointmentChangeOtp");
  });

  it("offers only the request to the team on a call that can't take one", () => {
    for (const callControl of [undefined, { hangup: vi.fn(async () => undefined) }]) {
      const { set } = tools(callControl ? { callControl } : {});
      for (const name of [...CHANGE_TOOLS, "requestKeypadPasscode", "sendAppointmentChangeOtp"]) expect(set).not.toHaveProperty(name);
      expect(set).toHaveProperty("requestAppointmentCancellation");
    }
  });

  it("keeps texted codes for the other checks", () => {
    for (const verificationMode of ["otp_required", "phone_match_and_facts"] as const) {
      const { set } = tools({ verificationMode, callControl: keypadCall().callControl });
      expect(set).toHaveProperty("sendAppointmentChangeOtp");
      expect(set).not.toHaveProperty("requestKeypadPasscode");
    }
  });

  it("hands the call a check that verifies the PIN, without giving the agent the PIN", async () => {
    const { callControl, checks } = keypadCall();
    const { run } = tools({ callControl });
    await expect(run("requestKeypadPasscode", { verificationId: "ver_1" })).resolves.toEqual({ ok: true, waitingForKeypad: true });
    expect(verifyCallerChangePasscode).not.toHaveBeenCalled();

    const verified = { ok: true, status: "passcode_verified", verificationId: "ver_1", appointmentId: "apt_1", action: "cancel" };
    vi.mocked(verifyCallerChangePasscode).mockResolvedValueOnce({ ...verified, smsConsentOnFile: "subscribed" } as never);
    await expect(checks[0]!("480613")).resolves.toEqual({ status: "accepted", result: { ...verified, smsConsentOnFile: "subscribed" } });
    expect(verifyCallerChangePasscode).toHaveBeenCalledWith(expect.anything(), { businessId: demoSnapshot.businessId, verificationId: "ver_1", passcode: "480613" });
  });

  it("tells the call whether the caller can try again", async () => {
    const { callControl, checks } = keypadCall();
    await tools({ callControl }).run("requestKeypadPasscode", { verificationId: "ver_1" });
    const rejected = { ok: false, status: "passcode_pending", verificationId: "ver_1", appointmentId: "apt_1", action: "cancel", attemptsLeft: 2, reason: "The PIN didn't match." };
    vi.mocked(verifyCallerChangePasscode).mockResolvedValueOnce(rejected as never);
    await expect(checks[0]!("111222")).resolves.toEqual({ status: "retry", attemptsLeft: 2, reason: "The PIN didn't match.", result: rejected });

    for (const result of [
      { ok: false, status: "failed", verificationId: "ver_1", attemptsLeft: 0, reason: "The PIN didn't match, and there are no tries left on this call." },
      { ok: false, status: "passcode_locked", verificationId: "ver_1", reason: "The PIN is locked." },
      { ok: false, status: "expired", verificationId: "ver_1", reason: "The verification session has expired. Verify the appointment again." },
    ]) {
      vi.mocked(verifyCallerChangePasscode).mockResolvedValueOnce(result as never);
      await expect(checks[0]!("111222")).resolves.toMatchObject({ status: "failed", reason: result.reason, result });
    }
  });

  it("leaves out whether the caller gets texts when the business can't text them", async () => {
    const { callControl, checks } = keypadCall();
    await tools({ callControl, snapshot: { contactChannels: {} } }).run("requestKeypadPasscode", { verificationId: "ver_1" });
    vi.mocked(verifyCallerChangePasscode).mockResolvedValueOnce({ ok: true, status: "passcode_verified", verificationId: "ver_1", smsConsentOnFile: "subscribed" } as never);
    expect((await checks[0]!("480613")).result).not.toHaveProperty("smsConsentOnFile");
  });

  // An accepted PIN counts only on the call it was typed on.
  it("verifies the change for this call", async () => {
    vi.mocked(verifyCallerForChange).mockResolvedValueOnce({ ok: true, verified: false, requiresOtp: false, requiresPasscode: true, verificationId: "ver_1", appointmentId: "apt_1", status: "passcode_pending" } as never);
    await tools({ callControl: keypadCall().callControl }).run("verifyAppointmentForChange", { action: "cancel", serviceName: "Cut" });
    expect(verifyCallerForChange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ callerPhone, callId: "call_1", action: "cancel" }));
  });

  it("says the change can't be verified when the call can't take a PIN anymore", async () => {
    await expect(tools({ callControl: keypadCall(false).callControl }).run("requestKeypadPasscode", { verificationId: "ver_1" })).resolves.toMatchObject({ ok: false });
  });
});

describe("the keypad PIN in the receptionist's capabilities", () => {
  const offers = (verificationMode: AppointmentChangeVerificationMode, conversation: Partial<Conversation>) => receptionistCapabilities(snapshotFor(verificationMode), { channel: "voice", ...conversation }).tools;

  it("needs a phone call that takes a PIN when the business requires one", () => {
    const keypad = keypadCall().callControl;
    expect(offers("passcode_required", { callerPhone })).not.toContain("cancelAppointment");
    expect(offers("passcode_required", { callerPhone, callControl: { hangup: vi.fn(async () => undefined) } })).not.toContain("requestKeypadPasscode");
    expect(offers("passcode_required", { callerPhone, callControl: keypad })).toEqual(expect.arrayContaining(["cancelAppointment", "requestKeypadPasscode"]));
    expect(offers("passcode_required", { callControl: keypad })).not.toContain("requestKeypadPasscode");
    expect(offers("passcode_required", { callerPhone, callControl: keypad, intakeOnly: true })).not.toContain("requestKeypadPasscode");
  });

  it("leaves the other checks as they were", () => {
    for (const verificationMode of ["phone_match_and_facts", "otp_required"] as const) {
      expect(offers(verificationMode, { callerPhone })).toContain("cancelAppointment");
      expect(offers(verificationMode, { callerPhone, callControl: keypadCall().callControl })).not.toContain("requestKeypadPasscode");
    }
  });
});
