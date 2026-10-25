import { BaseProviders } from "@/app/base-providers";
import { brandingSnapshot, requireRequestBrand } from "@/lib/branding";
import { resourcesForRoute } from "@/lib/i18n-resources";
import { localeTag, type SupportedLocale } from "@/lib/locale";

/**
 * The website widget's document. Unlike `RootDocument`, it leaves out the saved
 * language preference and product analytics: the chat speaks the business's
 * language, which must neither give way to nor become a language saved on this
 * origin, and visitors on a business's site never download PostHog.
 */
export async function WidgetDocument({
  children,
  locale,
  namespaces,
}: {
  children: React.ReactNode;
  locale: SupportedLocale;
  namespaces: readonly string[];
}) {
  return (
    <html lang={localeTag(locale)} suppressHydrationWarning>
      <body>
        {/* The chat is drawn in light colors only; a dark system theme would turn its white panel near-black under dark text. */}
        <BaseProviders branding={brandingSnapshot(await requireRequestBrand())} forcedTheme="light" initialLocale={locale} initialResources={resourcesForRoute(locale, namespaces)}>
          {children}
        </BaseProviders>
      </body>
    </html>
  );
}
