import { afterEach, describe, expect, it, vi } from "vitest";

import { parseBrandingResponse } from "@/lib/branding-snapshot";

const fixture = vi.hoisted(() => ({ saved: vi.fn(async () => [{ appName: "Acme Desk", logoVersion: "abc" }]) }));
// deployment_branding as the app role reads it.
vi.mock("@/lib/databases", () => ({ getDatabase: () => ({ db: { select: () => ({ from: () => ({ limit: fixture.saved }) }) } }) }));
vi.mock("@/lib/error-reporting", () => ({ reportServerError: vi.fn() }));
vi.mock("@lobbystack/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@lobbystack/domain")>();
  return { ...actual, resolveHostBrand: vi.fn(actual.resolveHostBrand) };
});

import { resolveHostBrand } from "@lobbystack/domain";
import { forgetCachedBranding } from "@/lib/branding";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBranding();
});

describe("branding route", () => {
  it("answers a prerendered page with the name and logo of its hostname's brand", async () => {
    const response = await GET(new Request("http://0.0.0.0:3000/api/branding", { headers: { host: "desk.example.test" } }));
    const body = await response.json();
    expect(body).toEqual({ appName: "Acme Desk", logoUrl: "/api/branding/logo?v=abc" });
    expect(parseBrandingResponse(body)).toEqual(body);
  });

  it("answers a hostname no brand answers for with a 404, not the host's brand", async () => {
    vi.mocked(resolveHostBrand).mockResolvedValueOnce(null);
    const response = await GET(new Request("http://0.0.0.0:3000/api/branding", { headers: { host: "unknown.example" } }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found.", code: "unknown_host" });
  });

  it("answers with the environment's choice over the saved one", async () => {
    vi.stubEnv("BRAND_APP_NAME", "Front Desk");
    vi.stubEnv("BRAND_LOGO_URL", "https://cdn.example.test/logo.svg");
    const response = await GET(new Request("http://0.0.0.0:3000/api/branding", { headers: { host: "localhost:3000" } }));
    expect(await response.json()).toEqual({ appName: "Front Desk", logoUrl: "https://cdn.example.test/logo.svg" });
  });
});
