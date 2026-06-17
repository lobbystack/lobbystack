import { describe, expect, it, vi } from "vitest";

import {
  releaseTwilioIncomingPhoneNumber,
  shouldReleaseRetiringTwilioPhoneNumber,
} from "./phoneNumbers";

describe("settings phone number replacement", () => {
  it("releases a Twilio incoming phone number normally", async () => {
    const incomingPhoneNumber = {
      fetch: vi.fn(async () => ({
        emergencyAddressSid: null,
        emergencyAddressStatus: "unregistered",
        emergencyStatus: "Inactive",
      })),
      remove: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    };

    await releaseTwilioIncomingPhoneNumber(incomingPhoneNumber);

    expect(incomingPhoneNumber.remove).toHaveBeenCalledTimes(1);
    expect(incomingPhoneNumber.update).not.toHaveBeenCalled();
  });

  it("removes emergency address configuration before retrying release", async () => {
    const incomingPhoneNumber = {
      fetch: vi.fn(async () => ({
        emergencyAddressSid: null,
        emergencyAddressStatus: "unregistered",
        emergencyStatus: "Inactive",
      })),
      remove: vi
        .fn()
        .mockRejectedValueOnce(
          new Error("Please remove the emergency address on this number before performing this action."),
        )
        .mockResolvedValueOnce(undefined),
      update: vi.fn(async () => undefined),
    };

    await releaseTwilioIncomingPhoneNumber(incomingPhoneNumber);

    expect(incomingPhoneNumber.update).toHaveBeenNthCalledWith(1, {
      emergencyStatus: "Inactive",
    });
    expect(incomingPhoneNumber.update).toHaveBeenNthCalledWith(2, {
      emergencyAddressSid: "",
    });
    expect(incomingPhoneNumber.remove).toHaveBeenCalledTimes(2);
  });

  it("does not retry release for unrelated Twilio errors", async () => {
    const incomingPhoneNumber = {
      fetch: vi.fn(async () => ({
        emergencyAddressSid: "AD123",
        emergencyAddressStatus: "registered",
        emergencyStatus: "Active",
      })),
      remove: vi.fn(async () => {
        throw new Error("Twilio request failed.");
      }),
      update: vi.fn(async () => undefined),
    };

    await expect(releaseTwilioIncomingPhoneNumber(incomingPhoneNumber)).rejects.toThrow(
      "Twilio request failed.",
    );
    expect(incomingPhoneNumber.update).not.toHaveBeenCalled();
  });

  it("only releases the expected retiring Twilio phone number", () => {
    expect(
      shouldReleaseRetiringTwilioPhoneNumber(
        { status: "retiring", twilioPhoneSid: "PN_old" },
        "PN_old",
      ),
    ).toBe(true);
    expect(
      shouldReleaseRetiringTwilioPhoneNumber(
        { status: "active", twilioPhoneSid: "PN_old" },
        "PN_old",
      ),
    ).toBe(false);
    expect(
      shouldReleaseRetiringTwilioPhoneNumber(
        { status: "inactive", twilioPhoneSid: "PN_new" },
        "PN_old",
      ),
    ).toBe(false);
    expect(shouldReleaseRetiringTwilioPhoneNumber(null, "PN_old")).toBe(false);
  });
});
