import i18n from "i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
} from "@/lib/locale";
import enAffiliate from "@/i18n-resources/en/affiliate.json";
import frAffiliate from "@/i18n-resources/fr/affiliate.json";

export const i18nReady = i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: SUPPORTED_LOCALES,
    fallbackLng: DEFAULT_LOCALE,
    load: "languageOnly",
    defaultNS: "common",
    ns: [
      "common",
      "auth",
      "nav",
      "dashboard",
      "onboarding",
      "settings",
      "knowledge",
      "inbox",
      "calls",
      "messages",
      "contacts",
      "agent",
      "affiliate",
    ],
    partialBundledLanguages: true,
    resources: {
      en: {
        affiliate: enAffiliate,
      },
      fr: {
        affiliate: frAffiliate,
      },
    },
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    detection: {
      order: ["querystring", "localStorage", "navigator"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    react: {
      useSuspense: false,
    },
    returnNull: false,
  });

export default i18n;
