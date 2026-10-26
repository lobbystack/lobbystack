import { headers } from "next/headers";

import { RootDocument } from "@/app/root-document";
import { localeFromRequestHeaders } from "@/lib/locale-request";
import { PARTNER_NAMESPACES } from "@/lib/route-namespaces";
import "../globals.css";

export const dynamic = "force-dynamic";
export { generateBrandingMetadata as generateMetadata } from "@/app/root-document";

/**
 * The partner console's document, under the brand of the hostname it's opened
 * on: the host's on the host's domain, a partner's on that partner's. A partner
 * member may have no business of their own, so nothing here sends them to
 * onboarding. Each page decides what a signed-out visitor sees.
 */
export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const { locale, source } = localeFromRequestHeaders(await headers());
  return (
    <RootDocument locale={locale} localeSource={source} namespaces={PARTNER_NAMESPACES}>
      {children}
    </RootDocument>
  );
}
