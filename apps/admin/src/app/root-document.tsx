import { Providers } from "@/app/providers";
import { brandColorStyle } from "@/lib/brand-color";
import { brandingSnapshot, requireRequestBrand } from "@/lib/branding";
import type { BrandingSnapshot } from "@/lib/branding-snapshot";
import { resourcesForRoute } from "@/lib/i18n-resources";
import { localeTag, type SupportedLocale } from "@/lib/locale";
import type { LocaleSource } from "@/lib/locale-request";

export { brandingMetadata, generateBrandingMetadata } from "./app-metadata";

/**
 * The document every route group but the website widget's renders. A
 * prerendered layout passes the branding its build knows, and a partner's
 * copy of a prerendered page passes the partner's: nothing here reads the
 * request then. A layout rendered per request leaves it out, and the brand
 * the proxy resolved the request to is read here.
 */
export async function RootDocument({
  branding,
  children,
  locale,
  localeSource,
  namespaces,
}: {
  branding?: BrandingSnapshot;
  children: React.ReactNode;
  locale: SupportedLocale;
  localeSource: LocaleSource;
  namespaces: readonly string[];
}) {
  const shown = branding ?? brandingSnapshot(await requireRequestBrand());
  return (
    <html lang={localeTag(locale)} suppressHydrationWarning>
      <body style={brandColorStyle(shown.partner?.color)}>
        <Providers
          branding={shown}
          initialLocale={locale}
          initialLocaleSource={localeSource}
          initialResources={resourcesForRoute(locale, namespaces)}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
