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
