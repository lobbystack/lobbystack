"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ProductAnalytics } from "@/components/product-analytics";

import { LocaleProvider } from "@/components/replacement-locale-provider";
import { AppearanceProvider } from "@/components/appearance-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import i18n, { i18nReady } from "@/i18n";
import { routeNamespaces } from "@/lib/route-namespaces";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } } }));
  const pathname = usePathname() ?? "/";
  const namespaceKey = routeNamespaces(pathname).join(",");
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [loadingLocale, setLoadingLocale] = useState("en");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await i18nReady;
      if (!cancelled) setLoadingLocale(i18n.resolvedLanguage ?? "en");
      const namespaces = namespaceKey.split(",");
      await new Promise<void>((resolve, reject) => i18n.loadNamespaces(namespaces, error => {
        const missing = namespaces.some(namespace => !i18n.languages.some(language => i18n.hasResourceBundle(language, namespace)));
        missing ? reject(error ?? new Error("Route translations unavailable")) : resolve();
      }));
      if (!cancelled) { setReadyKey(namespaceKey); setFailedKey(null); }
    })().catch(() => { if (!cancelled) setFailedKey(namespaceKey); });
    return () => { cancelled = true; };
  }, [namespaceKey]);

  const translationsReady = readyKey === namespaceKey;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppearanceProvider>
          <LocaleProvider>
            <ProductAnalytics />
            {!translationsReady ? (
              <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6" role="status" aria-busy={failedKey !== namespaceKey}>
                <span className="sr-only">{i18n.t("common:loading.title", { lng: loadingLocale })}</span>
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-48 w-full" />
                {failedKey === namespaceKey && <Button variant="outline" onClick={() => window.location.reload()}>{i18n.t("common:loading.retry")}</Button>}
              </div>
            ) : children}
            <Toaster richColors />
          </LocaleProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
