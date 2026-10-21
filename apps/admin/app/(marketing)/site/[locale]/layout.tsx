import { notFound } from "next/navigation";

import { SUPPORTED_LOCALES, localeTag, type SupportedLocale } from "@/lib/locale";
import "@/marketing/styles/site.css";

// Every marketing page is built ahead of time; scripts/verify-admin-prerender.ts
// fails the build if one isn't. The 404 catch-all is the one per-request route,
// so this layout leaves dynamicParams alone: set to false here, it would reject
// the catch-all's paths above the not-found boundary.

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) notFound();
  return (
    <html lang={localeTag(locale as SupportedLocale)}>
      <body>{children}</body>
    </html>
  );
}
