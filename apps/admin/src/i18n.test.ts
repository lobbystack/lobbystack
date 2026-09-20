import { afterEach, expect, it, vi } from "vitest";
import { createI18nInstance, loadRouteNamespaces, missingNamespaces } from "./i18n";

afterEach(() => vi.unstubAllGlobals());

it("uses English when a lazy French bundle fails without changing locale", async () => {
  const instance = createI18nInstance({ locale: "fr" });
  const request = vi.fn(async (url: string) => url.includes("/fr/") ? new Response(null, { status: 404 }) : Response.json({ greeting: "Hello" }));
  vi.stubGlobal("fetch", request);
  await loadRouteNamespaces(instance, "fr", ["fixture"]);
  expect(instance.t("greeting", { ns: "fixture" })).toBe("Hello");
  expect(instance.language).toBe("fr");
  expect(instance.hasResourceBundle("fr", "fixture")).toBe(false);
  expect(missingNamespaces(instance, "fr", ["fixture"])).toEqual([]);
  await loadRouteNamespaces(instance, "fr", ["fixture"]);
  expect(request).toHaveBeenCalledTimes(2);
});

it("allows retry when both languages fail and keeps server bundles offline", async () => {
  const instance = createI18nInstance({ locale: "fr", resources: { auth: { greeting: "Bonjour" } } });
  const request = vi.fn(async () => new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", request);
  await loadRouteNamespaces(instance, "fr", ["auth"]);
  expect(request).not.toHaveBeenCalled();
  await expect(loadRouteNamespaces(instance, "fr", ["fixture"])).rejects.toThrow();
  expect(missingNamespaces(instance, "fr", ["fixture"])).toEqual(["fixture"]);
  request.mockImplementation(async () => Response.json({ greeting: "Bonjour" }));
  await loadRouteNamespaces(instance, "fr", ["fixture"]);
  expect(instance.t("greeting", { ns: "fixture" })).toBe("Bonjour");
});

it("still requests French when English was already loaded on an earlier route", async () => {
  const instance = createI18nInstance({ locale: "en", resources: { fixture: { greeting: "Hello" } } });
  const request = vi.fn(async () => Response.json({ greeting: "Bonjour" }));
  vi.stubGlobal("fetch", request);
  await loadRouteNamespaces(instance, "fr", ["fixture"]);
  await instance.changeLanguage("fr");
  expect(request).toHaveBeenCalledWith("/locales/fr/fixture.json?v=development");
  expect(instance.t("greeting", { ns: "fixture" })).toBe("Bonjour");
});
