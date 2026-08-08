import { describe, expect, it } from "vitest";

import {
  buildAppointmentChangePolicyForSave,
  resolveTransferNumberForSave,
} from "./AgentBasicSettingsPage";

describe("resolveTransferNumberForSave", () => {
  it("rejects partial visible input instead of silently keeping the old value", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "(855) 747-77",
        validTransferNumber: "",
      }),
    ).toEqual({
      ok: false,
      errorKey: "agent:fields.transferNumber.errors.invalid",
    });
  });

  it("clears the transfer number when the visible input is empty", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "",
        validTransferNumber: "",
      }),
    ).toEqual({
      ok: true,
      value: null,
    });
  });

  it("saves the normalized transfer number when the current input is valid", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "(514) 555-0123",
        validTransferNumber: "+15145550123",
      }),
    ).toEqual({
      ok: true,
      value: "+15145550123",
    });
  });
});

describe("buildAppointmentChangePolicyForSave", () => {
  it("enables appointment changes when at least one change type is allowed", () => {
    expect(
      buildAppointmentChangePolicyForSave({
        allowCancel: true,
        allowReschedule: false,
        requireOtp: false,
      }),
    ).toEqual({
      enabled: true,
      allowCancel: true,
      allowReschedule: false,
      verificationMode: "phone_match_and_facts",
    });
  });

  it("stores OTP-required mode when the stricter verification toggle is enabled", () => {
    expect(
      buildAppointmentChangePolicyForSave({
        allowCancel: true,
        allowReschedule: true,
        requireOtp: true,
      }),
    ).toEqual({
      enabled: true,
      allowCancel: true,
      allowReschedule: true,
      verificationMode: "otp_required",
    });
  });

  it("disables the policy when both change toggles are off", () => {
    expect(
      buildAppointmentChangePolicyForSave({
        allowCancel: false,
        allowReschedule: false,
        requireOtp: true,
      }),
    ).toEqual({
      enabled: false,
      allowCancel: false,
      allowReschedule: false,
      verificationMode: "otp_required",
    });
  });
});
