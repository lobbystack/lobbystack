import { afterEach, describe, expect, it, vi } from "vitest";

import { trustedClientIp, trustedClientIpFromHeaders, trustedClientIpHeader } from "./trusted-client-ip";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

const request = (headers: Record<string, string>) => new Request("https://admin.test/api", { headers });

describe("trusted client IP derivation", () => {
  it("trusts nothing without an explicit deployment opt-in", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
    expect(trustedClientIpHeader()).toBeUndefined();
    expect(trustedClientIp(request({ "x-forwarded-for": "203.0.113.1", "x-real-ip": "203.0.113.2", "cf-connecting-ip": "198.51.100.3" }))).toBeUndefined();
  });

  it("accepts only the configured, ingress-controlled header", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    expect(trustedClientIpHeader()).toBe("x-real-ip");
    expect(trustedClientIp(request({ "x-real-ip": "203.0.113.2", "x-forwarded-for": "10.0.0.1" }))).toBe("203.0.113.2");
    expect(trustedClientIp(request({ "cf-connecting-ip": "198.51.100.3" }))).toBeUndefined();
  });

  it("is case-insensitive about the configured header and rejects invalid values", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "CF-Connecting-IP");
    expect(trustedClientIpHeader()).toBe("cf-connecting-ip");
    expect(trustedClientIp(request({ "cf-connecting-ip": "198.51.100.3" }))).toBe("198.51.100.3");
    expect(trustedClientIp(request({ "cf-connecting-ip": "203.0.113.1, 203.0.113.2" }))).toBeUndefined();
    expect(trustedClientIp(request({ "cf-connecting-ip": "not-an-ip" }))).toBeUndefined();
    expect(trustedClientIp(request({ "cf-connecting-ip": "" }))).toBeUndefined();
  });

  it("reads from bare headers for the auth middleware context", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    expect(trustedClientIpFromHeaders(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("warns once in production when the opt-in is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const clientIp = await import("./trusted-client-ip");
    expect(clientIp.trustedClientIp(request({ "x-real-ip": "203.0.113.2" }))).toBeUndefined();
    expect(clientIp.trustedClientIp(request({ "x-real-ip": "203.0.113.2" }))).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("TRUSTED_CLIENT_IP_HEADER");
  });
});
