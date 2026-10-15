import { describe, expect, it } from "vitest";

import { formatPriceTyping, parsePriceInput, readPrice } from "./live-services-surface";

const values = { name: "Haircut", description: "", durationMinutes: "30", price: "", priceMax: "", discountEnabled: false, discount: "", active: true };

describe("readPrice", () => {
  it("reads each price type from the editor's fields", () => {
    expect(readPrice({ ...values, priceType: "fixed", price: "700" }, "RSD")).toEqual({ priceType: "fixed", priceMinor: 70000, priceMaxMinor: null, discountPercent: 0 });
    expect(readPrice({ ...values, priceType: "from", price: "1,000" }, "RSD")).toEqual({ priceType: "from", priceMinor: 100000, priceMaxMinor: null, discountPercent: 0 });
    expect(readPrice({ ...values, priceType: "range", price: "700", priceMax: "1000.50" }, "RSD")).toEqual({ priceType: "range", priceMinor: 70000, priceMaxMinor: 100050, discountPercent: 0 });
    expect(readPrice({ ...values, priceType: "in_person", price: "700" }, "RSD")).toEqual({ priceType: "in_person", priceMinor: null, priceMaxMinor: null, discountPercent: 0 });
    expect(readPrice({ ...values, priceType: "fixed" }, "RSD")).toEqual({ priceType: "fixed", priceMinor: null, priceMaxMinor: null, discountPercent: 0 });
  });

  it("keeps a discount only while its switch is on, and only from 0 to 100", () => {
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: true, discount: "20" }, "RSD")).toMatchObject({ discountPercent: 20 });
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: false, discount: "20" }, "RSD")).toMatchObject({ discountPercent: 0 });
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: true, discount: "150" }, "RSD")).toEqual({ error: "discountInvalid" });
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: true, discount: "12.5" }, "RSD")).toMatchObject({ discountPercent: 12.5 });
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: true, discount: "12,5" }, "RSD")).toEqual({ error: "discountInvalid" });
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: true, discount: "7.25" }, "RSD")).toMatchObject({ discountPercent: 7.25 });
    expect(readPrice({ ...values, priceType: "fixed", price: "700", discountEnabled: true, discount: "7.255" }, "RSD")).toEqual({ error: "discountInvalid" });
    expect(readPrice({ ...values, priceType: "in_person", discountEnabled: true, discount: "20" }, "RSD")).toMatchObject({ discountPercent: 0 });
  });

  it("refuses a range missing a bound or with its bounds the wrong way round", () => {
    expect(readPrice({ ...values, priceType: "range", price: "700" }, "RSD")).toEqual({ error: "rangeIncomplete" });
    expect(readPrice({ ...values, priceType: "range", price: "1000", priceMax: "700" }, "RSD")).toEqual({ error: "rangeOrder" });
  });
});

describe("formatPriceTyping", () => {
  it("groups whole units with commas as the price is typed", () => {
    expect(formatPriceTyping("3500", "RSD")).toBe("3,500");
    expect(formatPriceTyping("1234567", "RSD")).toBe("1,234,567");
    expect(formatPriceTyping("1,2345", "RSD")).toBe("12,345");
    expect(formatPriceTyping("007", "RSD")).toBe("7");
  });

  it("keeps one \".\" and only as many decimals as the currency uses", () => {
    expect(formatPriceTyping("1234.5", "EUR")).toBe("1,234.5");
    expect(formatPriceTyping("12.345", "EUR")).toBe("12.34");
    expect(formatPriceTyping("12.3.4", "EUR")).toBe("12.34");
    expect(formatPriceTyping(".5", "EUR")).toBe("0.5");
    expect(formatPriceTyping("12,50", "EUR")).toBe("1,250");
    expect(formatPriceTyping("35.50", "RSD")).toBe("35.50");
    expect(formatPriceTyping("12", "JPY")).toBe("12");
    expect(formatPriceTyping("12.5", "JPY")).toBe("125");
    expect(formatPriceTyping("abc12", "USD")).toBe("12");
  });
});

describe("parsePriceInput", () => {
  it("reads comma-grouped whole units", () => {
    expect(parsePriceInput("3500", "RSD")).toBe(350000);
    expect(parsePriceInput("3,500", "RSD")).toBe(350000);
  });

  it("reads a \".\" as the decimal point in currencies that have decimals", () => {
    expect(parsePriceInput("12.5", "EUR")).toBe(1250);
    expect(parsePriceInput("1,234.56", "USD")).toBe(123456);
    expect(parsePriceInput("40", "USD")).toBe(4000);
    expect(parsePriceInput("12.", "EUR")).toBe(1200);
  });

  it("treats empty as no price and rejects anything that isn't one", () => {
    expect(parsePriceInput("  ", "RSD")).toBeNull();
    expect(parsePriceInput("-5", "RSD")).toBeUndefined();
    expect(parsePriceInput("abc", "EUR")).toBeUndefined();
    expect(parsePriceInput("12.5", "RSD")).toBe(1250);
    expect(parsePriceInput("12.5", "JPY")).toBeUndefined();
    expect(parsePriceInput("12.345", "EUR")).toBeUndefined();
    expect(parsePriceInput("1.2.3", "EUR")).toBeUndefined();
  });
});
