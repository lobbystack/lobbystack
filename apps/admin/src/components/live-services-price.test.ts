import { describe, expect, it } from "vitest";

import { formatPriceTyping, parsePriceInput, priceInputValue, readPrice } from "./live-services-surface";

const values = { name: "Haircut", description: "", durationMinutes: "30", price: "", priceMax: "", discountEnabled: false, discount: "", active: true };

describe("readPrice", () => {
  it("reads each price type from the editor's fields", () => {
    expect(readPrice({ ...values, priceType: "fixed", price: "700" }, "RSD", "en")).toEqual({ priceType: "fixed", priceMinor: 70000, priceMaxMinor: null, discountPercent: 0 });
    expect(readPrice({ ...values, priceType: "from", price: "1,000" }, "RSD", "en")).toEqual({ priceType: "from", priceMinor: 100000, priceMaxMinor: null, discountPercent: 0 });
    expect(readPrice({ ...values, priceType: "range", price: "700", priceMax: "1000.50" }, "RSD", "en")).toEqual({ priceType: "range", priceMinor: 70000, priceMaxMinor: 100050, discountPercent: 0 });
    expect(readPrice({ ...values, priceType: "range", price: "700", priceMax: "1.000,50" }, "RSD", "sr")).toEqual({ priceType: "range", priceMinor: 70000, priceMaxMinor: 100050, discountPercent: 0 });
    expect(readPrice({ ...values, priceType: "in_person", price: "700" }, "RSD", "en")).toEqual({ priceType: "in_person", priceMinor: null, priceMaxMinor: null, discountPercent: 0 });
    expect(readPrice({ ...values, priceType: "fixed" }, "RSD", "en")).toEqual({ priceType: "fixed", priceMinor: null, priceMaxMinor: null, discountPercent: 0 });
  });

  it("refuses a range missing a bound or with its bounds the wrong way round", () => {
    expect(readPrice({ ...values, priceType: "range", price: "700" }, "RSD", "en")).toEqual({ error: "rangeIncomplete" });
    expect(readPrice({ ...values, priceType: "range", price: "1000", priceMax: "700" }, "RSD", "en")).toEqual({ error: "rangeOrder" });
  });

  it("keeps a discount only while its switch is on, from 0 to 100 with up to two decimals", () => {
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: true, discount: "20" }, "RSD", "en")).toMatchObject({ discountPercent: 20 });
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: false, discount: "20" }, "RSD", "en")).toMatchObject({ discountPercent: 0 });
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: true, discount: "12.5" }, "RSD", "en")).toMatchObject({ discountPercent: 12.5 });
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: true, discount: "150" }, "RSD", "en")).toEqual({ error: "discountInvalid" });
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: true, discount: "7.255" }, "RSD", "en")).toEqual({ error: "discountInvalid" });
    expect(readPrice({ ...values, priceType: "in_person", discountEnabled: true, discount: "20" }, "RSD", "en")).toMatchObject({ discountPercent: 0 });
  });
});

describe("formatPriceTyping", () => {
  it("groups whole units the locale's way as the price is typed", () => {
    expect(formatPriceTyping("3500", "RSD", "en")).toBe("3,500");
    expect(formatPriceTyping("1234567", "RSD", "en")).toBe("1,234,567");
    expect(formatPriceTyping("3500", "RSD", "sr")).toBe("3.500");
    expect(formatPriceTyping("3500", "EUR", "es")).toBe("3.500");
    expect(formatPriceTyping("3500", "EUR", "fr")).toBe("3 500");
    expect(formatPriceTyping("007", "RSD", "en")).toBe("7");
  });

  it("reads a comma as the decimal mark in French, Spanish and Serbian, typed or pasted", () => {
    expect(formatPriceTyping("12,50", "EUR", "fr")).toBe("12,50");
    expect(formatPriceTyping("12,5", "EUR", "es")).toBe("12,5");
    expect(formatPriceTyping("1234,5", "RSD", "sr")).toBe("1.234,5");
    expect(formatPriceTyping("1.234,", "RSD", "sr")).toBe("1.234,");
    // A "." isn't French grouping, so it's the decimal mark there too.
    expect(formatPriceTyping("12.5", "EUR", "fr")).toBe("12,5");
    // English groups with commas.
    expect(formatPriceTyping("12,50", "EUR", "en")).toBe("1,250");
  });

  it("keeps one decimal mark and only as many decimals as the currency uses", () => {
    expect(formatPriceTyping("1234.5", "EUR", "en")).toBe("1,234.5");
    expect(formatPriceTyping("12.345", "EUR", "en")).toBe("12.34");
    expect(formatPriceTyping("12.3.4", "EUR", "en")).toBe("12.34");
    expect(formatPriceTyping(".5", "EUR", "en")).toBe("0.5");
    expect(formatPriceTyping("35.50", "RSD", "en")).toBe("35.50");
    expect(formatPriceTyping("12", "JPY", "en")).toBe("12");
    expect(formatPriceTyping("12.5", "JPY", "en")).toBe("12");
    expect(formatPriceTyping("abc12", "USD", "en")).toBe("12");
  });
});

