import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { RootDocument } from "@/app/root-document";
import { getSession } from "@/lib/auth";
import { localizePublicPath } from "@/lib/locale-path";
import { localeFromRequestHeaders, PATHNAME_HEADER } from "@/lib/locale-request";
import { routeNamespaces } from "@/lib/route-namespaces";
import "../globals.css";

export const dynamic = "force-dynamic";
export { generateBrandingMetadata as generateMetadata } from "@/app/root-document";

export default async function AuthenticatedOnboardingLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const { locale, source } = localeFromRequestHeaders(requestHeaders);
  const session = await getSession(new Headers(requestHeaders));
  if (!session) redirect(localizePublicPath("/login", locale));
  return (
    <RootDocument locale={locale} localeSource={source} namespaces={routeNamespaces(requestHeaders.get(PATHNAME_HEADER) ?? "/onboarding")}>
      {children}
    </RootDocument>
  );
}
