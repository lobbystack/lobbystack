import { describe, expect, it } from "vitest";

import { appointmentNotificationSkipReason, CANCELLATION_CONFIRMATION } from "./notifications";

// A text to a subscribed contact from a business number that can reach them.
const text = { channel: "sms", smsConsentStatus: "subscribed", operatorBlockedAt: null, senderPhone: "+14165550000", contactPhone: "+14165550100", contactEmail: null };
const cancellation = { ...text, kind: CANCELLATION_CONFIRMATION, appointmentStatus: "canceled" };

describe("appointment notification delivery", () => {
  it("sends the cancellation text for a cancelled appointment to a subscribed contact", () => {
    expect(appointmentNotificationSkipReason(cancellation)).toBeNull();
  });

  it("sends nothing else for a cancelled appointment, and no cancellation text for one still booked", () => {
    for (const kind of ["booking_confirmation", "appointment_reminder"]) {
      expect(appointmentNotificationSkipReason({ ...text, kind, appointmentStatus: "canceled" })).toBe("appointment_status");
      expect(appointmentNotificationSkipReason({ ...text, kind, appointmentStatus: "confirmed" })).toBeNull();
    }
    expect(appointmentNotificationSkipReason({ ...cancellation, appointmentStatus: "confirmed" })).toBe("appointment_status");
  });

  it.each([
    ["declined", { smsConsentStatus: "declined" }, "sms_consent"],
    ["opted_out", { smsConsentStatus: "opted_out" }, "sms_consent"],
    ["never asked", { smsConsentStatus: null }, "sms_consent"],
    ["blocked by the business", { operatorBlockedAt: new Date() }, "sms_blocked"],
    ["without an SMS number", { senderPhone: null }, "sms_unreachable"],
    ["a toll-free number abroad", { senderPhone: "+18445550100", contactPhone: "+381695021111" }, "sms_unreachable"],
  ] as const)("skips the cancellation text for a contact %s", (_label, change, reason) => {
    expect(appointmentNotificationSkipReason({ ...cancellation, ...change })).toBe(reason);
  });
});
