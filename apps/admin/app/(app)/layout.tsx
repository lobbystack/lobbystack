import { headers } from "next/headers";

import { WidgetDocument } from "@/app/widget-document";
import { localeFromRequestHeaders, PATHNAME_HEADER } from "@/lib/locale-request";
import { routeNamespaces } from "@/lib/route-namespaces";
import "../globals.css";

export const dynamic = "force-dynamic";
// From app-metadata, not root-document: a layout's pages download every
// client component it imports, rendered or not.
export { generateBrandingMetadata as generateMetadata } from "@/app/app-metadata";

/** The website widget's root: its chat at `/embed/<key>` is the only page here. */
export default async function DynamicAppLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const { locale } = localeFromRequestHeaders(requestHeaders);
  return (
    <WidgetDocument locale={locale} namespaces={routeNamespaces(requestHeaders.get(PATHNAME_HEADER) ?? "/")}>
      {children}
    </WidgetDocument>
  );
}
