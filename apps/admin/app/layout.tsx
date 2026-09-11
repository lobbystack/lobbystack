import type { Metadata } from "next";
import { headers } from "next/headers";

import { Providers } from "@/app/providers";
import { resourcesForRoute } from "@/lib/i18n-resources";
import { PATHNAME_HEADER, localeFromRequestHeaders } from "@/lib/locale-request";
import { routeNamespaces } from "@/lib/route-namespaces";
import "./globals.css";

export const metadata: Metadata = {
  title: "LobbyStack",
  description: "AI receptionist dashboard",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const { locale, source } = localeFromRequestHeaders(requestHeaders);
  const pathname = requestHeaders.get(PATHNAME_HEADER) ?? "/";

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <Providers
          initialLocale={locale}
          initialLocaleSource={source}
          initialResources={resourcesForRoute(locale, routeNamespaces(pathname))}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
