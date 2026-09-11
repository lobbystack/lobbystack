import { expect, it } from "vitest";

import { localeResources, resourcesForRoute } from "./i18n-resources";
import { SUPPORTED_LOCALES } from "./locale";

it("ships every supported locale with the same namespace keys", () => {
  const expected = Object.keys(localeResources.en).sort();
  expect(expected.length).toBeGreaterThan(0);
  for (const locale of SUPPORTED_LOCALES) {
    expect(Object.keys(localeResources[locale]).sort()).toEqual(expected);
  }
});

it("keeps the chrome strings the root providers need in every locale", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const common = localeResources[locale].common ?? {};
    const loading = (common.loading ?? {}) as Record<string, unknown>;
    expect(typeof loading.title).toBe("string");
    expect(typeof loading.failed).toBe("string");
    expect(typeof loading.retry).toBe("string");
  }
});

it("selects only the requested namespaces and skips unknown ones", () => {
  const selected = resourcesForRoute("fr", ["common", "auth", "not-a-namespace"]);
  expect(Object.keys(selected).sort()).toEqual(["auth", "common"]);
  expect(selected.auth).toBe(localeResources.fr.auth);
  expect(resourcesForRoute("fr", ["not-a-namespace"])).toEqual({});
});
