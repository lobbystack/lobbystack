import { describe, expect, it } from "vitest";

import {
  formatPhoneNationalInput,
  formatPhoneNumberDisplay,
  getDefaultPhoneCountry,
  getPhoneNationalDigitLimit,
  getPhonePlaceholder,
  getSupportedOnboardingPhoneCountryOptions,
  normalizePhoneNumber,
} from "@/lib/phone";

describe("phone helpers", () => {
  it("maps locale defaults to the expected countries", () => {
    expect(getDefaultPhoneCountry("en-CA")).toBe("CA");
    expect(getDefaultPhoneCountry("fr-CA")).toBe("CA");
    expect(getDefaultPhoneCountry("en-US")).toBe("US");
    expect(getDefaultPhoneCountry("en-GB")).toBe("GB");
    expect(getDefaultPhoneCountry("en-AU")).toBe("AU");
    expect(getDefaultPhoneCountry("en")).toBe("US");
    expect(getDefaultPhoneCountry("fr")).toBe("FR");
  });

  it("normalizes valid phone numbers to E.164", () => {
    expect(
      normalizePhoneNumber("(514) 555-0123", { defaultCountry: "CA" }),
    ).toBe("+15145550123");
    expect(
      normalizePhoneNumber("+33 6 12 34 56 78", { defaultCountry: "FR" }),
    ).toBe("+33612345678");
    expect(
      normalizePhoneNumber("06 12 34 56 78", { defaultCountry: getDefaultPhoneCountry("fr") }),
    ).toBe("+33612345678");
  });

  it("returns undefined for invalid phone input", () => {
    expect(normalizePhoneNumber("123", { defaultCountry: "US" })).toBeUndefined();
  });

  it("formats North American numbers nationally and other numbers internationally", () => {
    expect(formatPhoneNumberDisplay("+15145550123", "en-CA")).toBe("(514) 555-0123");
    expect(formatPhoneNumberDisplay("+15145550123", "en-US")).toBe("(514) 555-0123");
    expect(formatPhoneNumberDisplay("+12133734253", "en-CA")).toBe("(213) 373-4253");
    expect(formatPhoneNumberDisplay("+33612345678", "en-US")).toBe("+33 6 12 34 56 78");
  });

  it("uses a national-style placeholder for the default country", () => {
    expect(getPhonePlaceholder("en-US")).toBe("(555) 123-4567");
    expect(getPhonePlaceholder("fr-CA")).toBe("(555) 123-4567");
    expect(getPhonePlaceholder("fr-FR", { defaultCountry: "FR" })).toBe("06 12 34 56 78");
    expect(getPhonePlaceholder("en-US", { defaultCountry: "GB" })).toBe("07123 456789");
    expect(getPhonePlaceholder("en-US", { defaultCountry: "AU" })).toBe("0412 345 678");
  });

  it("falls back to the raw value when parsing fails", () => {
    expect(formatPhoneNumberDisplay("not a phone", "en-US")).toBe("not a phone");
  });

  it("returns national digit limits for supported onboarding countries", () => {
    expect(getPhoneNationalDigitLimit("US", "2133734253")).toBe(10);
    expect(getPhoneNationalDigitLimit("CA", "5145550123")).toBe(10);
    expect(getPhoneNationalDigitLimit("GB", "07123123456")).toBe(11);
    expect(getPhoneNationalDigitLimit("GB", "7123123456")).toBe(10);
    expect(getPhoneNationalDigitLimit("AU", "0412345678")).toBe(10);
    expect(getPhoneNationalDigitLimit("AU", "412345678")).toBe(9);
    expect(getPhoneNationalDigitLimit("FR", "0612345678")).toBeUndefined();
  });

  it("formats supported onboarding national input as it is typed", () => {
    expect(formatPhoneNationalInput("07123456789", "GB")).toBe("07123 456789");
    expect(formatPhoneNationalInput("7123456789", "GB")).toBe("7123 456789");
    expect(formatPhoneNationalInput("0412345678", "AU")).toBe("0412 345 678");
    expect(formatPhoneNationalInput("412345678", "AU")).toBe("412 345 678");
    expect(formatPhoneNationalInput("(213) 373-4253", "US")).toBe("(213) 373-4253");
  });

  it("limits onboarding country options to supported markets", () => {
    expect(
      getSupportedOnboardingPhoneCountryOptions("en-US").map((option) => option.code),
    ).toEqual(["US", "CA", "GB", "AU"]);
  });
});
