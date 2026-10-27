import type { ReactElement } from "react";
import { expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/app/root-document", () => ({ RootDocument: () => null, generateBrandingMetadata: async () => ({}) }));
vi.mock("../globals.css", () => ({}));

import { createI18nInstance, missingNamespaces } from "@/i18n";
import { resourcesForRoute } from "@/lib/i18n-resources";
import { routeNamespaces } from "@/lib/route-namespaces";
import PartnerLayout from "./layout";

it("ships every console page's translations, so client navigation never requests one", async () => {
  const document = await PartnerLayout({ children: null }) as ReactElement<{ namespaces: readonly string[] }>;
  for (const locale of ["en", "fr", "es", "sr"] as const) {
    const i18n = createI18nInstance({ locale, resources: resourcesForRoute(locale, document.props.namespaces) });
    for (const path of ["/partner/login", "/partner/signup", "/partner/accept-invite", "/partner/id/businesses", "/partner/id/team"]) {
      expect(missingNamespaces(i18n, locale, routeNamespaces(path)), `${locale} ${path}`).toEqual([]);
    }
  }
});
