import { expect, it } from "vitest";

import { EMBED_PATH_PREFIXES, embeddableSecurityHeaders, isEmbeddablePath, securityHeaders, toNextHeaderList } from "./security-headers";

const env = { NODE_ENV: "production" } as Record<string, string | undefined>;

it("denies framing for regular app routes", () => {
  const headers = securityHeaders(env);
  expect(headers["X-Frame-Options"]).toBe("DENY");
  expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  expect(headers["X-Content-Type-Options"]).toBe("nosniff");
});

it("keeps embeddable routes frameable without conflicting framing headers", () => {
  const headers = embeddableSecurityHeaders(env);
  expect(headers).not.toHaveProperty("X-Frame-Options");
  expect(headers["Content-Security-Policy"]).toContain("frame-ancestors *");
  expect(headers["Content-Security-Policy"]).not.toContain("frame-ancestors 'none'");
  expect(headers["X-Content-Type-Options"]).toBe("nosniff");
});

it("classifies only the embed surfaces as embeddable", () => {
  for (const prefix of EMBED_PATH_PREFIXES) {
    expect(isEmbeddablePath(prefix)).toBe(true);
  }
  expect(isEmbeddablePath("/embed/abc123")).toBe(true);
  expect(isEmbeddablePath("/embedding")).toBe(false);
  expect(isEmbeddablePath("/embed")).toBe(false);
  expect(isEmbeddablePath("/login")).toBe(false);
});

it("converts header records into the next.config header list shape", () => {
  expect(toNextHeaderList({ "X-Frame-Options": "DENY" })).toEqual([{ key: "X-Frame-Options", value: "DENY" }]);
});
