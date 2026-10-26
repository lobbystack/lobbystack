import { describe, expect, it } from "vitest";

import { brandColorStyle } from "./brand-color";
import { readResolvedBrand, setBrandHeaders, trustedOriginsFor, visitorOrigin, withoutBrandHeaders } from "./request-brand";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";

describe("the brand the proxy passes on", () => {
  it("names the origin a visitor used with APP_BASE_URL's scheme, since TLS ends before the admin", () => {
    expect(visitorOrigin("Bright.Portal.Example.Test.", { APP_BASE_URL: "https://app.example.test" })).toBe("https://bright.portal.example.test");
    expect(visitorOrigin("bright.portal.example.test:443", { APP_BASE_URL: "https://app.example.test" })).toBe("https://bright.portal.example.test");
    expect(visitorOrigin("bright.partners.localhost:13000", { APP_BASE_URL: "http://localhost:13000" })).toBe("http://bright.partners.localhost:13000");
    expect(visitorOrigin("not a host", {})).toBeNull();
  });

  it("replaces whatever a client sent with what the proxy resolved", () => {
    const forged = new Headers({ "x-lobbystack-brand": "host", "x-lobbystack-brand-origin": "https://evil.example", cookie: "a=b" });
    const stripped = withoutBrandHeaders(forged);
    expect([...stripped.keys()]).toEqual(["cookie"]);
    expect(readResolvedBrand(setBrandHeaders(stripped, { kind: "partner", partnerId, origin: "https://bright.portal.example.test" }))).toEqual({ kind: "partner", partnerId, origin: "https://bright.portal.example.test" });
    expect(readResolvedBrand(setBrandHeaders(new Headers(forged), null))).toBeNull();
    expect(readResolvedBrand(setBrandHeaders(new Headers(forged), { kind: "host" }))).toEqual({ kind: "host" });
  });

  it("trusts the host's configured origins on its domain and only the resolved origin on a partner's host", () => {
    const env = { APP_BASE_URL: "https://app.example.test", AUTH_TRUSTED_ORIGINS: "https://alias.example.test" };
    expect(trustedOriginsFor({ kind: "host" }, env)).toEqual(["https://app.example.test", "https://alias.example.test"]);
    expect(trustedOriginsFor({ kind: "partner", partnerId, origin: "https://bright.portal.example.test" }, env)).toEqual(["https://bright.portal.example.test"]);
    expect(trustedOriginsFor(null, env)).toEqual([]);
  });
});

describe("a partner's color", () => {
  it("takes the place of the primary color with whichever text reads on it", () => {
    expect(brandColorStyle("#0f172a")).toEqual({ "--primary": "#0f172a", "--primary-foreground": "oklch(0.985 0 0)", "--ring": "#0f172a" });
    expect(brandColorStyle("#fde047")).toMatchObject({ "--primary-foreground": "oklch(0.205 0 0)" });
    expect(brandColorStyle(null)).toBeUndefined();
    expect(brandColorStyle("red; background: url(x)")).toBeUndefined();
  });
});
