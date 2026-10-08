import type { ReactElement } from "react";
import { expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@lobbystack/domain", () => ({ getActiveOnboardingState: async () => ({ stage: "complete" }), resolveOnboardingRoute: () => "/" }));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ user: { id: "user", email: "owner@example.com", name: "Owner" } }) }));
vi.mock("@/lib/api-helpers", () => ({ getAppDatabase: () => ({ db: {} }) }));
vi.mock("@/app/root-document", () => ({ RootDocument: () => null, appMetadata: {} }));
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
