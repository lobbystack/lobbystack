import { describe, expect, it } from "vitest";

import { formatPhoneNationalInput, getPhoneNationalDigitLimit, inferPhoneCountry, isSupportedOnboardingPhoneCountry, normalizePhoneNumber, supportsOnboardingAreaCodeSearch } from "./phone";

describe("Puerto Rican phone numbers", () => {
  it("offers Puerto Rico for onboarding, with area code search", () => {
    expect(isSupportedOnboardingPhoneCountry("PR")).toBe(true);
    expect(supportsOnboardingAreaCodeSearch("PR")).toBe(true);
  });

  it("formats and limits a Puerto Rican number like other +1 numbers", () => {
    expect(formatPhoneNationalInput("7875550134", "PR")).toBe("(787) 555-0134");
    expect(getPhoneNationalDigitLimit("PR")).toBe(10);
  });

  it("recognizes a +1 787 or +1 939 number as Puerto Rican, so verification matches the country picked", () => {
    expect(normalizePhoneNumber("(787) 555-0134", { defaultCountry: "PR" })).toBe("+17875550134");
    expect(inferPhoneCountry("+17875550134")).toBe("PR");
    expect(inferPhoneCountry("+19395550134")).toBe("PR");
    expect(inferPhoneCountry("+14155550134")).toBe("US");
  });
});
