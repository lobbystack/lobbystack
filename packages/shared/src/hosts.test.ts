import { describe, expect, it } from "vitest";

import { hostDomainHostnames, isHostDomain, normalizeHostname, partnerSubdomainLabel } from "./hosts";

describe("a request's hostname", () => {
  it("drops the case, the port and a trailing dot", () => {
    expect(normalizeHostname("Acme.Example.COM.:443")).toBe("acme.example.com");
    expect(normalizeHostname(" localhost:3000 ")).toBe("localhost");
    expect(normalizeHostname("127.0.0.1:13000")).toBe("127.0.0.1");
    expect(normalizeHostname("[::1]:3000")).toBe("[::1]");
    expect(normalizeHostname("[::1]")).toBe("[::1]");
  });

  it("names no hostname for anything a DNS name can't be", () => {
    for (const host of ["", "   ", null, undefined, "desk example.test", "desk_example.test", "desk.example.test:abc", "::1", "[::1", "[::1]x", "a/b", "-desk.example.test", `${"a".repeat(64)}.test`]) {
      expect(normalizeHostname(host), String(host)).toBeNull();
    }
  });
});

describe("the host's own domain", () => {
  const env = { APP_BASE_URL: "https://Desk.Example.test/app", AUTH_TRUSTED_ORIGINS: "https://alias.example.test, *.wild.example.test, myapp://callback", MARKETING_HOSTS: "www.example.test,example.test" };

  it("is APP_BASE_URL's hostname, the plain trusted origins and the marketing hosts", () => {
    expect([...hostDomainHostnames(env)].sort()).toEqual(["alias.example.test", "desk.example.test", "example.test", "www.example.test"]);
    // Without APP_BASE_URL, links go to localhost, so localhost is the host's.
    expect([...hostDomainHostnames({})]).toEqual(["localhost"]);
  });

  it("counts loopback names and development hosts only outside production", () => {
    const development = { ...env, NODE_ENV: "development", ALLOWED_DEV_ORIGINS: "abc.ngrok-free.app, *.trycloudflare.com" };
    for (const hostname of ["localhost", "127.0.0.1", "[::1]", "abc.ngrok-free.app", "x.trycloudflare.com", "desk.example.test"]) expect(isHostDomain(hostname, development), hostname).toBe(true);
    for (const hostname of ["unknown.localhost", "x.wild.example.test", "app.example.test", "trycloudflare.com"]) expect(isHostDomain(hostname, development), hostname).toBe(false);
    const production = { ...development, NODE_ENV: "production" };
    for (const hostname of ["localhost", "127.0.0.1", "abc.ngrok-free.app"]) expect(isHostDomain(hostname, production), hostname).toBe(false);
    expect(isHostDomain("desk.example.test", production)).toBe(true);
  });
});

describe("a partner's subdomain", () => {
  it("is one label directly under the partner base domain", () => {
    expect(partnerSubdomainLabel("acme.portal.example.test", "portal.example.test")).toBe("acme");
    expect(partnerSubdomainLabel("x.acme.portal.example.test", "portal.example.test")).toBeNull();
    expect(partnerSubdomainLabel("portal.example.test", "portal.example.test")).toBeNull();
    expect(partnerSubdomainLabel("acmeportal.example.test", "portal.example.test")).toBeNull();
  });
});
