import { describe, expect, it } from "vitest";

import { getSafeOnboardingErrorMessage } from "./onboarding-errors";

const t = (key: string): string => key;

describe("getSafeOnboardingErrorMessage", () => {
  it("maps typed non-mobile phone validation without relying on provider wording", () => {
    expect(
      getSafeOnboardingErrorMessage(
        Object.assign(new Error("Validation failed."), { code: "phone_number_not_mobile" }),
        t,
        "verifyPhone.sendFailed",
      ),
    ).toBe("verifyPhone.mobileRequired");
  });

  it("maps the current mobile-number validation messages", () => {
    expect(
      getSafeOnboardingErrorMessage(
        new Error("A valid mobile phone number is required."),
        t,
        "verifyPhone.sendFailed",
      ),
    ).toBe("verifyPhone.invalidNumber");
    expect(
      getSafeOnboardingErrorMessage(
        new Error("A mobile phone number is required."),
        t,
        "verifyPhone.sendFailed",
      ),
    ).toBe("verifyPhone.mobileRequired");
  });

  it("maps unsupported phone countries to localized guidance", () => {
    expect(
      getSafeOnboardingErrorMessage(
        Object.assign(new Error("Validation failed."), { code: "phone_country_unsupported" }),
        t,
        "verifyPhone.sendFailed",
      ),
    ).toBe("verifyPhone.unsupportedCountry");
  });

  it("preserves actionable Twilio trial-account guidance", () => {
    expect(
      getSafeOnboardingErrorMessage(
        "This Twilio account can't buy that number. Trial accounts can only buy eligible trial numbers and may need an existing number released or the account upgraded.",
        t,
        "number.claimFailed",
      ),
    ).toBe("number.trialAccountPurchaseLimit");
  });
});
