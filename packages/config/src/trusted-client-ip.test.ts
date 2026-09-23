import { afterEach, describe, expect, it, vi } from "vitest";

import {
  UNATTRIBUTABLE_CLIENT_IP,
  normalizeTrustedClientIp,
  resolveTrustedClientIp,
  resolveTrustedClientIpKey,
  trustedClientIp,
  trustedClientIpFromHeaders,
  trustedClientIpHeader,
} from "./trusted-client-ip";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

const request = (headers: Record<string, string>) =>
  new Request("https://voice.test/web-call/sessions", { headers });

describe("trustedClientIpHeader", () => {
  it("trusts nothing without an explicit opt-in", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
    expect(trustedClientIpHeader()).toBeUndefined();
  });

  it("accepts only the allowlisted configured header, case-insensitively", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "  X-Real-IP ");
    expect(trustedClientIpHeader()).toBe("x-real-ip");
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "CF-Connecting-IP");
    expect(trustedClientIpHeader()).toBe("cf-connecting-ip");
  });

  it("rejects forwarded-for and unknown opt-ins", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-forwarded-for");
    expect(trustedClientIpHeader()).toBeUndefined();
  });
});

describe("normalizeTrustedClientIp", () => {
  it("accepts only a single valid IPv4/IPv6 value", () => {
    expect(normalizeTrustedClientIp("203.0.113.2")).toBe("203.0.113.2");
    expect(normalizeTrustedClientIp(" 2001:db8::1 ")).toBe("2001:db8::1");
    expect(normalizeTrustedClientIp("203.0.113.1, 203.0.113.2")).toBeUndefined();
    expect(normalizeTrustedClientIp("not-an-ip")).toBeUndefined();
    expect(normalizeTrustedClientIp("")).toBeUndefined();
    expect(normalizeTrustedClientIp(undefined)).toBeUndefined();
  });
});

describe("trustedClientIp", () => {
  it("reads only the opted-in header", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    expect(
      trustedClientIp(
        request({
          "x-real-ip": "203.0.113.2",
          "x-forwarded-for": "10.0.0.1",
          "cf-connecting-ip": "198.51.100.3",
        }),
      ),
    ).toBe("203.0.113.2");
  });

  it("ignores a configured-but-invalid header value", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "cf-connecting-ip");
    expect(
      trustedClientIp(request({ "cf-connecting-ip": "203.0.113.1, 203.0.113.2" })),
    ).toBeUndefined();
    expect(trustedClientIp(request({ "cf-connecting-ip": "garbage" }))).toBeUndefined();
  });

  it("reads from bare headers for middleware contexts", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    expect(
      trustedClientIpFromHeaders(new Headers({ "x-real-ip": "203.0.113.9" })),
    ).toBe("203.0.113.9");
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

describe("resolveTrustedClientIp", () => {
  it("prefers the opted-in header over a spoofed forwarded-for", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    expect(
      resolveTrustedClientIp({
        headers: { "x-real-ip": "203.0.113.2", "x-forwarded-for": "10.0.0.1" },
        peerIp: "127.0.0.1",
        trustProxy: true,
      }),
    ).toEqual({ ip: "203.0.113.2", source: "trusted-header" });
  });

  it("fails closed when the configured header is missing, invalid, or duplicated", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    for (const value of [undefined, "", "garbage", "203.0.113.1, 203.0.113.2"]) {
      expect(
        resolveTrustedClientIp({
          headers: value === undefined ? {} : { "x-real-ip": value },
          peerIp: "127.0.0.1",
          trustProxy: false,
        }),
      ).toEqual({ ip: undefined, source: "unattributable" });
    }
    expect(
      resolveTrustedClientIp({
        headers: { "x-real-ip": ["203.0.113.2", "198.51.100.3"] },
        peerIp: "127.0.0.1",
        trustProxy: false,
      }),
    ).toEqual({ ip: undefined, source: "unattributable" });
  });

  it("uses the direct peer only without an opt-in and without proxy trust", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
    expect(
      resolveTrustedClientIp({ headers: {}, peerIp: "127.0.0.1", trustProxy: false }),
    ).toEqual({ ip: "127.0.0.1", source: "direct" });

    // Proxy-derived request.ip cannot be trusted without an explicit opt-in.
    expect(
      resolveTrustedClientIp({
        headers: { "x-forwarded-for": "203.0.113.10" },
        peerIp: "127.0.0.1",
        trustProxy: true,
      }),
    ).toEqual({ ip: undefined, source: "unattributable" });
  });
});

describe("resolveTrustedClientIpKey", () => {
  it("always returns a key and shares one bucket when unattributable", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    expect(
      resolveTrustedClientIpKey({ headers: {}, peerIp: "127.0.0.1", trustProxy: true }),
    ).toBe(UNATTRIBUTABLE_CLIENT_IP);
    expect(
      resolveTrustedClientIpKey({
        headers: { "x-real-ip": "203.0.113.2" },
        peerIp: "127.0.0.1",
        trustProxy: true,
      }),
    ).toBe("203.0.113.2");
  });
});
