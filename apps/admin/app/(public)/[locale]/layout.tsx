import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RootDocument, brandingMetadata } from "@/app/root-document";
import { buildTimeBrandingSnapshot } from "@/lib/branding";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locale";
import { PUBLIC_ROUTE_NAMESPACES } from "@/lib/route-namespaces";
import "../../globals.css";

export const dynamic = "error";
export const dynamicParams = false;
// Prerendered, so these pages carry the name and logo the build environment
// sets. When it leaves either to the database, the browser asks for it.
export const metadata: Metadata = brandingMetadata(buildTimeBrandingSnapshot());

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function PublicLocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) notFound();
  return (
    <RootDocument branding={buildTimeBrandingSnapshot()} locale={locale as SupportedLocale} localeSource="path" namespaces={PUBLIC_ROUTE_NAMESPACES}>
      {children}
    </RootDocument>
  );
}
