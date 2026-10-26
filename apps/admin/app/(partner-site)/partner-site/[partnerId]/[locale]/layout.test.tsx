import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BrandingSnapshot } from "@/lib/branding-snapshot";
import { PARTNER_SITE_REVALIDATE_SECONDS } from "@/lib/partner-site";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const fixture = vi.hoisted(() => ({ headers: vi.fn() }));
// The partners the app role reads brands from.
vi.mock("@/lib/databases", async () => {
  const { fakeBrandDatabase } = await import("@/lib/brand-database.fake");
  return { getDatabase: () => ({ db: fakeBrandDatabase({ saved: async () => [], partners: () => [{ partnerId, name: "Bright Desk", subdomain: "bright.portal.example.test", logoVersion: "def", color: "#0f766e" }] }) }) };
});
vi.mock("@/lib/error-reporting", () => ({ reportServerError: vi.fn() }));
// A static page must never read the request.
vi.mock("next/headers", () => ({ headers: fixture.headers }));
vi.mock("@/app/providers", () => ({ Providers: () => null }));
vi.mock("../../../../globals.css", () => ({}));

import { forgetCachedBranding } from "@/lib/branding";
import PartnerSiteLayout, { generateMetadata, generateStaticParams } from "./layout";

type Document = ReactElement<{ locale: string; localeSource: string; branding: BrandingSnapshot }>;
const params = (values: { partnerId: string; locale: string }) => Promise.resolve(values);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  forgetCachedBranding();
});

describe("a partner's copy of the public pages", () => {
  it("renders with the partner's brand from its id alone, so every visitor shares one static copy", async () => {
    vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
    const document = await PartnerSiteLayout({ children: null, params: params({ partnerId, locale: "fr" }) }) as Document;
    expect(document.props).toMatchObject({ locale: "fr", localeSource: "path" });
    const logo = `/api/branding/logo?partner=${partnerId}&v=def`;
    expect(document.props.branding).toEqual({ appName: "Bright Desk", logoUrl: logo, final: true, partner: { faviconUrl: logo, color: "#0f766e", links: { terms: null, privacy: null, support: null } } });
    expect(await generateMetadata({ params: params({ partnerId, locale: "fr" }) })).toMatchObject({ title: "Bright Desk", icons: { icon: logo } });
    expect(fixture.headers).not.toHaveBeenCalled();
  });

  it("answers an unknown partner or locale with a 404", async () => {
    for (const values of [{ partnerId: "8d0c2f4e-7b1a-4c3d-9e5f-0a1b2c3d4e5f", locale: "en" }, { partnerId: "not-a-partner", locale: "en" }, { partnerId, locale: "de" }]) {
      await expect(PartnerSiteLayout({ children: null, params: params(values) }), JSON.stringify(values)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    }
  });

  it("builds no copy ahead and renders each one again once the cache window passes", () => {
    expect(generateStaticParams()).toEqual([]);
    // Next.js reads `revalidate` from the source, so it can't name the constant.
    const source = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
    expect(source).toContain(`export const revalidate = ${PARTNER_SITE_REVALIDATE_SECONDS};`);
  });
});
