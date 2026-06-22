import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"
import {
  COOKIE_PREFERENCES_TRIGGER_SELECTOR,
  clearPostHogClientStorage,
  readCookieConsent,
  writeCookieConsent,
} from "@/lib/cookie-consent"
import { localizePath, type Locale } from "@/lib/i18n"

const bannerCopy = {
  en: {
    title: "Cookie settings",
    description:
      "We use cookies to help this site function, understand service usage, and support marketing efforts.",
    privacyPrefix: "Read our",
    privacyLink: "Cookie Policy",
    privacySuffix: ".",
    reject: "Reject non-essential",
    accept: "Accept all",
  },
  fr: {
    title: "Paramètres des cookies",
    description:
      "Nous utilisons des cookies et des identifiants similaires pour faire fonctionner le site et, avec votre accord, mesurer son utilisation.",
    privacyPrefix: "Consultez notre",
    privacyLink: "Politique relative aux cookies",
    privacySuffix: ".",
    reject: "Refuser le non essentiel",
    accept: "Tout accepter",
  },
} satisfies Record<Locale, Record<string, string>>

let postHogModuleLoaded = false

type CookieConsentBannerProps = {
  locale?: Locale
}

export function CookieConsentBanner({
  locale = "en",
}: CookieConsentBannerProps) {
  const [isVisible, setIsVisible] = useState(false)
  const copy = bannerCopy[locale]

  useEffect(() => {
    const storedConsent = readCookieConsent()
    const visibilityTimer = storedConsent
      ? undefined
      : window.setTimeout(() => setIsVisible(true), 0)

    if (storedConsent?.analytics) {
      void initializePostHog()
    }

    const handlePreferencesClick = (event: MouseEvent) => {
      const target = event.target

      if (
        target instanceof Element &&
        target.closest(COOKIE_PREFERENCES_TRIGGER_SELECTOR)
      ) {
        event.preventDefault()
        setIsVisible(true)
      }
    }

    document.addEventListener("click", handlePreferencesClick)
    return () => {
      if (visibilityTimer !== undefined) {
        window.clearTimeout(visibilityTimer)
      }
      document.removeEventListener("click", handlePreferencesClick)
    }
  }, [])

  const rejectNonEssential = () => {
    writeCookieConsent(false)
    clearPostHogClientStorage()
    void disablePostHog()
    setIsVisible(false)
  }

  const acceptAll = () => {
    writeCookieConsent(true)
    setIsVisible(false)
    void initializePostHog()
  }

  if (!isVisible) {
    return null
  }

  return (
    <aside
      aria-label={copy.title}
      className="fixed right-0 bottom-0 left-0 z-50 px-4 pb-4 sm:right-6 sm:bottom-6 sm:left-auto sm:w-[28rem] sm:px-0 sm:pb-0"
    >
      <Item
        variant="outline"
        className="gap-5 rounded-2xl border-border/70 bg-background/95 p-5 shadow-2xl shadow-foreground/10 backdrop-blur-xl"
      >
        <ItemContent className="gap-3">
          <ItemTitle className="text-base">{copy.title}</ItemTitle>
          <ItemDescription className="line-clamp-none">
            {copy.description} {copy.privacyPrefix}{" "}
            <a href={localizePath(locale, "/cookie-policy/")}>
              {copy.privacyLink}
            </a>
            {copy.privacySuffix}
          </ItemDescription>
        </ItemContent>

        <ItemActions className="w-full flex-col items-stretch gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={rejectNonEssential} type="button">
            {copy.reject}
          </Button>
          <Button onClick={acceptAll} type="button">
            {copy.accept}
          </Button>
        </ItemActions>
      </Item>
    </aside>
  )
}

async function initializePostHog() {
  const { initializePostHog } = await import("@/lib/posthog")
  postHogModuleLoaded = true
  initializePostHog()
}

async function disablePostHog() {
  if (!postHogModuleLoaded) {
    return
  }

  const { disablePostHog } = await import("@/lib/posthog")
  disablePostHog()
}
