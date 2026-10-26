import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES } from "./locale";
import { PRERENDERED_PUBLIC_SECTIONS, isPartnerSitePath, partnerSitePages, partnerSitePath, partnerSiteRoot } from "./partner-site";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";

describe("partner site paths", () => {
  it("places each localized page the host prerenders in the partner's tree", () => {
    expect(partnerSitePath(partnerId, "/fr/login")).toBe(`/partner-site/${partnerId}/fr/login`);
    expect(partnerSitePath(partnerId, "/sr/reset-password")).toBe(`/partner-site/${partnerId}/sr/reset-password`);
    expect(partnerSiteRoot(partnerId)).toBe(`/partner-site/${partnerId}`);
  });

  it("leaves pages rendered per request, unlocalized paths and the dashboard alone", () => {
    for (const path of ["/en/verify-email", "/en/reset-password/token", "/en/demo/token", "/en/oauth/consent", "/login", "/calls", "/en", "/de/login"]) {
      expect(partnerSitePath(partnerId, path), path).toBeNull();
    }
  });

  it("knows the internal tree's own paths", () => {
    expect(isPartnerSitePath("/partner-site")).toBe(true);
    expect(isPartnerSitePath(`/partner-site/${partnerId}/en/login`)).toBe(true);
    expect(isPartnerSitePath("/partner-sites")).toBe(false);
    expect(isPartnerSitePath("/partner/signup")).toBe(false);
  });
});

describe("the pages partners get their own copy of", () => {
  const app = fileURLToPath(new URL("../../app/", import.meta.url));
  const sections = (directory: string) => readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(`${directory}/${entry.name}/page.tsx`))
    .map((entry) => entry.name)
    .sort();

  it("are every page the host prerenders, so no public page reaches a partner's host under the build's brand", () => {
    expect([...PRERENDERED_PUBLIC_SECTIONS].sort()).toEqual(sections(`${app}(public)/[locale]`));
    // scripts/verify-admin-prerender.ts fails the build when one of these isn't prerendered.
    const check = readFileSync(fileURLToPath(new URL("../../../../scripts/verify-admin-prerender.ts", import.meta.url)), "utf8");
    for (const section of PRERENDERED_PUBLIC_SECTIONS) expect(check, section).toContain(`"${section}",`);
  });

  it("each have a copy in the partner tree that renders the host's page", () => {
    const tree = `${app}(partner-site)/partner-site/[partnerId]/[locale]`;
    expect(sections(tree)).toEqual([...PRERENDERED_PUBLIC_SECTIONS].sort());
    for (const section of PRERENDERED_PUBLIC_SECTIONS) {
      expect(readFileSync(`${tree}/${section}/page.tsx`, "utf8"), section).toContain(`(public)/[locale]/${section}/page"`);
    }
  });

  it("are all named when a save renders a partner's pages again", () => {
    const pages = partnerSitePages(partnerId.toUpperCase());
    expect(pages).toHaveLength(SUPPORTED_LOCALES.length * PRERENDERED_PUBLIC_SECTIONS.size);
    expect(pages).toContain(`/partner-site/${partnerId}/sr/forgot-password`);
    for (const page of pages) expect(partnerSitePath(partnerId, page.slice(partnerSiteRoot(partnerId).length)), page).toBe(page);
  });
});
