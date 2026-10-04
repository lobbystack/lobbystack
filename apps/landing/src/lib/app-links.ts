import type { Locale } from "@/i18n/config"

const APP_ORIGIN = "https://app.lobbystack.com"

type AppAuthLinkOptions = {
  source?: "calculator"
  returnTo?: string
}

// The dashboard serves its public auth pages under a locale prefix
// (`/es/signup`, `/en/login`). A bare `/signup` makes it renegotiate the
// language, which can drop the visitor out of the language they were reading.
function appAuthUrl(
  page: "login" | "signup",
  locale: Locale,
  { source, returnTo }: AppAuthLinkOptions = {}
) {
  const url = new URL(`/${locale}/${page}`, APP_ORIGIN)
  if (source) url.searchParams.set("source", source)
  if (returnTo) url.searchParams.set("returnTo", returnTo)
  return url.toString()
}

export const appLoginUrl = (locale: Locale, options?: AppAuthLinkOptions) =>
  appAuthUrl("login", locale, options)

export const appSignupUrl = (locale: Locale, options?: AppAuthLinkOptions) =>
  appAuthUrl("signup", locale, options)

export const appAffiliateLoginUrl = (locale: Locale) =>
  appLoginUrl(locale, { returnTo: "/affiliate" })

export const appAffiliateSignupUrl = (locale: Locale) =>
  appSignupUrl(locale, { returnTo: "/affiliate" })
