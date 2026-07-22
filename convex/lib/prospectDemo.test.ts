import { describe, expect, it } from "vitest";

import {
  hashProspectDemoToken,
  isProspectDemoExpired,
  isProspectDemoIntakeToolAllowed,
  normalizeProspectDemoLocale,
  resolveProspectDemoPublicState,
} from "./prospectDemo";

describe("prospectDemo helpers", () => {
  it("normalizes locale variants to runtime locales", () => {
    expect(normalizeProspectDemoLocale("fr-CA")).toBe("fr");
    expect(normalizeProspectDemoLocale("en-US")).toBe("en");
    expect(normalizeProspectDemoLocale(undefined)).toBe("en");
  });

  it("hashes tokens deterministically", async () => {
    const first = await hashProspectDemoToken("abc123");
    const second = await hashProspectDemoToken("abc123");
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("resolves public states including expiry", () => {
    expect(
      resolveProspectDemoPublicState({
        status: "active",
        expiresAt: Date.now() + 10_000,
      }),
    ).toBe("active");
    expect(
      resolveProspectDemoPublicState({
        status: "active",
        expiresAt: Date.now() - 10_000,
      }),
    ).toBe("expired");
    expect(isProspectDemoExpired({ status: "claimed", expiresAt: 0 })).toBe(
      false,
    );
  });

  it("allows only intake tools", () => {
    expect(isProspectDemoIntakeToolAllowed("searchKnowledge")).toBe(true);
    expect(isProspectDemoIntakeToolAllowed("bookAppointment")).toBe(false);
  });
});
