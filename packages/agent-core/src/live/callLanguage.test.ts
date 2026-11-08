import { defaultGreeting, type BusinessContextSnapshot } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { withCallLanguage } from "./callLanguage";

const snapshot = { displayName: "Maple Clinic", defaultLocale: "en", greeting: "Maple Clinic, how can I help?" } as BusinessContextSnapshot;

describe("withCallLanguage", () => {
  it("starts the call in the picked language, with the standard greeting in it", () => {
    const french = withCallLanguage(snapshot, "fr");
    expect(french.defaultLocale).toBe("fr");
    expect(french.greeting).toBe(defaultGreeting("Maple Clinic", "fr"));
    expect(french.displayName).toBe("Maple Clinic");
  });

  it("leaves the snapshot alone when no language was picked or it is the business's own", () => {
    expect(withCallLanguage(snapshot, undefined)).toBe(snapshot);
    expect(withCallLanguage(snapshot, "en")).toBe(snapshot);
  });

  it("does not change the snapshot it was given", () => {
    withCallLanguage(snapshot, "de");
    expect(snapshot.defaultLocale).toBe("en");
  });
});
