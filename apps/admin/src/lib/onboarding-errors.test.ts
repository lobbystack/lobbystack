import { describe, expect, it } from "vitest";

import { getSafeOnboardingErrorMessage } from "./onboarding-errors";

const t = (key: string): string => key;

describe("getSafeOnboardingErrorMessage", () => {
  it("maps the owned workspace limit", () => {
    expect(
      getSafeOnboardingErrorMessage(
        new Error("Too many workspaces. One account can own up to 10."),
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

  it("maps an expired offer, the claim limits, a partner's tier limit and a partner's business without numbers by code", () => {
    expect(getSafeOnboardingErrorMessage(Object.assign(new Error("This number offer expired."), { code: "number_offer_expired" }), t, "number.claimFailed")).toBe("number.offerExpired");
    expect(getSafeOnboardingErrorMessage(Object.assign(new Error("Daily limit."), { code: "daily_claim_quota_reached" }), t, "number.claimFailed")).toBe("number.claimRateLimited");
    expect(getSafeOnboardingErrorMessage(Object.assign(new Error("This business's partner needs a paid tier for more phone numbers."), { code: "partner_number_limit_reached" }), t, "number.searchFailed")).toBe("number.partnerTierRequired");
    // No paid tier helps where nobody bills the partner's numbers, so it isn't the paid-tier message.
    expect(getSafeOnboardingErrorMessage(Object.assign(new Error("Phone numbers aren't available for this business yet."), { code: "partner_numbers_unavailable" }), t, "number.searchFailed")).toBe("number.partnerNumbersUnavailable");
    // A deployment without Twilio says so instead of "Request failed."
    expect(getSafeOnboardingErrorMessage(Object.assign(new Error("Phone numbers aren't set up on this dashboard."), { code: "phone_numbers_unavailable" }), t, "number.searchFailed")).toBe("number.numbersUnavailable");
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

  it("explains the phone step's refusals in the owner's language", () => {
    const refusal = (code: string) => getSafeOnboardingErrorMessage(Object.assign(new Error("server text"), { code }), t, "verifyPhone.sendFailed");
    expect(refusal("phone_number_invalid")).toBe("verifyPhone.errors.invalidNumber");
    expect(refusal("phone_voip_refused")).toBe("verifyPhone.errors.voip");
    expect(refusal("phone_country_mismatch")).toBe("verifyPhone.errors.countryMismatch");
    expect(refusal("something_else")).toBe("verifyPhone.sendFailed");
  });
});
