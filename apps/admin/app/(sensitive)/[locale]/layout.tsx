import { notFound } from "next/navigation";

import { RootDocument } from "@/app/root-document";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locale";
import { PUBLIC_ROUTE_NAMESPACES } from "@/lib/route-namespaces";
import "../../globals.css";

export { generateStaticParams } from "../../(public)/[locale]/layout";
export { generateBrandingMetadata as generateMetadata } from "@/app/root-document";
export const dynamic = "force-dynamic";
export const dynamicParams = false;

/** The public layout, rendered per request so its pages show the deployment's current name and logo. */
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
