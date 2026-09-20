import { Providers } from "@/app/providers";
import { resourcesForRoute } from "@/lib/i18n-resources";
import type { SupportedLocale } from "@/lib/locale";
import type { LocaleSource } from "@/lib/locale-request";

export const appMetadata = {
  title: "LobbyStack",
  description: "AI receptionist dashboard",
};

export function RootDocument({
  children,
  locale,
  localeSource,
  namespaces,
}: {
  children: React.ReactNode;
  locale: SupportedLocale;
  localeSource: LocaleSource;
  namespaces: readonly string[];
}) {
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <Providers
          initialLocale={locale}
          initialLocaleSource={localeSource}
          initialResources={resourcesForRoute(locale, namespaces)}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
