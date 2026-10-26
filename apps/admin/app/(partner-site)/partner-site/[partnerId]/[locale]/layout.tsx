import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isUuid } from "@lobbystack/shared";

import { RootDocument, brandingMetadata } from "@/app/root-document";
import { brandingSnapshot, loadPartnerBrand } from "@/lib/branding";
import type { BrandingSnapshot } from "@/lib/branding-snapshot";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locale";
import { PUBLIC_ROUTE_NAMESPACES } from "@/lib/route-namespaces";
import "../../../../globals.css";

// A partner's copy of the public pages the host prerenders, which the proxy
// rewrites a partner's host to (src/lib/partner-site.ts). None is built ahead:
// the first visit renders a partner's copy with its brand, which is then kept
// as a static page and rendered again once `revalidate` passes or the partner
// saves its brand. Nothing here reads the request, so every visitor to a
// partner's host shares the copy.
export const dynamic = "error";
export const dynamicParams = true;
// PARTNER_SITE_REVALIDATE_SECONDS. Next.js reads this from the source, so it must be a literal.
export const revalidate = 60;

export function generateStaticParams(): Array<{ partnerId: string; locale: string }> {
  return [];
}

type Params = Promise<{ partnerId: string; locale: string }>;

async function partnerBranding(partnerId: string): Promise<BrandingSnapshot> {
  const brand = isUuid(partnerId) ? await loadPartnerBrand(partnerId) : null;
  if (!brand) notFound();
  return brandingSnapshot(brand);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { partnerId } = await params;
  return brandingMetadata(await partnerBranding(partnerId));
}

export default async function PartnerSiteLayout({ children, params }: { children: React.ReactNode; params: Params }) {
  const { partnerId, locale } = await params;
  if (!SUPPORTED_LOCALES.includes(locale as SupportedLocale)) notFound();
  return (
    <RootDocument branding={await partnerBranding(partnerId)} locale={locale as SupportedLocale} localeSource="path" namespaces={PUBLIC_ROUTE_NAMESPACES}>
      {children}
    </RootDocument>
  );
}
