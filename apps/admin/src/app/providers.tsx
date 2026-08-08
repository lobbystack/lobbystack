"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import posthog from "posthog-js";

import { AppearanceProvider } from "@/components/appearance-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { configureBrowserTelemetry } from "@lobbystack/telemetry/browser";

import "@/i18n";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        retry: 1,
      },
    },
  });
}

function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) {
      return;
    }

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: false,
      persistence: "localStorage+cookie",
    });

    configureBrowserTelemetry({
      client: {
        capture: (event, properties) => posthog.capture(event, properties),
        identify: (distinctId, properties) => posthog.identify(distinctId, properties),
        group: (groupType, groupKey, properties) =>
          posthog.group(groupType, groupKey, properties),
        reset: () => posthog.reset(),
      },
    });
  }, []);

  return children;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <AppearanceProvider>
          <LocaleProvider>
            <PostHogProvider>
              <TooltipProvider>
                {children}
                <Toaster richColors closeButton />
              </TooltipProvider>
            </PostHogProvider>
          </LocaleProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
