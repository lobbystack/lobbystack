import type { ScreenshotSource } from "@/marketing/components/system/AppFrame"
import type { Locale } from "@/marketing/i18n"

// Product screenshots in public/screenshots, at their pixel sizes.

/** A direct business's dashboard home, Northside Plumbing, in the page's language. */
export function dashboardShot(locale: Locale): ScreenshotSource {
  return {
    src: locale === "en" ? "/screenshots/dashboard-window.webp" : `/screenshots/dashboard-window-${locale}.webp`,
    width: 2880,
    height: 1760,
  }
}

/** The dashboard pages shown on feature pages: Summit Heating & Cooling's Inbox, Analytics and Knowledge. */
export type FeatureShotName = "inbox" | "analytics" | "knowledge"

export function featureShot(name: FeatureShotName, locale: Locale): ScreenshotSource {
  return {
    src: locale === "en" ? `/screenshots/feature-${name}.webp` : `/screenshots/feature-${name}-${locale}.webp`,
    width: 2880,
    height: 1760,
  }
}
