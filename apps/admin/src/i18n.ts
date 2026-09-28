import i18next, { type i18n as I18nextInstance } from "i18next";
import { initReactI18next } from "react-i18next";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, resolveLocale, type SupportedLocale } from "@/lib/locale";
import { TranslationNetworkError } from "@/lib/translation-network-error";
import { versionedAssetUrl } from "@/lib/versioned-assets";

import commonEn from "../public/locales/en/common.json";
import commonFr from "../public/locales/fr/common.json";

export type I18nNamespaceResources = Record<string, Record<string, unknown>>;
export type I18nResources = Record<string, I18nNamespaceResources>;

const NETWORK_RETRY_DELAY_MS = 500;

let fallbackInstance: I18nextInstance | undefined;
// Resolution state belongs to one render tree, never a shared user's locale.
const resolvedFallbacks = new WeakMap<I18nextInstance, Set<string>>();

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
  return namespaces.filter((namespace) => !instance.hasResourceBundle(locale, namespace)
    && !(resolvedFallbacks.get(instance)?.has(`${locale}:${namespace}`) && instance.hasResourceBundle(DEFAULT_LOCALE, namespace)));
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
  options: { revalidate?: boolean } = {},
): Promise<void> {
  const missing = missingNamespaces(instance, locale, namespaces);
  if (missing.length === 0) {
    return;
  }

  const settled = await Promise.allSettled(missing.map(async (namespace) => {
    const fetchBundle = async (language: string): Promise<Record<string, unknown>> => {
      const url = versionedAssetUrl(`/locales/${language}/${namespace}.json`);
      // A retry must not replay a response the browser cached as immutable.
      const request = () => options.revalidate ? fetch(url, { cache: "reload" }) : fetch(url);
      let response: Response;
      try {
        response = await request();
      } catch {
        // A dropped connection (Safari's "Load failed") usually succeeds on a
        // fresh attempt, so retry once before asking the operator to.
        await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
        try {
          response = await fetch(url, { cache: "reload" });
        } catch (cause) {
          throw new TranslationNetworkError(url, { cause });
        }
      }
      if (!response.ok) throw new Error(`Unable to load the ${language}/${namespace} translations (HTTP ${response.status}).`);
      const bundle: unknown = await response.json();
      if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) throw new Error(`Invalid ${namespace} translations.`);
      return bundle as Record<string, unknown>;
    };
    try {
      return { namespace, language: locale, bundle: await fetchBundle(locale) };
    } catch (error) {
      if (locale === DEFAULT_LOCALE) throw error;
      // The manual route loader has no i18next HTTP backend to fetch fallback
      // languages for it. Load English explicitly without changing the locale.
      const bundle = instance.hasResourceBundle(DEFAULT_LOCALE, namespace)
        ? instance.getResourceBundle(DEFAULT_LOCALE, namespace) as Record<string, unknown>
        : await fetchBundle(DEFAULT_LOCALE);
      return { namespace, language: DEFAULT_LOCALE, bundle };
    }
  }));

  // Keep every bundle that did load: one failed namespace must not leave the
  // other namespaces of the same route untranslated.
  const fallbacks = resolvedFallbacks.get(instance) ?? new Set<string>();
  resolvedFallbacks.set(instance, fallbacks);
  const failures: unknown[] = [];
  for (const result of settled) {
    if (result.status === "rejected") {
      failures.push(result.reason);
      continue;
    }
    const { namespace, language, bundle } = result.value;
    if (language !== locale) fallbacks.add(`${locale}:${namespace}`);
    else fallbacks.delete(`${locale}:${namespace}`);
    instance.addResourceBundle(language, namespace, bundle, true, true);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, failures.map((failure) => failure instanceof Error ? failure.message : String(failure)).join(" "));
}
