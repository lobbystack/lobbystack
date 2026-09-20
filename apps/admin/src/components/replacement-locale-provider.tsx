"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { toast } from "sonner";

import {
  readStoredLocale,
  resolveLocale,
  writeStoredLocale,
  writeStoredLocaleCookie,
  type SupportedLocale,
} from "@/lib/locale";
import { isPublicRoutePath, localizePublicPath } from "@/lib/locale-path";
import { localeFromCookieHeader, type LocaleSource } from "@/lib/locale-request";
import { readPublicAuthSession } from "@/lib/public-auth-session";

type LocaleContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  isSaving: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

async function readAccountLocale(): Promise<{ locale: string } | null> {
  const session = await readPublicAuthSession(new AbortController().signal);
  if (!session?.user) {
    return null;
  }
  const response = await fetch("/api/preferences/locale", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Unable to load the account language preference.");
  }
  return await response.json() as { locale: string };
}

export function LocaleProvider({
  children,
  initialLocale,
  initialLocaleSource,
}: {
  children: ReactNode;
  initialLocale: SupportedLocale;
  initialLocaleSource: LocaleSource;
}) {
  const { i18n } = useTranslation();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const publicPage = isPublicRoutePath(pathname) || /^\/embed(?:\/|$)/.test(pathname);
  const [locale, setLocaleState] = useState<SupportedLocale>(() => resolveLocale(i18n.resolvedLanguage, initialLocale));
  const [isSaving, setIsSaving] = useState(false);
  const preferenceRevision = useRef(0);
  const userChangedLocale = useRef(false);
  const [storedLocale] = useState(() => readStoredLocale());
  const [storedCookieLocale] = useState(() => localeFromCookieHeader(typeof document === "undefined" ? null : document.cookie));

  useEffect(() => {
    const handleLanguageChange = (language: string) => setLocaleState(resolveLocale(language));
    i18n.on("languageChanged", handleLanguageChange);
    return () => { i18n.off("languageChanged", handleLanguageChange); };
  }, [i18n]);

  // Keeps assistive technologies in sync with the locale used for the visible copy.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  /**
   * Mirrors the persisted choice into the cookie so the next document request is
   * server-rendered in the same language, and honors a locally stored choice the
   * server could not see unless an explicit ?lng= outranks it.
   */
  useEffect(() => {
    if (initialLocaleSource === "query") {
      writeStoredLocale(initialLocale);
      writeStoredLocaleCookie(initialLocale);
      return;
    }
    // A canonical redirect removes ?lng= before this page renders, but the
    // redirect has already persisted that explicit choice in the locale cookie.
    if (initialLocaleSource === "path" && storedCookieLocale === initialLocale && storedLocale !== initialLocale) {
      writeStoredLocale(initialLocale);
      return;
    }
    if (storedLocale) {
      writeStoredLocaleCookie(storedLocale);
      if (storedLocale !== i18n.resolvedLanguage) {
        void i18n.changeLanguage(storedLocale);
      }
      return;
    }
    if (initialLocaleSource === "path") {
      writeStoredLocale(initialLocale);
      writeStoredLocaleCookie(initialLocale);
    } else if (initialLocaleSource === "cookie") {
      writeStoredLocaleCookie(initialLocale);
    }
  }, [i18n, initialLocale, initialLocaleSource, storedCookieLocale, storedLocale]);

  const accountLocale = useQuery({
    queryKey: ["account", "locale-preference", publicPage],
    enabled: !publicPage,
    queryFn: readAccountLocale,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const preferredLocale = publicPage ? undefined : accountLocale.data?.locale;

  useEffect(() => {
    if (!preferredLocale || userChangedLocale.current || initialLocaleSource === "query") {
      return;
    }
    const preferred = resolveLocale(preferredLocale);
    writeStoredLocale(preferred);
    writeStoredLocaleCookie(preferred);
    if (preferred !== i18n.resolvedLanguage) {
      void i18n.changeLanguage(preferred);
    }
  }, [i18n, preferredLocale, initialLocaleSource]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    isSaving,
    setLocale: async (nextLocale) => {
      const previousLocale = locale;
      const revision = ++preferenceRevision.current;
      userChangedLocale.current = true;
      setIsSaving(true);
      setLocaleState(nextLocale);
      writeStoredLocale(nextLocale);
      writeStoredLocaleCookie(nextLocale);
      await i18n.changeLanguage(nextLocale);
      if (publicPage) {
        const searchParams = new URLSearchParams(window.location.search);
        searchParams.delete("lng");
        const search = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
        const target = `${localizePublicPath(pathname, nextLocale)}${search}${window.location.hash}`;
        router.replace(target, { scroll: false });
        return;
      }
      try {
        const response = await fetch("/api/preferences/locale", {
          method: "PATCH",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ locale: nextLocale }),
        });
        if (!response.ok) throw new Error("Unable to save locale preference.");
      } catch {
        if (revision === preferenceRevision.current) {
          setLocaleState(previousLocale);
          writeStoredLocale(previousLocale);
          writeStoredLocaleCookie(previousLocale);
          await i18n.changeLanguage(previousLocale);
          toast.error(i18n.t("settings:appearance.language.saveFailed"));
        }
      } finally {
        if (revision === preferenceRevision.current) setIsSaving(false);
      }
    },
  }), [i18n, isSaving, locale, pathname, publicPage, router]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocalePreference(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocalePreference must be used within a LocaleProvider.");
  return context;
}
