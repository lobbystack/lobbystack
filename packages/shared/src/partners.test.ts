import { describe, expect, it } from "vitest";

import { isPartnerAccessLevel, isPartnerSlug, normalizeBrandColor, normalizePartnerName } from "./partners";

describe("a partner's brand fields", () => {
  it("keeps a name of up to 80 visible characters, with whitespace collapsed", () => {
    expect(normalizePartnerName("  Bright \n  Desk ")).toBe("Bright Desk");
    expect(normalizePartnerName("x".repeat(80))).toHaveLength(80);
    for (const value of ["", "   ", "x".repeat(81), "Bright\u202EDesk", "Bright\u0000Desk", 42, null]) expect(normalizePartnerName(value), JSON.stringify(value)).toBeNull();
  });

  it("keeps a color as a lowercase six-digit hex code", () => {
    expect(normalizeBrandColor(" #0F766E ")).toBe("#0f766e");
    expect(normalizeBrandColor("#AbC")).toBe("#aabbcc");
    for (const value of ["0f766e", "#0f766", "#0f766e80", "teal", "", null]) expect(normalizeBrandColor(value), String(value)).toBeNull();
  });

  it("keeps slugs to DNS labels the host doesn't keep for itself", () => {
    expect(isPartnerSlug("acme")).toBe(true);
    for (const value of ["ac", "www", "xn--acme", "-acme", "Acme"]) expect(isPartnerSlug(value), value).toBe(false);
  });
});

describe("a partner business's access level", () => {
  it("is full or activity", () => {
    expect(isPartnerAccessLevel("full")).toBe(true);
    expect(isPartnerAccessLevel("activity")).toBe(true);
    for (const value of ["admin", "Full", "", null, 1]) expect(isPartnerAccessLevel(value), String(value)).toBe(false);
  });
});
