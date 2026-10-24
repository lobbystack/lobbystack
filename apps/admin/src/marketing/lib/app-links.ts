import type { Locale } from "@/marketing/i18n/config"

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://app.lobbystack.com"

type AppAuthLinkOptions = {
  source?: "calculator"
  returnTo?: string
  // The dashboard keeps it through signup and offers it first when upgrading.
  plan?: "starter" | "pro"
  // The signup page starts Google sign-in as soon as it loads.
  google?: boolean
}

// The dashboard serves its public auth pages under a locale prefix
// (`/es/signup`, `/en/login`). A bare `/signup` makes it renegotiate the
// language, which can drop the visitor out of the language they were reading.
function appAuthUrl(
  page: "login" | "signup",
  locale: Locale,
  { source, returnTo, plan, google }: AppAuthLinkOptions = {}
) {
  const url = new URL(`/${locale}/${page}`, APP_ORIGIN)
  if (source) url.searchParams.set("source", source)
  if (returnTo) url.searchParams.set("returnTo", returnTo)
  if (plan) url.searchParams.set("plan", plan)
  if (google) url.searchParams.set("provider", "google")
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
