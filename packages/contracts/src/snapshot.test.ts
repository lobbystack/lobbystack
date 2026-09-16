import { describe, expect, it } from "vitest";
import { snapshotSchema } from "./index";
const snapshot = {
  businessId: "00000000-0000-4000-8000-000000000001", version: "1", generatedAt: "2026-09-05T12:00:00Z", displayName: "Clinic", timezone: "UTC", defaultLocale: "en", businessType: "clinic", greeting: "Hello", voiceInstructions: "", smsInstructions: "", chatInstructions: "", summary: "", bookingPolicy: "", knowledgeDigest: "", transferPolicy: { mode: "on_urgent", transferNumber: "+14165550100" }, hours: [], closures: [], services: [], contactChannels: {},
};
describe("voice policy snapshot contract", () => {
  it("preserves stored appointment restrictions through transport parsing", () => {
    const policy = { enabled: true, allowCancel: false, allowReschedule: true, verificationMode: "otp_required" };
    const parsed = snapshotSchema.parse({ ...snapshot, appointmentChangePolicy: policy });
    expect(parsed.appointmentChangePolicy).toEqual(policy);
    expect(parsed.transferPolicy.mode).toBe("on_urgent");
  });
  it("rejects unknown transfer and appointment verification modes", () => {
    expect(snapshotSchema.safeParse({ ...snapshot, transferPolicy: { mode: "unknown" } }).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...snapshot, appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "skip" } }).success).toBe(false);
  });
});
