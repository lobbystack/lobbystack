import { describe, expect, it } from "vitest";

import { isPrivateNetworkAddress } from "./internalRequest";

describe("isPrivateNetworkAddress", () => {
  it("accepts loopback and RFC1918 addresses", () => {
    expect(isPrivateNetworkAddress("127.0.0.1")).toBe(true);
    expect(isPrivateNetworkAddress("::1")).toBe(true);
    expect(isPrivateNetworkAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateNetworkAddress("::ffff:10.0.0.5")).toBe(true);
    expect(isPrivateNetworkAddress("10.0.0.5")).toBe(true);
    expect(isPrivateNetworkAddress("192.168.1.20")).toBe(true);
    expect(isPrivateNetworkAddress("172.17.0.1")).toBe(true);
    expect(isPrivateNetworkAddress("169.254.1.2")).toBe(true);
  });

  it("accepts common private IPv6 ranges", () => {
    expect(isPrivateNetworkAddress("fd00::1")).toBe(true);
    expect(isPrivateNetworkAddress("fc00::abcd")).toBe(true);
    expect(isPrivateNetworkAddress("fe80::1")).toBe(true);
  });

  it("rejects public addresses", () => {
    expect(isPrivateNetworkAddress("8.8.8.8")).toBe(false);
    expect(isPrivateNetworkAddress("203.0.113.10")).toBe(false);
    expect(isPrivateNetworkAddress("2001:4860:4860::8888")).toBe(false);
    expect(isPrivateNetworkAddress(undefined)).toBe(false);
  });
});
