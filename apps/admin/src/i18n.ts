import i18next, { type i18n as I18nextInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, resolveLocale, type SupportedLocale } from "@/lib/locale";

import commonEn from "../public/locales/en/common.json";
import commonFr from "../public/locales/fr/common.json";

export type I18nNamespaceResources = Record<string, Record<string, unknown>>;
export type I18nResources = Record<string, I18nNamespaceResources>;

let fallbackInstance: I18nextInstance | undefined;

/** Chrome strings every route needs, available without a network request. */
const chromeResources: I18nResources = {
  en: { common: commonEn },
  fr: { common: commonFr },
};

/**
 * Creates the i18n instance used for a single render tree.
 *
 * The instance is seeded with the locale and namespaces the server resolved, so
 * the first paint (server render and hydration) is already localized and never
 * depends on a client-side translation fetch.
 */
export function createI18nInstance(input: {
  locale: SupportedLocale;
  resources?: I18nNamespaceResources;
}): I18nextInstance {
  const instance = i18next.createInstance();
  instance.use(initReactI18next);

  const resources: I18nResources = {};
  for (const [locale, namespaces] of Object.entries(chromeResources)) {
    resources[locale] = { ...namespaces };
  }
  for (const [namespace, bundle] of Object.entries(input.resources ?? {})) {
    resources[input.locale] = { ...resources[input.locale], [namespace]: bundle };
  }

  void instance.init({
    lng: input.locale,
    supportedLngs: SUPPORTED_LOCALES,
    fallbackLng: DEFAULT_LOCALE,
    load: "languageOnly",
    defaultNS: "common",
    ns: ["common"],
    resources,
    partialBundledLanguages: true,
    interpolation: { escapeValue: false },
    react: { useSuspense: false, bindI18nStore: "added" },
    returnNull: false,
    // Bundled resources make initialization synchronous, which keeps the server
    // render and hydration output identical.
    initImmediate: false,
  });

  return instance;
}

/** Namespaces this instance still has to fetch before a route can render. */
export function missingNamespaces(
  instance: I18nextInstance,
  locale: string,
  namespaces: readonly string[],
): string[] {
  return namespaces.filter((namespace) => !instance.hasResourceBundle(locale, namespace));
}

/**
 * Instance for surfaces rendered outside the root providers, such as the error
 * boundaries. It follows the document language when one is available.
 */
export function getFallbackI18n(): I18nextInstance {
  if (!fallbackInstance) {
    const locale = typeof document === "undefined" ? undefined : resolveLocale(document.documentElement.lang);
    fallbackInstance = createI18nInstance({ locale: locale ?? DEFAULT_LOCALE });
  }
  return fallbackInstance;
}

/**
 * Loads route namespaces that the server did not already provide. Used for
 * client-side navigation between surfaces with different namespace sets.
 */
export async function loadRouteNamespaces(
  instance: I18nextInstance,
  locale: string,
  namespaces: readonly string[],
): Promise<void> {
  const missing = missingNamespaces(instance, locale, namespaces);
  if (missing.length === 0) {
    return;
  }

  const loaded = await Promise.all(missing.map(async (namespace) => {
    const response = await fetch(`/locales/${locale}/${namespace}.json`, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Unable to load the ${namespace} translations.`);
    }
    return [namespace, await response.json() as Record<string, unknown>] as const;
  }));

  for (const [namespace, bundle] of loaded) {
    instance.addResourceBundle(locale, namespace, bundle, true, true);
  }
}
