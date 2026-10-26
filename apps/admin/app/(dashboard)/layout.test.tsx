import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => fixture.headers }));
const fixture = vi.hoisted(() => ({ onboarding: { stage: "complete", businessId: "business" as string | null }, partners: [] as Array<{ partnerId: string }>, businesses: [] as Array<{ businessId: string; capabilities: string[] }>, opened: null as string[] | null, headers: new Headers() }));
// Next's redirect throws, so nothing after it runs.
vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { to }); }) }));
vi.mock("@lobbystack/domain", () => ({ capabilityNames: ["activity", "setup", "team", "billing", "api_keys", "mcp"], getActiveOnboardingState: async () => fixture.onboarding, listUserPartners: async () => fixture.partners, listUserBusinesses: async () => fixture.businesses, readBusinessCapabilities: async () => fixture.opened, resolveOnboardingRoute: (stage: string) => stage === "website" ? "/onboarding/website" : "/onboarding/business" }));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ user: { id: "user", email: "owner@example.com", name: "Owner" } }) }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));
vi.mock("@/app/root-document", () => ({ RootDocument: () => null, generateBrandingMetadata: async () => ({}) }));
vi.mock("@/components/dashboard-shell", () => ({ DashboardShell: () => null }));
vi.mock("../globals.css", () => ({}));

import { createI18nInstance, missingNamespaces } from "@/i18n";
import { resourcesForRoute } from "@/lib/i18n-resources";
import { routeNamespaces } from "@/lib/route-namespaces";
import DashboardLayout from "./layout";

it("ships every section's translations, so client navigation never requests one", async () => {
  const document = await DashboardLayout({ children: null }) as ReactElement<{ namespaces: readonly string[] }>;
  const i18n = createI18nInstance({ locale: "en", resources: resourcesForRoute("en", document.props.namespaces) });

  for (const path of ["/", "/calls/id", "/agent/knowledge", "/affiliate", "/settings/team", "/demos"]) {
    expect(missingNamespaces(i18n, "en", routeNamespaces(path))).toEqual([]);
  }
});

beforeEach(() => {
  fixture.onboarding = { stage: "complete", businessId: "business" };
  fixture.partners = [];
  fixture.businesses = [{ businessId: "business", capabilities: ["activity", "setup", "team", "billing", "api_keys", "mcp"] }];
  fixture.opened = null;
  fixture.headers = new Headers({ "x-lobbystack-brand": "host" });
});

it("sends someone on a partner's team with no business of their own to the partner console", async () => {
  fixture.onboarding = { stage: "create_business", businessId: null };
  fixture.partners = [{ partnerId: "partner" }];
  await expect(DashboardLayout({ children: null })).rejects.toMatchObject({ to: "/partner" });
});

it("still sends someone with no business and no partner to onboarding", async () => {
  fixture.onboarding = { stage: "create_business", businessId: null };
  await expect(DashboardLayout({ children: null })).rejects.toMatchObject({ to: "/onboarding/business" });
});

it("links the account menu to the partner console only for someone on a partner's team", async () => {
  const shell = async () => ((await DashboardLayout({ children: null })) as ReactElement<{ children: ReactElement<{ partnerConsole: boolean }> }>).props.children.props.partnerConsole;
  expect(await shell()).toBe(false);
  fixture.partners = [{ partnerId: "partner" }];
  expect(await shell()).toBe(true);
});

it("on a partner's host, links to the console and sends someone there only for that partner's team", async () => {
  const PARTNER = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
  fixture.headers = new Headers({ "x-lobbystack-brand": `partner:${PARTNER}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" });
  const shell = async () => ((await DashboardLayout({ children: null })) as ReactElement<{ children: ReactElement<{ partnerConsole: boolean }> }>).props.children.props.partnerConsole;
  fixture.partners = [{ partnerId: "0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f" }];
  expect(await shell()).toBe(false);
  fixture.partners.push({ partnerId: PARTNER });
  expect(await shell()).toBe(true);
  fixture.onboarding = { stage: "create_business", businessId: null };
  await expect(DashboardLayout({ children: null })).rejects.toMatchObject({ to: "/partner" });
});

it("on a partner's host, shows someone with no business there the no-businesses page instead of the host's onboarding", async () => {
  fixture.headers = new Headers({ "x-lobbystack-brand": "partner:5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11", "x-lobbystack-brand-origin": "https://bright.portal.example.test" });
  fixture.onboarding = { stage: "create_business", businessId: null };
  await expect(DashboardLayout({ children: null })).rejects.toMatchObject({ to: "/no-businesses" });
  // Someone with a business there onboards in it as usual.
  fixture.onboarding = { stage: "website", businessId: "business" };
  await expect(DashboardLayout({ children: null })).rejects.toMatchObject({ to: "/onboarding/website" });
});

it("renders the dashboard with what the open business lets the person use", async () => {
  const capabilities = async () => ((await DashboardLayout({ children: null })) as ReactElement<{ children: ReactElement<{ capabilities: string[] }> }>).props.children.props.capabilities;
  expect(await capabilities()).toEqual(["activity", "setup", "team", "billing", "api_keys", "mcp"]);
  fixture.businesses = [{ businessId: "other", capabilities: ["activity", "setup", "team"] }, { businessId: "business", capabilities: ["activity"] }];
  expect(await capabilities()).toEqual(["activity"]);
});

it("reads what the open business allows from the business itself when the workspace list leaves it out, so the dashboard never hides every page", async () => {
  const capabilities = async () => ((await DashboardLayout({ children: null })) as ReactElement<{ children: ReactElement<{ capabilities: string[] }> }>).props.children.props.capabilities;
  // The list leaves out a business that's no longer active, such as a suspended one.
  fixture.businesses = [];
  fixture.opened = ["activity"];
  expect(await capabilities()).toEqual(["activity"]);
  // A business the person can't read at all keeps today's dashboard, and the server still refuses what it must.
  fixture.opened = null;
  expect(await capabilities()).toEqual(["activity", "setup", "team", "billing", "api_keys", "mcp"]);
});
