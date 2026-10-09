"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { I18nextProvider } from "react-i18next";
import { toast } from "sonner";

import { ProductAnalytics } from "@/components/product-analytics";
import { AppearanceProvider } from "@/components/appearance-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/components/replacement-locale-provider";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { createI18nInstance, loadRouteNamespaces, missingNamespaces, type I18nNamespaceResources } from "@/i18n";
import { captureBrowserError } from "@/lib/browser-error-reporting";
import type { SupportedLocale } from "@/lib/locale";
import { isTranslationNetworkError } from "@/lib/translation-network-error";
import type { LocaleSource } from "@/lib/locale-request";
import { routeNamespaces } from "@/lib/route-namespaces";

type ProvidersProps = {
  children: React.ReactNode;
  initialLocale: SupportedLocale;
  initialLocaleSource: LocaleSource;
  initialResources: I18nNamespaceResources;
};

export function Providers({ children, initialLocale, initialLocaleSource, initialResources }: ProvidersProps) {
  const [i18n] = useState(() => createI18nInstance({ locale: initialLocale, resources: initialResources }));
  const [queryClient] = useState(() => new QueryClient({
    // A failed action must never end silently. Mutations that report their own
    // failure set onError or meta.inlineError and skip this generic toast.
    mutationCache: new MutationCache({ onError: (_error, _variables, _context, mutation) => { if (!mutation.options.onError && !mutation.meta?.inlineError) toast.error(i18n.t("common:errors.unexpected")); } }),
    defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } },
  }));
  const pathname = usePathname() ?? "/";
  const namespaceKey = routeNamespaces(pathname).join(",");
  const [language, setLanguage] = useState(() => i18n.resolvedLanguage ?? initialLocale);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const handleLanguageChanged = (nextLanguage: string) => setLanguage(nextLanguage);
    i18n.on("languageChanged", handleLanguageChanged);
    // Child effects run first, so the locale provider can switch languages
    // before this listener exists. Pick up that change, or its namespaces never load.
    setLanguage(i18n.language);
    return () => { i18n.off("languageChanged", handleLanguageChanged); };
  }, [i18n]);

  useEffect(() => {
    const namespaces = namespaceKey.split(",");
    if (missingNamespaces(i18n, language, namespaces).length === 0) {
      setLoadingKey(null);
      setFailedKey(null);
      return;
    }

    let cancelled = false;
    const requestKey = `${language}:${namespaceKey}`;
    setLoadingKey(requestKey);
    void loadRouteNamespaces(i18n, language, namespaces, { revalidate: retryToken > 0 }).then(() => {
      if (cancelled) return;
      setLoadingKey(null);
      setFailedKey(null);
    }).catch((error: unknown) => {
      // Name the namespace and status so a production failure is diagnosable.
      // A dropped connection is not an app fault; the retry banner covers it.
      if (!isTranslationNetworkError(error)) captureBrowserError(error);
      if (cancelled) return;
      setLoadingKey(null);
      setFailedKey(requestKey);
    });
    return () => { cancelled = true; };
  }, [i18n, language, namespaceKey, retryToken]);

  const failed = failedKey !== null;

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider>
          <AppearanceProvider>
            <LocaleProvider initialLocale={initialLocale} initialLocaleSource={initialLocaleSource}>
              <ProductAnalytics>
              {/* Mount before children so toasts fired from their mount effects reach a subscribed Toaster. */}
              <Toaster richColors />
              {loadingKey !== null ? (
                <div aria-busy="true" className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-primary/15" role="status">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
                  <span className="sr-only">{i18n.t("common:loading.title")}</span>
                </div>
              ) : null}
              {failed ? (
                <div className="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-3 border-b border-border bg-background/95 px-4 py-2 text-sm text-muted-foreground" role="alert">
                  <span>{i18n.t("common:loading.failed")}</span>
                  <Button onClick={() => setRetryToken(token => token + 1)} size="sm" variant="outline">
                    {i18n.t("common:loading.retry")}
                  </Button>
                </div>
              ) : null}
              {children}
              </ProductAnalytics>
            </LocaleProvider>
          </AppearanceProvider>
        </ThemeProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
