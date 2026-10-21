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

it("lets the logo route cache its versioned image and serves it without script", () => {
  const logo = proxy(new NextRequest("http://localhost:3210/api/branding/logo?v=abc"));
  expect(logo.headers.get("cache-control")).toBeNull();
  expect(logo.headers.get("content-security-policy")).toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
  expect(logo.headers.get("x-content-type-options")).toBe("nosniff");
  const branding = proxy(new NextRequest("http://localhost:3210/api/branding"));
  expect(branding.headers.get("cache-control")).toBe("private, no-store");
  expect(branding.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  const save = proxy(new NextRequest("http://localhost:3210/api/branding/initial", { method: "POST", headers: { origin: "https://untrusted.invalid" } }));
  expect(save.status).toBe(403);
});

it("guards the widget-keys admin route while leaving the public widget API open to other origins", () => {
  const adminRoute = proxy(new NextRequest("http://localhost:3210/api/widget-keys", { method: "POST", headers: { origin: "https://untrusted.invalid" } }));
  expect(adminRoute.status).toBe(403);
  const publicRoute = proxy(new NextRequest("http://localhost:3210/api/widget/session", { method: "POST", headers: { origin: "https://customer.example" } }));
  expect(publicRoute.status).toBe(200);
});

it("lets API clients PUT to signed local storage URLs without an Origin, and still guards the dashboard upload route", () => {
  const signedUpload = proxy(new NextRequest("http://localhost:3210/api/storage/local?token=signed", { method: "PUT" }));
  expect(signedUpload.status).toBe(200);
  const dashboardUpload = proxy(new NextRequest("http://localhost:3210/api/uploads", { method: "POST", headers: { origin: "https://untrusted.invalid" } }));
  expect(dashboardUpload.status).toBe(403);
  // Only the signed upload route itself is exempt, not routes whose paths start the same way.
  const lookalike = proxy(new NextRequest("http://localhost:3210/api/storage/local-files", { method: "PUT", headers: { origin: "https://untrusted.invalid" } }));
  expect(lookalike.status).toBe(403);
});

it("overwrites supplied locale headers and tolerates malformed cookies", () => {
  const response = proxy(new NextRequest("http://localhost:3210/fr/login", { headers: { cookie: "lobbystack.locale=%E0%A4%A", "accept-language": "en", "x-lobbystack-locale": "en", "x-lobbystack-pathname": "/settings" } }));
  expect(response.headers.get("x-middleware-request-x-lobbystack-locale")).toBe("fr");
  expect(response.headers.get("x-middleware-request-x-lobbystack-pathname")).toBe("/fr/login");
  expect(response.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=3600");
  expect(response.headers.get("content-language")).toBe("fr");
  expect(response.headers.get("vary")).toBe("Accept-Encoding");
});

it("serves Spanish and Serbian public pages with their language tags", () => {
  const spanish = proxy(new NextRequest("http://localhost:3210/es/login"));
  expect(spanish.headers.get("x-middleware-request-x-lobbystack-locale")).toBe("es");
  expect(spanish.headers.get("content-language")).toBe("es");

  const serbian = proxy(new NextRequest("http://localhost:3210/sr/signup"));
  expect(serbian.headers.get("x-middleware-request-x-lobbystack-locale")).toBe("sr");
  // Serbian pages are written in Latin script only.
  expect(serbian.headers.get("content-language")).toBe("sr-Latn");

  const negotiated = proxy(new NextRequest("http://localhost:3210/login", { headers: { "accept-language": "sr-RS,sr;q=0.9,en;q=0.4" } }));
  expect(negotiated.status).toBe(308);
  expect(negotiated.headers.get("location")).toBe("http://localhost:3210/sr/login");

  const explicit = proxy(new NextRequest("http://localhost:3210/fr/login?lng=es"));
  expect(explicit.headers.get("location")).toBe("http://localhost:3210/es/login");
  expect(explicit.headers.get("set-cookie")).toContain("lobbystack.locale=es");
});

it("opens the website widget's chat in the language its loader names, without saving it as the visitor's", () => {
  const chat = proxy(new NextRequest("http://localhost:3210/embed/wk_live_key?color=%230f766e&locale=fr", { headers: { cookie: "lobbystack.locale=es", "accept-language": "en-US" } }));
  expect(chat.headers.get("x-middleware-request-x-lobbystack-locale")).toBe("fr");
  expect(chat.headers.get("set-cookie")).toBeNull();

  // An older loader names no language, and a language the chat doesn't offer
  // is ignored: the chat starts in the visitor's.
  for (const url of ["/embed/wk_live_key?color=%230f766e", "/embed/wk_live_key?locale=de"]) {
    const older = proxy(new NextRequest(`http://localhost:3210${url}`, { headers: { "accept-language": "es-MX" } }));
    expect(older.headers.get("x-middleware-request-x-lobbystack-locale"), url).toBe("es");
  }
  // Only the widget's chat takes the language from its address.
  const dashboard = proxy(new NextRequest("http://localhost:3210/calls?locale=fr", { headers: { "accept-language": "en-US" } }));
  expect(dashboard.headers.get("x-middleware-request-x-lobbystack-locale")).toBe("en");
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

  // Streams must reach the browser as they're written, so proxies may not compress or buffer them.
  for (const url of ["/api/realtime", "/api/widget/chat", "/api/widget/stream"]) {
    expect(proxy(new NextRequest(`http://localhost:3210${url}`)).headers.get("cache-control"), url).toBe("private, no-cache, no-store, no-transform");
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
});

it("rejects webhooks before their handlers can acknowledge events during maintenance", () => {
  vi.stubEnv("LOBBYSTACK_MAINTENANCE_MODE", "true");

  const response = proxy(new NextRequest("http://localhost:3210/api/webhooks/twilio/sms", { method: "POST" }));
  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("60");
});
