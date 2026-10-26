import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Database } from "@lobbystack/db";

import { forgetCachedBrands, resolveHostBrand } from "./brands";

// brands.integration.test.ts covers what the database answers. This covers the
// hostnames Brands answers without it.

const unreadable = { db: { execute: async () => { throw new Error("database unavailable"); } } as unknown as Database };

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
  vi.stubEnv("AUTH_TRUSTED_ORIGINS", "");
  vi.stubEnv("MARKETING_HOSTS", "");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("CLOUDFLARE_SAAS_API_TOKEN", "");
  vi.stubEnv("CLOUDFLARE_SAAS_ZONE_ID", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

it("answers a hostname no partner can have with no brand, without reading the database", async () => {
  // Health checks on 127.0.0.1, a platform's preview hostname, an internal name, the base domain itself, and a name two levels under it.
  for (const host of ["127.0.0.1", "127.0.0.1:3000", "[::1]", "preview-123.up.railway.app", "admin.internal", "portal.example.test", "x.bright.portal.example.test"]) {
    expect(await resolveHostBrand(unreadable, host), host).toBeNull();
  }
  vi.stubEnv("PARTNER_BASE_DOMAIN", "");
  expect(await resolveHostBrand(unreadable, "bright.portal.example.test")).toBeNull();
});

it("reads the database for a subdomain of the partner base domain, and for any hostname once partners bring their own domains", async () => {
  await expect(resolveHostBrand(unreadable, "bright.portal.example.test")).rejects.toThrow("database unavailable");
  await expect(resolveHostBrand(unreadable, "app.bright.example.test")).resolves.toBeNull();
  vi.stubEnv("CLOUDFLARE_SAAS_API_TOKEN", "test-token");
  vi.stubEnv("CLOUDFLARE_SAAS_ZONE_ID", "test-zone");
  await expect(resolveHostBrand(unreadable, "app.bright.example.test")).rejects.toThrow("database unavailable");
});
