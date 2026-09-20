import type { Metadata } from "next";
import { headers } from "next/headers";

import { RootDocument, appMetadata } from "@/app/root-document";
import { localeFromRequestHeaders, PATHNAME_HEADER } from "@/lib/locale-request";
import { routeNamespaces } from "@/lib/route-namespaces";
import "../globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = appMetadata;

export default async function DynamicAppLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const { locale, source } = localeFromRequestHeaders(requestHeaders);
  return (
    <RootDocument locale={locale} localeSource={source} namespaces={routeNamespaces(requestHeaders.get(PATHNAME_HEADER) ?? "/")}>
      {children}
    </RootDocument>
  );
}
