import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createVerification: vi.fn(), verifyOtp: vi.fn(), cancelForCaller: vi.fn() }));
vi.mock("./appointmentChanges", () => ({ createAppointmentChangeVerification: mocks.createVerification, verifyAppointmentChangeOtp: mocks.verifyOtp }));
vi.mock("./booking", () => ({ bookAppointment: vi.fn(), findAvailability: vi.fn(), checkAvailability: vi.fn(), cancelAppointmentForCaller: mocks.cancelForCaller, rescheduleAppointmentForCaller: vi.fn() }));

import { contacts, smsConsentEvents, type DatabaseTransaction } from "@lobbystack/db";

import { recordSmsConsentAnswerInTransaction, smsConsentOnFile, type SmsConsentAnswer } from "./contactSmsConsent";
import { cancelForCaller, verifyCallerChangeCode, verifyCallerForChange } from "./receptionistActions";

const context = { db: {} as never };

/** A transaction that records the contact update and the consent event. */
function recordingTx() {
  const writes: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const tx = {
    update: (table: unknown) => ({ set: (values: Record<string, unknown>) => ({ where: async () => { writes.push({ table, values }); } }) }),
    insert: (table: unknown) => ({ values: async (values: Record<string, unknown>) => { writes.push({ table, values }); } }),
  } as unknown as DatabaseTransaction;
  return { tx, writes };
}

async function answer(contact: { smsConsentStatus: string | null; operatorBlockedAt: Date | null } | undefined, value: SmsConsentAnswer | undefined) {
  const { tx, writes } = recordingTx();
  const onFile = await recordSmsConsentAnswerInTransaction(tx, { businessId: "biz_1", contactId: "contact_1", phone: "+14165550100", contact, answer: value, source: "appointment_booking" });
  return { onFile, writes };
}

const never = { smsConsentStatus: null, operatorBlockedAt: null };

beforeEach(() => { vi.clearAllMocks(); });

describe("smsConsentOnFile", () => {
  it("reads the contact's answer, and a blocked contact as opted out", () => {
    expect(smsConsentOnFile(undefined)).toBe("not_asked");
    expect(smsConsentOnFile(never)).toBe("not_asked");
    expect(smsConsentOnFile({ smsConsentStatus: "subscribed", operatorBlockedAt: null })).toBe("subscribed");
    expect(smsConsentOnFile({ smsConsentStatus: "declined", operatorBlockedAt: null })).toBe("declined");
    expect(smsConsentOnFile({ smsConsentStatus: "opted_out", operatorBlockedAt: null })).toBe("opted_out");
    expect(smsConsentOnFile({ smsConsentStatus: "subscribed", operatorBlockedAt: new Date() })).toBe("opted_out");
  });
});

describe("recordSmsConsentAnswerInTransaction", () => {
  it.each([["agreed", "subscribed", "reminder_consent_granted"], ["declined", "declined", "reminder_consent_declined"]] as const)("stores %s as %s with a %s event", async (value, status, action) => {
    for (const contact of [undefined, never, { smsConsentStatus: "subscribed", operatorBlockedAt: null }, { smsConsentStatus: "declined", operatorBlockedAt: null }]) {
      const { onFile, writes } = await answer(contact, value);
      expect(onFile).toBe(status);
      expect(writes).toEqual([
        { table: contacts, values: expect.objectContaining({ smsConsentStatus: status, smsConsentSource: "appointment_booking" }) },
        { table: smsConsentEvents, values: { businessId: "biz_1", contactId: "contact_1", phone: "+14165550100", recipientType: "contact", action, source: "appointment_booking" } },
      ]);
    }
  });

  it("changes nothing when the agent didn't ask", async () => {
    for (const value of ["not_asked", undefined] as const) {
      expect(await answer({ smsConsentStatus: "declined", operatorBlockedAt: null }, value)).toEqual({ onFile: "declined", writes: [] });
    }
  });

  it("never overrides STOP or the business's block", async () => {
    for (const value of ["agreed", "declined"] as const) {
      expect(await answer({ smsConsentStatus: "opted_out", operatorBlockedAt: null }, value)).toEqual({ onFile: "opted_out", writes: [] });
      expect(await answer({ smsConsentStatus: null, operatorBlockedAt: new Date() }, value)).toEqual({ onFile: "opted_out", writes: [] });
    }
  });
});

describe("the answer on file during a self-service cancellation", () => {
  it("is shown only once the cancellation is verified", async () => {
    mocks.createVerification.mockResolvedValueOnce({ verificationId: "ver_1", appointmentId: "apt_1", contactId: "contact_1", status: "facts_verified", expiresAt: "", smsConsent: "declined" });
    await expect(verifyCallerForChange(context, { businessId: "biz_1", callerPhone: "+14165550100", action: "cancel", serviceName: "Cut" })).resolves.toMatchObject({ verified: true, smsConsentOnFile: "declined" });

    mocks.createVerification.mockResolvedValueOnce({ verificationId: "ver_2", appointmentId: "apt_1", contactId: "contact_1", status: "otp_pending", expiresAt: "", smsConsent: "subscribed" });
    expect(await verifyCallerForChange(context, { businessId: "biz_1", callerPhone: "+14165550100", action: "cancel", serviceName: "Cut" })).not.toHaveProperty("smsConsentOnFile");

    mocks.createVerification.mockResolvedValueOnce({ verificationId: "ver_3", appointmentId: "apt_1", contactId: "contact_1", status: "facts_verified", expiresAt: "", smsConsent: "subscribed" });
    expect(await verifyCallerForChange(context, { businessId: "biz_1", callerPhone: "+14165550100", action: "reschedule", serviceName: "Cut" })).not.toHaveProperty("smsConsentOnFile");
  });

  it("comes with a matching code, and not with a wrong one", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ ok: true, status: "otp_verified", verificationId: "ver_1", smsConsent: "not_asked" });
    await expect(verifyCallerChangeCode(context, { businessId: "biz_1", verificationId: "ver_1", code: "123456" })).resolves.toEqual({ ok: true, status: "otp_verified", verificationId: "ver_1", smsConsentOnFile: "not_asked" });
    mocks.verifyOtp.mockResolvedValueOnce({ ok: false, status: "otp_sent", verificationId: "ver_1", reason: "The verification code is invalid." });
    await expect(verifyCallerChangeCode(context, { businessId: "biz_1", verificationId: "ver_1", code: "000000" })).resolves.toEqual({ ok: false, status: "otp_sent", verificationId: "ver_1", reason: "The verification code is invalid." });
  });

  it("comes back with the cancellation", async () => {
    mocks.cancelForCaller.mockResolvedValueOnce({ appointmentId: "apt_1", serviceId: "svc_1", startsAt: new Date("2030-01-08T15:00:00Z"), endsAt: new Date("2030-01-08T15:30:00Z"), smsConsentOnFile: "subscribed" });
    await expect(cancelForCaller(context, { businessId: "biz_1", callerPhone: "+14165550100", appointmentId: "apt_1", verificationId: "ver_1", finalConfirmation: true })).resolves.toEqual({ ok: true, appointmentId: "apt_1", startsAt: "2030-01-08T15:00:00.000Z", status: "canceled", smsConsentOnFile: "subscribed" });
    expect(mocks.cancelForCaller).toHaveBeenCalledWith(context, { businessId: "biz_1", appointmentId: "apt_1", callerPhone: "+14165550100", verificationId: "ver_1" });
  });
});
