"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ProductAnalytics } from "@/components/product-analytics";

import { LocaleProvider } from "@/components/replacement-locale-provider";
import { AppearanceProvider } from "@/components/appearance-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { i18nReady } from "@/i18n";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } } }));
  const [translationsReady, setTranslationsReady] = useState(false);

  useEffect(() => {
    void i18nReady.finally(() => setTranslationsReady(true));
  }, []);

  if (!translationsReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppearanceProvider>
          <LocaleProvider>
            <ProductAnalytics />
            {children}
            <Toaster richColors />
          </LocaleProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
