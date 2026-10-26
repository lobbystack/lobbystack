import { afterEach, describe, expect, it, vi } from "vitest";

import { parseBrandingResponse } from "@/lib/branding-snapshot";

const fixture = vi.hoisted(() => ({ saved: vi.fn(async () => [{ appName: "Acme Desk", logoVersion: "abc" }]) }));
const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
// deployment_branding as the app role reads it, and one partner with a subdomain.
vi.mock("@/lib/databases", async () => {
  const { fakeBrandDatabase } = await import("@/lib/brand-database.fake");
  return { getDatabase: () => ({ db: fakeBrandDatabase({ saved: () => fixture.saved(), partners: () => [{ partnerId, name: "Bright Desk", subdomain: "bright.portal.example.test", logoVersion: "def" }] }) }) };
});
vi.mock("@/lib/error-reporting", () => ({ reportServerError: vi.fn() }));

import { forgetCachedBranding } from "@/lib/branding";
import { throughProxy } from "@/lib/proxy-pipeline.fake";
import { GET } from "./route";

const visit = (url: string, headers: Record<string, string> = {}) => throughProxy(GET, url, { headers });

afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBranding();
});

describe("branding route", () => {
  it("answers a prerendered page with the name and logo of its hostname's brand", async () => {
    vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
    const response = await visit("https://desk.example.test/api/branding");
    const body = await response.json();
    expect(body).toEqual({ appName: "Acme Desk", logoUrl: "/api/branding/logo?v=abc" });
    expect(parseBrandingResponse(body)).toEqual(body);
  });

  it("answers a partner's subdomain with the partner's name and logo, and an unknown hostname with a 404", async () => {
    vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
    vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
    const partner = await visit("https://bright.portal.example.test/api/branding");
    expect(await partner.json()).toEqual({ appName: "Bright Desk", logoUrl: `/api/branding/logo?partner=${partnerId}&v=def` });
    const unknown = await visit("https://other.portal.example.test/api/branding");
    expect(unknown.status).toBe(404);
    // A client's own copy of the proxy's header gets it the host brand on the host's domain, nothing more.
    const forged = await visit("https://desk.example.test/api/branding", { "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" });
    expect(await forged.json()).toEqual({ appName: "Acme Desk", logoUrl: "/api/branding/logo?v=abc" });
  });

  it("answers a request the proxy resolved no brand for with a 404, not the host's brand", async () => {
    const response = await GET(new Request("http://0.0.0.0:3000/api/branding", { headers: { host: "localhost:3000" } }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found.", code: "unknown_host" });
  });

  it("answers with the environment's choice over the saved one", async () => {
    vi.stubEnv("BRAND_APP_NAME", "Front Desk");
    vi.stubEnv("BRAND_LOGO_URL", "https://cdn.example.test/logo.svg");
    const response = await visit("http://localhost:3000/api/branding");
    expect(await response.json()).toEqual({ appName: "Front Desk", logoUrl: "https://cdn.example.test/logo.svg" });
  });
});
