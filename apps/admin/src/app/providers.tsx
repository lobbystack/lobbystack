"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { LocaleProvider } from "@/components/replacement-locale-provider";
import { AppearanceProvider } from "@/components/appearance-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { i18nReady } from "@/i18n";

function ProductAnalytics() {
  const pathname = usePathname();
  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!apiKey || posthog.__loaded) return;
    posthog.init(apiKey, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      disable_session_recording: true,
    });
  }, []);
  useEffect(() => {
    if (posthog.__loaded && pathname) posthog.capture("$pageview", { path: pathname });
  }, [pathname]);
  return null;
}

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
