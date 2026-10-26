import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const fixture = vi.hoisted(() => ({
  saved: vi.fn(async (): Promise<Array<{ appName: string | null; logoVersion: string | null }>> => [{ appName: "Acme Desk", logoVersion: null }]),
  // What the proxy passes on for the host's own domain.
  headers: vi.fn(async () => new Headers({ host: "desk.example.test", "x-lobbystack-brand": "host" })),
}));
// deployment_branding as the app role reads it, and one partner's brand.
vi.mock("@/lib/databases", async () => {
  const { fakeBrandDatabase } = await import("@/lib/brand-database.fake");
  return { getDatabase: () => ({ db: fakeBrandDatabase({ saved: () => fixture.saved(), partners: () => [{ partnerId, name: "Bright Desk", subdomain: "bright.portal.example.test", logoVersion: "def", color: "#fde047" }] }) }) };
});
vi.mock("@/lib/error-reporting", () => ({ reportServerError: vi.fn() }));
vi.mock("next/headers", () => ({ headers: fixture.headers }));
vi.mock("@/app/providers", () => ({ Providers: () => null }));
vi.mock("@/lib/i18n-resources", () => ({ resourcesForRoute: () => ({ common: {} }) }));

import { buildTimeBrandingSnapshot, forgetCachedBranding } from "@/lib/branding";
import { RootDocument, generateBrandingMetadata } from "./root-document";
import { WidgetDocument } from "./widget-document";

type Document = ReactElement<{ children: ReactElement<{ style?: Record<string, string>; children: ReactElement<{ branding: unknown }> }> }>;

afterEach(() => {
  forgetCachedBranding();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  fixture.headers.mockResolvedValue(new Headers({ host: "desk.example.test", "x-lobbystack-brand": "host" }));
});

describe("the root document", () => {
  it("renders a page rendered per request under its hostname's brand, title and tab included", async () => {
    vi.stubEnv("APP_BASE_URL", "https://desk.example.test");
    const document = await RootDocument({ children: null, locale: "en", localeSource: "default", namespaces: ["common"] }) as Document;
    expect(document.props.children.props.children.props.branding).toEqual({ appName: "Acme Desk", logoUrl: null, final: true });
    expect(fixture.headers).toHaveBeenCalled();
    // A renamed deployment with no logo of its own shows no LobbyStack mark in the tab.
    expect(await generateBrandingMetadata()).toEqual({ title: "Acme Desk", description: "AI receptionist dashboard" });
    expect(document.props.children.props.style).toBeUndefined();
  });

  it("renders a page on a partner's host under the partner's brand, color, tab and links", async () => {
    vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
    fixture.headers.mockResolvedValue(new Headers({ host: "desk.example.test", "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" }));
    const document = await RootDocument({ children: null, locale: "en", localeSource: "default", namespaces: ["common"] }) as Document;
    const logo = `/api/branding/logo?partner=${partnerId}&v=def`;
    expect(document.props.children.props.children.props.branding).toEqual({ appName: "Bright Desk", logoUrl: logo, final: true, partner: { faviconUrl: logo, color: "#fde047", links: { terms: null, privacy: null, support: null } } });
    // A light color gets the dark text that reads on it.
    expect(document.props.children.props.style).toEqual({ "--primary": "#fde047", "--primary-foreground": "oklch(0.205 0 0)", "--ring": "#fde047" });
    expect(await generateBrandingMetadata()).toEqual({ title: "Bright Desk", description: "AI receptionist dashboard", icons: { icon: logo } });
    expect(fixture.saved).not.toHaveBeenCalled();
  });

  it("answers a request the proxy resolved no brand for with a 404", async () => {
    fixture.headers.mockResolvedValue(new Headers({ host: "desk.example.test" }));
    await expect(RootDocument({ children: null, locale: "en", localeSource: "default", namespaces: ["common"] })).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("renders a prerendered page from what its build knows, without reading the request or the database", async () => {
    const branding = buildTimeBrandingSnapshot({});
    const document = await RootDocument({ branding, children: null, locale: "fr", localeSource: "path", namespaces: ["common"] }) as Document;
    expect(document.props.children.props.children.props.branding).toBe(branding);
    expect(branding).toEqual({ appName: "LobbyStack", logoUrl: null, final: false });
    expect(fixture.headers).not.toHaveBeenCalled();
    expect(fixture.saved).not.toHaveBeenCalled();
  });
});

describe("the website widget's frame", () => {
  it("shows the partner's brand when its host serves the frame, and the host's on the host's domain", async () => {
    type Frame = ReactElement<{ children: ReactElement<{ children: ReactElement<{ branding: unknown }> }> }>;
    vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
    fixture.headers.mockResolvedValue(new Headers({ host: "bright.portal.example.test", "x-lobbystack-brand": `partner:${partnerId}`, "x-lobbystack-brand-origin": "https://bright.portal.example.test" }));
    const partner = await WidgetDocument({ children: null, locale: "en", namespaces: ["common"] }) as Frame;
    expect(partner.props.children.props.children.props.branding).toMatchObject({ appName: "Bright Desk", logoUrl: `/api/branding/logo?partner=${partnerId}&v=def`, partner: { color: "#fde047" } });
    fixture.headers.mockResolvedValue(new Headers({ host: "desk.example.test", "x-lobbystack-brand": "host" }));
    const host = await WidgetDocument({ children: null, locale: "en", namespaces: ["common"] }) as Frame;
    expect(host.props.children.props.children.props.branding).toEqual({ appName: "Acme Desk", logoUrl: null, final: true });
  });
});
