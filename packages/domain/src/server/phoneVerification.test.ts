import { describe, expect, it } from "vitest";

import { validatePhoneVerificationLookup } from "./phoneVerification";

describe("validatePhoneVerificationLookup", () => {
  it("normalizes supported mobile lookup results", () => {
    expect(validatePhoneVerificationLookup({
      phoneE164: "+14165550123",
      countryCode: " ca ",
      valid: true,
      lineType: " Mobile ",
    })).toEqual({
      phoneE164: "+14165550123",
      countryCode: "CA",
      lineType: "mobile",
    });
  });

  it.each([
    {
      lookup: { phoneE164: "invalid", countryCode: "CA", valid: false, lineType: "mobile" },
      code: "phone_number_invalid",
      message: "A valid mobile phone number is required.",
    },
    {
      lookup: { phoneE164: "+33123456789", countryCode: "FR", valid: true, lineType: "mobile" },
      code: "phone_country_unsupported",
      message: "Phone verification is not supported in this country.",
    },
    {
      lookup: { phoneE164: "+14165550123", countryCode: "CA", valid: true, lineType: "landline" },
      code: "phone_number_not_mobile",
      message: "A mobile phone number is required.",
    },
  ])("returns an expected 422 validation error for $code", ({ lookup, code, message }) => {
    try {
      validatePhoneVerificationLookup(lookup);
      throw new Error("Expected validation to fail.");
    } catch (error) {
      expect(error).toMatchObject({ status: 422, code, message });
    }
  });
});
