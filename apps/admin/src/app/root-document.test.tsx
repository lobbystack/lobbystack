import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  saved: vi.fn(async () => [{ appName: "Acme Desk", logoVersion: null }]),
  headers: vi.fn(async () => new Headers({ host: "desk.example.test" })),
}));
// deployment_branding as the app role reads it.
vi.mock("@/lib/databases", () => ({ getDatabase: () => ({ db: { select: () => ({ from: () => ({ limit: fixture.saved }) }) } }) }));
vi.mock("@/lib/error-reporting", () => ({ reportServerError: vi.fn() }));
vi.mock("next/headers", () => ({ headers: fixture.headers }));
vi.mock("@/app/providers", () => ({ Providers: () => null }));
vi.mock("@/lib/i18n-resources", () => ({ resourcesForRoute: () => ({ common: {} }) }));

import { buildTimeBrandingSnapshot, forgetCachedBranding } from "@/lib/branding";
import { RootDocument, generateBrandingMetadata } from "./root-document";

type Document = ReactElement<{ children: ReactElement<{ children: ReactElement<{ branding: unknown }> }> }>;

afterEach(() => {
  forgetCachedBranding();
  vi.clearAllMocks();
});

describe("the root document", () => {
  it("renders a page rendered per request under its hostname's brand, title and tab included", async () => {
    const document = await RootDocument({ children: null, locale: "en", localeSource: "default", namespaces: ["common"] }) as Document;
    expect(document.props.children.props.children.props.branding).toEqual({ appName: "Acme Desk", logoUrl: null, final: true });
    expect(fixture.headers).toHaveBeenCalled();
    // A renamed deployment with no logo of its own shows no LobbyStack mark in the tab.
    expect(await generateBrandingMetadata()).toEqual({ title: "Acme Desk", description: "AI receptionist dashboard" });
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
