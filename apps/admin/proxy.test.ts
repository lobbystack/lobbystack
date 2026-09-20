import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());

it("skips known assets but retains proxy checks for application paths with extensions", () => {
  for (const url of ["/locales/en/auth.json", "/brand/logo-icon.svg", "/_next/static/chunk.js", "/favicon.ico"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  }
  for (const url of ["/api/contacts/contact.svg", "/embed.js", "/embed/key.svg", "/en/reset-password/token.txt", "/en/login"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  }
});

it("rejects cross-origin API mutations even when a dynamic identifier has an extension", () => {
  const response = proxy(new NextRequest("http://localhost:3210/api/contacts/contact.svg", { method: "PATCH", headers: { origin: "https://untrusted.invalid" } }));
  expect(response.status).toBe(403);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("overwrites supplied locale headers and tolerates malformed cookies", () => {
  const response = proxy(new NextRequest("http://localhost:3210/fr/login", { headers: { cookie: "lobbystack.locale=%E0%A4%A", "accept-language": "en", "x-lobbystack-locale": "en", "x-lobbystack-pathname": "/settings" } }));
  expect(response.headers.get("x-middleware-request-x-lobbystack-locale")).toBe("fr");
  expect(response.headers.get("x-middleware-request-x-lobbystack-pathname")).toBe("/fr/login");
  expect(response.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=3600");
  expect(response.headers.get("content-language")).toBe("fr");
  expect(response.headers.get("vary")).toBe("Accept-Encoding");
});

it("redirects legacy public URLs to a canonical locale while preserving safe query values", () => {
  const explicit = proxy(new NextRequest("http://localhost:3210/login?lng=fr&returnTo=%2Fsettings&campaign=fall", {
    headers: { cookie: "lobbystack.locale=en", "accept-language": "en-US" },
  }));
  expect(explicit.status).toBe(308);
  expect(explicit.headers.get("location")).toBe("http://localhost:3210/fr/login?returnTo=%2Fsettings&campaign=fall");
  expect(explicit.headers.get("set-cookie")).toContain("lobbystack.locale=fr");
  expect(explicit.headers.get("cache-control")).toBe("private, no-store");

  const fromCookie = proxy(new NextRequest("http://localhost:3210/signup", {
    headers: { cookie: "lobbystack.locale=fr", "accept-language": "en-US" },
  }));
  expect(fromCookie.headers.get("location")).toBe("http://localhost:3210/fr/signup");

  const fromHeader = proxy(new NextRequest("http://localhost:3210/forgot-password", {
    headers: { "accept-language": "fr-CA,fr;q=0.9" },
  }));
  expect(fromHeader.headers.get("location")).toBe("http://localhost:3210/fr/forgot-password");
});

it("keeps sensitive and dynamic responses private while caching fixed public pages", () => {
  for (const url of [
    "/en/reset-password/token-value",
    "/fr/verify-email?token=private",
    "/api/dashboard",
    "/api/realtime",
    "/embed/widget-key",
    "/agent",
    "/en/login?token=private",
  ]) {
    const response = proxy(new NextRequest(`http://localhost:3210${url}`));
    expect(response.headers.get("cache-control"), url).toContain("private");
    expect(response.headers.get("cache-control"), url).toContain("no-store");
  }

  const publicResponse = proxy(new NextRequest("http://localhost:3210/en/signup?campaign=fall"));
  expect(publicResponse.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=3600");
  expect(publicResponse.headers.get("content-language")).toBe("en");
  expect(publicResponse.headers.get("vary")).toBe("Accept-Encoding");
});

it("fails closed for API requests during maintenance while leaving health reads available", () => {
  vi.stubEnv("LOBBYSTACK_MAINTENANCE_MODE", "true");

  const mutation = proxy(new NextRequest("http://localhost:3210/api/contacts", { method: "POST" }));
  expect(mutation.status).toBe(503);
  expect(mutation.headers.get("retry-after")).toBe("60");
  expect(mutation.headers.get("cache-control")).toBe("no-store");

  expect(proxy(new NextRequest("http://localhost:3210/api/health/live")).status).toBe(200);
  expect(proxy(new NextRequest("http://localhost:3210/api/dashboard")).status).toBe(503);
  expect(proxy(new NextRequest("http://localhost:3210/voice/context")).status).toBe(503);
  expect(proxy(new NextRequest("http://localhost:3210/voice/context/by-slug")).status).toBe(503);
  // The signed handler is responsible for authentication and its maintenance 503.
  expect(proxy(new NextRequest("http://localhost:3210/voice/ready")).status).toBe(200);
});

it("rejects webhooks before their handlers can acknowledge events during maintenance", () => {
  vi.stubEnv("LOBBYSTACK_MAINTENANCE_MODE", "true");

  const response = proxy(new NextRequest("http://localhost:3210/api/webhooks/twilio/sms", { method: "POST" }));
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("60");
});
