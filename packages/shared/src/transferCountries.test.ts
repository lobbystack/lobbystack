import { describe, expect, it } from "vitest";

import { isTransferCountry, isTransferPhone } from "./transferCountries";

describe("transfer countries", () => {
  it("lists the US and Canada, not the Caribbean countries that share +1", () => {
    expect(isTransferCountry("US")).toBe(true);
    expect(isTransferCountry("CA")).toBe(true);
    expect(isTransferCountry("JM")).toBe(false);
    expect(isTransferCountry("toString")).toBe(false);
    expect(isTransferCountry(undefined)).toBe(false);
  });

  it("accepts US, Canadian and listed overseas numbers", () => {
    for (const phone of ["+14155550100", "+14165550199", "+15145550123", "+442079460958", "+381641234567", "+525512345678", "+351912345678"]) expect(isTransferPhone(phone), phone).toBe(true);
  });

  it("refuses +1 numbers in the Caribbean and the US territories, and countries off the list", () => {
    for (const phone of ["+18765550100", "+18095550100", "+17875550100", "+16715550100", "+79161234567", "+861012345678"]) expect(isTransferPhone(phone), phone).toBe(false);
  });
});
