import { describe, expect, it } from "vitest";

import { getSafeOnboardingErrorMessage } from "@/features/onboarding/onboardingErrors";

const t = (key: string): string => key;

describe("getSafeOnboardingErrorMessage", () => {
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
