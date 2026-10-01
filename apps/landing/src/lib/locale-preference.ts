import { isLocale, type Locale } from "@/i18n/config"

/**
 * Remembers the language a visitor picks in the language switcher. The
 * Cloudflare Pages middleware (`functions/_middleware.js`) reads this cookie
 * before `Accept-Language`, so an explicit choice keeps winning on later
 * visits. The name matches the dashboard's locale cookie; this one is
 * host-only on lobbystack.com, so it never reaches app.lobbystack.com.
 */
export const LOCALE_COOKIE = "lobbystack.locale"
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/** Marks a language switcher link with the locale it switches to. */
export const LOCALE_CHOICE_ATTRIBUTE = "data-locale-choice"

export function localeCookie(locale: Locale, secure: boolean) {
  return `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure ? "; secure" : ""}`
}

/**
 * Click handler for the document: when the click lands on a language switcher
 * link, stores that locale before the browser follows the link.
 */
export function rememberLocaleChoice(
  target: EventTarget | null,
  doc: Pick<Document, "cookie" | "location"> = document
) {
  if (!target || typeof (target as Element).closest !== "function") return null
  const link = (target as Element).closest(`[${LOCALE_CHOICE_ATTRIBUTE}]`)
  const locale = link?.getAttribute(LOCALE_CHOICE_ATTRIBUTE) ?? undefined
  if (!isLocale(locale)) return null
  doc.cookie = localeCookie(locale, doc.location.protocol === "https:")
  return locale
}