describe("parsePriceInput", () => {
  it("reads grouped whole units in each locale", () => {
    expect(parsePriceInput("3500", "RSD", "en")).toBe(350000);
    expect(parsePriceInput("3,500", "RSD", "en")).toBe(350000);
    expect(parsePriceInput("3.500", "RSD", "sr")).toBe(350000);
    expect(parsePriceInput("3.500", "EUR", "es")).toBe(350000);
    expect(parsePriceInput("3 500", "EUR", "fr")).toBe(350000);
    expect(parsePriceInput("3 500", "EUR", "fr")).toBe(350000);
  });

  it("reads the locale's decimal mark, and the last mark when both are there", () => {
    expect(parsePriceInput("12.5", "EUR", "en")).toBe(1250);
    expect(parsePriceInput("1,234.56", "USD", "en")).toBe(123456);
    expect(parsePriceInput("12,50", "EUR", "fr")).toBe(1250);
    expect(parsePriceInput("12,50", "EUR", "es")).toBe(1250);
    expect(parsePriceInput("12,50", "RSD", "sr")).toBe(1250);
    expect(parsePriceInput("1.234,56", "RSD", "sr")).toBe(123456);
    expect(parsePriceInput("1,234.56", "RSD", "sr")).toBe(123456);
    expect(parsePriceInput("40", "USD", "en")).toBe(4000);
    expect(parsePriceInput("12.", "EUR", "en")).toBe(1200);
  });

  it("treats empty as no price and rejects anything that isn't one", () => {
    expect(parsePriceInput("  ", "RSD", "en")).toBeNull();
    expect(parsePriceInput("-5", "RSD", "en")).toBeUndefined();
    expect(parsePriceInput("abc", "EUR", "en")).toBeUndefined();
    expect(parsePriceInput("12.5", "RSD", "en")).toBe(1250);
    expect(parsePriceInput("12.5", "JPY", "en")).toBeUndefined();
    expect(parsePriceInput("12,5", "JPY", "sr")).toBeUndefined();
    expect(parsePriceInput("12.345", "EUR", "en")).toBeUndefined();
    expect(parsePriceInput("1.2.3", "EUR", "en")).toBeUndefined();
    expect(parsePriceInput(".", "EUR", "en")).toBeUndefined();
  });
});

describe("priceInputValue", () => {
  it("shows a stored price that reads back to the same amount, so an unchanged service saves as it was", () => {
    for (const locale of ["en", "fr", "es", "sr"]) {
      for (const [amount, currency] of [[350000, "RSD"], [1250, "RSD"], [123456789, "EUR"], [5, "USD"], [40, "JPY"], [1234567, "KWD"], [0, "USD"]] as const) {
        expect(parsePriceInput(priceInputValue(amount, currency, locale), currency, locale)).toBe(amount);
        expect(formatPriceTyping(priceInputValue(amount, currency, locale), currency, locale)).toBe(priceInputValue(amount, currency, locale));
      }
    }
    expect(priceInputValue(350000, "RSD", "sr")).toBe("3.500");
    expect(priceInputValue(1250, "EUR", "fr")).toBe("12,50");
    expect(priceInputValue(5, "USD", "en")).toBe("0.05");
    expect(priceInputValue(null, "USD", "en")).toBe("");
  });
});
