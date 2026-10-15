import { describe, expect, it } from "vitest";

import { currencyFractionDigits, defaultCurrencyForTimezone, formatServicePrice, isCurrencyCode } from "./index";

describe("service prices", () => {
  it("formats a price in the currency's smallest unit, without decimals it doesn't use", () => {
    expect(formatServicePrice({ type: "fixed", amountMinor: 350000, currency: "RSD" })).toBe("RSD 3,500");
    expect(formatServicePrice({ type: "fixed", amountMinor: 1250, currency: "EUR" })).toBe("EUR 12.50");
    expect(formatServicePrice({ type: "fixed", amountMinor: 4000, currency: "USD" })).toBe("USD 40");
    expect(formatServicePrice({ type: "from", amountMinor: 70000, currency: "RSD" })).toBe("from RSD 700");
    expect(formatServicePrice({ type: "range", amountMinor: 70000, maxAmountMinor: 100000, currency: "RSD" })).toBe("RSD 700 to RSD 1,000");
    expect(formatServicePrice({ type: "in_person" })).toBe("set in person");
    expect(formatServicePrice({ type: "fixed", amountMinor: 70000, currency: "RSD", discountPercent: 20 })).toBe("RSD 560 after a 20% discount (regular RSD 700)");
    expect(formatServicePrice({ type: "range", amountMinor: 100000, maxAmountMinor: 200000, currency: "RSD", discountPercent: 10 })).toBe("RSD 900 to RSD 1,800 after a 10% discount (regular RSD 1,000 to RSD 2,000)");
  });

  it("uses each currency's ISO 4217 decimals, the same in every runtime", () => {
    expect(currencyFractionDigits("EUR")).toBe(2);
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(currencyFractionDigits("RSD")).toBe(2);
  });

  it("accepts only ISO 4217 codes", () => {
    expect(isCurrencyCode("RSD")).toBe(true);
    expect(isCurrencyCode("rsd")).toBe(false);
    expect(isCurrencyCode("dinar")).toBe(false);
  });

  it("picks a new business's currency from its timezone", () => {
    expect(defaultCurrencyForTimezone("Europe/Belgrade")).toBe("RSD");
    expect(defaultCurrencyForTimezone("Europe/Paris")).toBe("EUR");
    expect(defaultCurrencyForTimezone("America/Toronto")).toBe("CAD");
    expect(defaultCurrencyForTimezone("America/New_York")).toBe("USD");
  });
});
