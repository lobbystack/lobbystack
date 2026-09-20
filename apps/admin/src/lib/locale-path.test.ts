import { describe, expect, it } from "vitest";

import {
  isLegacyPublicRoutePath,
  isPublicRoutePath,
  isTokenBearingRoute,
  localeFromPathname,
  localizePublicPath,
  stripLocalePrefix,
} from "./locale-path";

describe("locale paths", () => {
  it("detects and removes supported locale prefixes", () => {
    expect(localeFromPathname("/fr/login")).toBe("fr");
    expect(localeFromPathname("/de/login")).toBeNull();
    expect(stripLocalePrefix("/en/reset-password/token")).toBe("/reset-password/token");
    expect(stripLocalePrefix("/settings")).toBe("/settings");
  });

  it("localizes public paths without changing dashboard paths", () => {
    expect(localizePublicPath("/login?returnTo=%2Fsettings", "fr")).toBe("/fr/login?returnTo=%2Fsettings");
    expect(localizePublicPath("/en/signup", "fr")).toBe("/fr/signup");
    expect(localizePublicPath("/settings", "fr")).toBe("/fr/settings");
  });

  it("classifies canonical, legacy, and token-bearing routes", () => {
    expect(isPublicRoutePath("/en/login")).toBe(true);
    expect(isPublicRoutePath("/login")).toBe(true);
    expect(isLegacyPublicRoutePath("/reset-password/token")).toBe(true);
    expect(isLegacyPublicRoutePath("/settings")).toBe(false);
    expect(isTokenBearingRoute("/fr/reset-password/token", new URLSearchParams())).toBe(true);
    expect(isTokenBearingRoute("/en/verify-email", new URLSearchParams("token=private"))).toBe(true);
    expect(isTokenBearingRoute("/en/login", new URLSearchParams())).toBe(false);
  });
});
