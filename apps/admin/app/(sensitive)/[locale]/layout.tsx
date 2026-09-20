import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RootDocument, appMetadata } from "@/app/root-document";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locale";
import { PUBLIC_ROUTE_NAMESPACES } from "@/lib/route-namespaces";
import "../../globals.css";

export const dynamic = "force-dynamic";
export const dynamicParams = false;
export const metadata: Metadata = appMetadata;

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export default async function SensitiveLocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) notFound();
  return (
    <RootDocument locale={locale as SupportedLocale} localeSource="path" namespaces={PUBLIC_ROUTE_NAMESPACES}>
      {children}
    </RootDocument>
  );
}
