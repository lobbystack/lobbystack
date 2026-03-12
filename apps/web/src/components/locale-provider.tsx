import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";

import i18n from "@/i18n";
import { api } from "../../../../convex/_generated/api";
import {
  normalizeLocale,
  readStoredLocale,
  resolveLocale,
  resolveAuthenticatedLocale,
  resolveStartupLocale,
  type SupportedLocale,
  writeStoredLocale,
} from "@/lib/locale";

type LocaleContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  isSaving: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const auth = useConvexAuth();
  const preferredLocale = useQuery(
    api.users.preferences.getPreferredLocale,
    auth.isAuthenticated ? {} : "skip",
  );
  const updatePreferredLocale = useMutation(api.users.preferences.updatePreferredLocale);
  const [locale, setLocaleState] = useState<SupportedLocale>(
    resolveStartupLocale({
      storedLocale: readStoredLocale(),
      browserLocale: i18n.resolvedLanguage ?? i18n.language,
    }),
  );
  const [pendingLocale, setPendingLocale] = useState<SupportedLocale | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const handleLanguageChange = (nextLanguage: string) => {
      setLocaleState(resolveLocale(nextLanguage));
    };

    i18n.on("languageChanged", handleLanguageChange);
    return () => {
      i18n.off("languageChanged", handleLanguageChange);
    };
  }, []);

  useEffect(() => {
    if (!auth.isAuthenticated) {
      setPendingLocale(null);
      return;
    }

    const normalizedPreferredLocale = normalizeLocale(preferredLocale ?? undefined);
    if (pendingLocale && normalizedPreferredLocale !== pendingLocale) {
      writeStoredLocale(pendingLocale);
      if (pendingLocale !== locale) {
        void i18n.changeLanguage(pendingLocale);
      }
      return;
    }

    if (pendingLocale && normalizedPreferredLocale === pendingLocale) {
      setPendingLocale(null);
    }

    const normalizedLocale = resolveAuthenticatedLocale({
      preferredLocale: preferredLocale ?? undefined,
      storedLocale: readStoredLocale(),
      browserLocale: i18n.resolvedLanguage ?? i18n.language,
    });
    if (normalizedLocale !== locale) {
      void i18n.changeLanguage(normalizedLocale);
    }
    writeStoredLocale(normalizedLocale);
  }, [auth.isAuthenticated, locale, pendingLocale, preferredLocale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      isSaving,
      setLocale: async (nextLocale) => {
        setLocaleState(nextLocale);
        writeStoredLocale(nextLocale);
        await i18n.changeLanguage(nextLocale);

        if (!auth.isAuthenticated) {
          return;
        }

        setPendingLocale(nextLocale);
        setIsSaving(true);
        try {
          await updatePreferredLocale({ locale: nextLocale });
        } catch (error) {
          setPendingLocale(null);
          throw error;
        } finally {
          setIsSaving(false);
        }
      },
    }),
    [auth.isAuthenticated, isSaving, locale, updatePreferredLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocalePreference(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocalePreference must be used within a LocaleProvider.");
  }

  return context;
}
