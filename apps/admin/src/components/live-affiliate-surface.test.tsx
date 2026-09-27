// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createI18nInstance, loadRouteNamespaces, missingNamespaces } from "@/i18n";
import { localeResources } from "@/lib/i18n-resources";
import { routeNamespaces } from "@/lib/route-namespaces";

import en from "../../public/locales/en/affiliate.json";
import fr from "../../public/locales/fr/affiliate.json";
import { LiveAffiliateSurface } from "./live-affiliate-surface";

type Bundle = Record<string, unknown>;
const bundles = { en: en as Bundle, fr: fr as Bundle };
// jsdom replaces the global URL, so resolve the path from the module string.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "live-affiliate-surface.tsx"), "utf8");

function lookup(bundle: Bundle, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Bundle)[part] : undefined), bundle);
}

function leafKeys(bundle: Bundle, prefix = ""): string[] {
  return Object.entries(bundle).flatMap(([key, value]) => value && typeof value === "object" ? leafKeys(value as Bundle, `${prefix}${key}.`) : [`${prefix}${key}`]);
}

function placeholders(value: unknown): string[] {
  return typeof value === "string" ? [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]!).sort() : [];
}

/** Every key the surface can pass to `t`, including keys built from a mapped list. */
function usedKeys(): string[] {
  const keys = new Set([...source.matchAll(/\bt\("([^"]+)"/g)].map((match) => match[1]!));
  // `{["a", "b"].map((key) => ... t(`prefix.${key}.suffix`) ...)}`
  const mapped = [...source.matchAll(/\[((?:"[\w-]+",?\s*)+)\]\.map\(\(key\) =>/g)];
  mapped.forEach((match, index) => {
    const values = [...match[1]!.matchAll(/"([\w-]+)"/g)].map((value) => value[1]!);
    const segment = source.slice(match.index, mapped[index + 1]?.index ?? source.length);
    for (const template of segment.matchAll(/\bt\(`([\w.]*)\$\{key\}([\w.]*)`/g)) {
      for (const value of values) keys.add(`${template[1]}${value}${template[2]}`);
    }
  });
  // Commission and payout statuses render through `statuses.${status}`.
  for (const status of ["pending", "paid", "voided", "draft", "ready"]) keys.add(`statuses.${status}`);
  return [...keys].sort();
}

describe("affiliate translations", () => {
  it("finds the keys the surface renders", () => {
    const keys = usedKeys();
    expect(keys).toEqual(expect.arrayContaining(["title", "referral.title", "referral.copy", "terms.title", "terms.reward", "terms.days", "terms.minimum", "terms.hold", "stats.clicks", "stats.clicksDescription", "tabs.quickstart", "tabs.earnings", "tabs.payouts", "tabs.faq", "settings.open", "quickstart.share.title", "faq.refunds.answer"]));
    expect(keys.length).toBeGreaterThan(50);
  });

  it.each(["en", "fr"] as const)("defines every key the surface uses in %s", (locale) => {
    const missing = usedKeys().filter((key) => typeof lookup(bundles[locale], key) !== "string" || !(lookup(bundles[locale], key) as string).trim());
    expect(missing).toEqual([]);
  });

  it("keeps English and French in step, with the same placeholders", () => {
    expect(leafKeys(bundles.fr).sort()).toEqual(leafKeys(bundles.en).sort());
    for (const key of leafKeys(bundles.en)) expect([key, placeholders(lookup(bundles.fr, key))]).toEqual([key, placeholders(lookup(bundles.en, key))]);
  });

  it("registers the namespace for the /affiliate route in both locales", () => {
    for (const path of ["/affiliate", "/fr/affiliate"]) expect(routeNamespaces(path)).toContain("affiliate");
    expect(localeResources.en.affiliate).toBe(en);
    expect(localeResources.fr.affiliate).toBe(fr);
  });
});

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

describe("affiliate page rendering", () => {
  it.each(["en", "fr"] as const)("renders %s copy after client navigation loads the namespace", async (locale) => {
    // Client navigation keeps the dashboard layout, so /affiliate starts without
    // its namespace and must load it before the copy can render.
    const i18n = createI18nInstance({ locale, resources: { nav: localeResources[locale].nav! } });
    const request = vi.fn(async (url: string) => {
      const match = /^\/locales\/(en|fr)\/(\w+)\.json\?v=/.exec(url);
      const resources = match ? localeResources[match[1] as "en" | "fr"][match[2]!] : undefined;
      return resources ? Response.json(resources) : new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", request);
    await loadRouteNamespaces(i18n, locale, routeNamespaces("/affiliate"));
    expect(missingNamespaces(i18n, locale, routeNamespaces("/affiliate"))).toEqual([]);
    expect(request).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^/locales/${locale}/affiliate\\.json\\?v=`)));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["affiliate"], {
      profile: { id: "profile", referralCode: "partner", status: "active", payoutEmail: null, referralLink: "http://localhost/signup?via=partner" },
      stats: { clickCount: 3, referralCount: 1, conversionCount: 0, pendingCommissionCents: 0, paidCommissionCents: 0 },
      clicks: [], attributions: [], commissions: [], payouts: [],
    });
    render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><LiveAffiliateSurface /></QueryClientProvider></I18nextProvider>);

    const bundle = bundles[locale];
    for (const key of ["title", "referral.title", "referral.copy", "terms.title", "stats.clicks", "stats.clicksDescription", "tabs.quickstart", "tabs.earnings", "tabs.payouts", "tabs.faq", "settings.open", "quickstart.share.title"]) {
      expect(screen.getAllByText(lookup(bundle, key) as string).length, key).toBeGreaterThan(0);
    }
    const text = document.body.textContent ?? "";
    for (const key of usedKeys()) expect(text.includes(key) && !(lookup(bundle, key) as string).includes(key), key).toBe(false);
    const terms = screen.getByRole("link", { name: lookup(bundle, "terms.link") as string });
    expect(terms.getAttribute("href")).toBe(locale === "fr" ? "https://lobbystack.com/fr/terms/#affiliate-program" : "https://lobbystack.com/terms/#affiliate-program");
  });
});
