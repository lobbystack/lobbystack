"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import i18n from "@/i18n";
import {
  readStoredLocale,
  resolveLocale,
  resolveStartupLocale,
  writeStoredLocale,
  type SupportedLocale,
} from "@/lib/locale";

type LocaleContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  isSaving: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() =>
    resolveStartupLocale({
      storedLocale: readStoredLocale(),
      browserLocale: i18n.resolvedLanguage ?? i18n.language,
    }),
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const handleLanguageChange = (language: string) => setLocaleState(resolveLocale(language));
    i18n.on("languageChanged", handleLanguageChange);
    return () => i18n.off("languageChanged", handleLanguageChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/preferences/locale", { credentials: "include" }).then(async (response) => {
      if (!response.ok || cancelled) return;
      const data = await response.json() as { locale?: string };
      const preferred = resolveLocale(data.locale);
      writeStoredLocale(preferred);
      await i18n.changeLanguage(preferred);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    isSaving,
    setLocale: async (nextLocale) => {
      setLocaleState(nextLocale);
      writeStoredLocale(nextLocale);
      await i18n.changeLanguage(nextLocale);
      setIsSaving(true);
      try {
        const response = await fetch("/api/preferences/locale", {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locale: nextLocale }),
        });
        if (!response.ok) throw new Error("Unable to save locale preference.");
      } finally {
        setIsSaving(false);
      }
    },
  }), [isSaving, locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocalePreference(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocalePreference must be used within a LocaleProvider.");
  return context;
}
