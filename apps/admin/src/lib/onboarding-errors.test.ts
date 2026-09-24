import { describe, expect, it } from "vitest";

import { getSafeOnboardingErrorMessage } from "./onboarding-errors";

const t = (key: string): string => key;

describe("getSafeOnboardingErrorMessage", () => {
  it("maps workspace creation rate limits", () => {
    expect(
      getSafeOnboardingErrorMessage(
        new Error("Too many workspace creation attempts."),
        t,
        "businessName.submitFailed",
      ),
    ).toBe("errors.tooManyBusinesses");
  });

  it("maps number search rate limits", () => {
    expect(
      getSafeOnboardingErrorMessage(
        new Error("Too many number searches. Please wait."),
        t,
        "number.searchFailed",
      ),
    ).toBe("number.tooManySearches");
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

  it("falls back for retired phone-verification errors instead of returning stale copy", () => {
    expect(
      getSafeOnboardingErrorMessage(
        Object.assign(new Error("A valid mobile phone number is required."), { code: "phone_number_invalid" }),
        t,
        "number.searchFailed",
      ),
    ).toBe("number.searchFailed");
  });
});
