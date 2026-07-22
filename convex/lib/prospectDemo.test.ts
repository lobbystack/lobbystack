import { describe, expect, it } from "vitest";

import {
  generateProspectDemoToken,
  hashProspectDemoToken,
  isProspectDemoExpired,
  isProspectDemoIntakeToolAllowed,
  normalizeProspectDemoLocale,
  resolveProspectDemoPublicState,
  PROSPECT_DEMO_TOKEN_OPAQUE_LENGTH,
} from "./prospectDemo";

describe("prospectDemo helpers", () => {
  it("normalizes locale variants to runtime locales", () => {
    expect(normalizeProspectDemoLocale("fr-CA")).toBe("fr");
    expect(normalizeProspectDemoLocale("en-US")).toBe("en");
    expect(normalizeProspectDemoLocale(undefined)).toBe("en");
  });

  it("builds hybrid tokens from the business name plus an opaque suffix", () => {
    const token = generateProspectDemoToken("Plomberie Urgence Montréal (PUM)");
    expect(token).toMatch(
      new RegExp(
        `^plomberie-urgence-montreal-pum-[0-9A-Za-z]{${PROSPECT_DEMO_TOKEN_OPAQUE_LENGTH}}$`,
      ),
    );

    const emptyNameToken = generateProspectDemoToken("   ");
    expect(emptyNameToken).toMatch(
      new RegExp(`^demo-[0-9A-Za-z]{${PROSPECT_DEMO_TOKEN_OPAQUE_LENGTH}}$`),
    );

    const longName = "A".repeat(80);
    const longToken = generateProspectDemoToken(longName);
    const opaque = longToken.slice(-(PROSPECT_DEMO_TOKEN_OPAQUE_LENGTH + 1));
    expect(opaque).toMatch(
      new RegExp(`^-[0-9A-Za-z]{${PROSPECT_DEMO_TOKEN_OPAQUE_LENGTH}}$`),
    );
    expect(longToken.length).toBeLessThanOrEqual(
      48 + 1 + PROSPECT_DEMO_TOKEN_OPAQUE_LENGTH,
    );
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
    expect(
      resolveProspectDemoPublicState({
        status: "preparing",
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
