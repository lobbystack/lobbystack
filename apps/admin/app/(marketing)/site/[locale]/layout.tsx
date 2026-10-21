import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CookieConsentBanner } from "@/marketing/components/CookieConsentBanner";
import { SiteBehaviors } from "@/marketing/components/SiteBehaviors";
import { SUPPORTED_LOCALES, isLocale, localeMeta, type Locale } from "@/marketing/i18n";
import { marketingSiteUrl } from "@/marketing/site-url";
import "@/marketing/styles/site.css";

// Every marketing page is built ahead of time; scripts/verify-admin-prerender.ts
// fails the build if one isn't. The 404 catch-all is the one per-request route,
// so this layout leaves dynamicParams alone: set to false here, it would reject
// the catch-all's paths above the not-found boundary.

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

const skipLabels: Record<Locale, string> = {
  en: "Skip to main content",
  fr: "Aller au contenu principal",
  es: "Ir al contenido principal",
  sr: "Pređi na glavni sadržaj",
};

export const metadata: Metadata = {
  metadataBase: new URL(marketingSiteUrl()),
  icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } } : {}),
  },
};

export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const meta = localeMeta[locale];
  return (
    <html lang={meta.tag} dir={meta.dir}>
      <head>
        <link rel="sitemap" href="/sitemap-index.xml" />
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="LobbyStack RSS feed" />
        <link rel="nlweb" href="/.well-known/api-catalog" />
      </head>
      <body className="antialiased">
        <a href="#main-content" className="skip-link">
          {skipLabels[locale]}
        </a>
        {children}
        <CookieConsentBanner locale={locale} />
        <SiteBehaviors />
        <script src="/webmcp.js" defer />
      </body>
    </html>
  );
}
