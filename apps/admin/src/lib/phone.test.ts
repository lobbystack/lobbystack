import { describe, expect, it } from "vitest";

import { formatPhoneNationalInput, getPhonePlaceholder, getPhoneNationalDigitLimit, inferPhoneCountry, isSupportedOnboardingPhoneCountry, normalizePhoneNumber, supportsOnboardingAreaCodeSearch } from "./phone";

describe("Puerto Rican phone numbers", () => {
  it("offers Puerto Rico for onboarding, with area code search", () => {
    expect(isSupportedOnboardingPhoneCountry("PR")).toBe(true);
    expect(supportsOnboardingAreaCodeSearch("PR")).toBe(true);
  });

  it("formats and limits a Puerto Rican number like other +1 numbers", () => {
    expect(formatPhoneNationalInput("7875550134", "PR")).toBe("(787) 555-0134");
    expect(getPhoneNationalDigitLimit("PR")).toBe(10);
  });

  it("groups the digits of any other country the way it writes them domestically, without the domestic prefix", () => {
    expect(formatPhoneNationalInput("695021111", "RS")).toBe("69 5021111");
    expect(formatPhoneNationalInput("0695021111", "RS")).toBe("69 5021111");
    expect(formatPhoneNationalInput("15123456789", "DE")).toBe("1512 3456789");
    expect(formatPhoneNationalInput("612345678", "FR")).toBe("6 12 34 56 78");
    expect(formatPhoneNationalInput("11987654321", "BR")).toBe("(11) 98765-4321");
    expect(formatPhoneNationalInput("9012345678", "JP")).toBe("90-1234-5678");
    expect(formatPhoneNationalInput("612345678", "ES")).toBe("612 34 56 78");
    expect(formatPhoneNationalInput("3123456789", "IT")).toBe("312 345 6789");
  });

  it("shows each country's own example number as the placeholder, grouped like a typed number", () => {
    expect(getPhonePlaceholder("en", { defaultCountry: "RS" })).toBe("60 1234567");
    expect(getPhonePlaceholder("en", { defaultCountry: "DE" })).toBe("1512 3456789");
    expect(getPhonePlaceholder("fr", { defaultCountry: "FR" })).toBe("6 12 34 56 78");
    expect(getPhonePlaceholder("en", { defaultCountry: "US" })).toBe("(555) 123-4567");
  });

  it("caps the digits at the most a country's numbers have, counting a typed domestic prefix", () => {
    expect(getPhoneNationalDigitLimit("FR")).toBe(9);
    expect(getPhoneNationalDigitLimit("FR", "0612")).toBe(10);
    expect(getPhoneNationalDigitLimit("RS")).toBe(12);
    expect(getPhoneNationalDigitLimit("DE")).toBe(15);
    expect(getPhoneNationalDigitLimit("US")).toBe(10);
  });

  it("leaves a short number as typed", () => {
    expect(formatPhoneNationalInput("6", "RS")).toBe("6");
    expect(formatPhoneNationalInput("69", "RS")).toBe("69");
    expect(formatPhoneNationalInput("", "RS")).toBe("");
  });

  it("recognizes a +1 787 or +1 939 number as Puerto Rican, so verification matches the country picked", () => {
    expect(normalizePhoneNumber("(787) 555-0134", { defaultCountry: "PR" })).toBe("+17875550134");
    expect(inferPhoneCountry("+17875550134")).toBe("PR");
    expect(inferPhoneCountry("+19395550134")).toBe("PR");
    expect(inferPhoneCountry("+14155550134")).toBe("US");
  });
});
