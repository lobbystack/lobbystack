import { describe, expect, it } from "vitest";

import { formatBookedValue, formatTimeSaved } from "./analytics-results";

const plain = (value: string) => value.replace(new RegExp("[\\u00a0\\u202f]", "gu"), " ");

describe("formatBookedValue", () => {
  it("formats the smallest unit in the business currency, with decimals only for cents", () => {
    expect(formatBookedValue(125_000, "USD", "en")).toBe("$1,250");
    expect(formatBookedValue(125_050, "USD", "en")).toBe("$1,250.50");
    expect(plain(formatBookedValue(125_050, "EUR", "fr"))).toBe("1 250,50 €");
    expect(formatBookedValue(1_250, "JPY", "en")).toBe("¥1,250");
  });

  it("formats Serbian in Latin script", () => {
    expect(plain(formatBookedValue(350_000, "RSD", "sr"))).toBe("3.500 RSD");
  });
});

describe("formatTimeSaved", () => {
  it("shows hours and minutes in the active locale", () => {
    expect(formatTimeSaved(12 * 3_600 + 5 * 60, "en")).toBe("12 hr 5 min");
    expect(plain(formatTimeSaved(12 * 3_600 + 5 * 60, "fr"))).toBe("12 h 5 min");
    expect(plain(formatTimeSaved(2 * 3_600, "es"))).toBe("2 h");
    expect(plain(formatTimeSaved(12 * 3_600 + 5 * 60, "sr"))).toBe("12 sati i 5 min");
  });

  it("rounds to the minute and shows minutes alone under an hour", () => {
    expect(formatTimeSaved(0, "en")).toBe("0 min");
    expect(formatTimeSaved(29, "en")).toBe("0 min");
    expect(formatTimeSaved(44 * 60 + 40, "en")).toBe("45 min");
  });
});
