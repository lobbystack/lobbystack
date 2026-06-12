export const COOKIE_CONSENT_STORAGE_KEY = "lobbystack.cookieConsent.v1"
export const COOKIE_CONSENT_VERSION = 1
export const COOKIE_CONSENT_CHANGED_EVENT = "lobbystack:cookie-consent-changed"
export const COOKIE_PREFERENCES_TRIGGER_SELECTOR =
  "[data-cookie-preferences-trigger]"

export type CookieConsent = {
  analytics: boolean
  decidedAt: string
  version: typeof COOKIE_CONSENT_VERSION
}

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">

type CookieConsentChangeDetail = {
  consent: CookieConsent | null
}

export function parseCookieConsent(value: string | null): CookieConsent | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Partial<CookieConsent>

    if (
      parsed.version !== COOKIE_CONSENT_VERSION ||
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.decidedAt !== "string" ||
      Number.isNaN(Date.parse(parsed.decidedAt))
    ) {
      return null
    }

    return {
      analytics: parsed.analytics,
      decidedAt: parsed.decidedAt,
      version: COOKIE_CONSENT_VERSION,
    }
  } catch {
    return null
  }
}

export function readCookieConsent(storage = getBrowserStorage()) {
  if (!storage) {
    return null
  }

  return parseCookieConsent(storage.getItem(COOKIE_CONSENT_STORAGE_KEY))
}

export function createCookieConsent(analytics: boolean): CookieConsent {
  return {
    analytics,
    decidedAt: new Date().toISOString(),
    version: COOKIE_CONSENT_VERSION,
  }
}

export function writeCookieConsent(
  analytics: boolean,
  storage = getBrowserStorage()
): CookieConsent {
  const consent = createCookieConsent(analytics)

  if (storage) {
    storage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent))
  }

  emitCookieConsentChanged(consent)
  return consent
}

export function clearCookieConsent(storage = getBrowserStorage()) {
  if (storage) {
    storage.removeItem(COOKIE_CONSENT_STORAGE_KEY)
  }

  emitCookieConsentChanged(null)
}

export function hasAnalyticsConsent(storage = getBrowserStorage()) {
  return readCookieConsent(storage)?.analytics === true
}

export function onCookieConsentChanged(
  handler: (consent: CookieConsent | null) => void
) {
  if (typeof window === "undefined") {
    return () => undefined
  }

  const listener = (event: Event) => {
    handler(
      event instanceof CustomEvent
        ? ((event.detail as CookieConsentChangeDetail | undefined)?.consent ??
            null)
        : null
    )
  }

  window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, listener)
  return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, listener)
}

export function clearPostHogClientStorage() {
  if (typeof window === "undefined") {
    return
  }

  removePostHogStorageKeysFromBrowser("localStorage")
  removePostHogStorageKeysFromBrowser("sessionStorage")
  expirePostHogCookies()
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function emitCookieConsentChanged(consent: CookieConsent | null) {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(
    new CustomEvent<CookieConsentChangeDetail>(COOKIE_CONSENT_CHANGED_EVENT, {
      detail: { consent },
    })
  )
}

function removePostHogStorageKeys(storage: Storage) {
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index)

      if (key && isPostHogStorageKey(key)) {
        storage.removeItem(key)
      }
    }
  } catch {
    // Storage may be unavailable in private browsing or hardened contexts.
  }
}

function removePostHogStorageKeysFromBrowser(
  storageName: "localStorage" | "sessionStorage"
) {
  try {
    removePostHogStorageKeys(window[storageName])
  } catch {
    // Reading the storage property itself can throw in hardened browsers.
  }
}

function isPostHogStorageKey(key: string) {
  const normalized = key.toLowerCase()
  return normalized.includes("posthog") || normalized.startsWith("ph_")
}

function expirePostHogCookies() {
  try {
    const hostname = window.location.hostname
    const parentDomain = hostname.split(".").slice(-2).join(".")
    const domains = Array.from(new Set(["", hostname, `.${hostname}`, `.${parentDomain}`]))

    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0]?.trim()

      if (!name || !isPostHogStorageKey(name)) {
        return
      }

      domains.forEach((domain) => {
        document.cookie = [
          `${name}=`,
          "expires=Thu, 01 Jan 1970 00:00:00 GMT",
          "path=/",
          "SameSite=Lax",
          domain ? `domain=${domain}` : "",
        ]
          .filter(Boolean)
          .join("; ")
      })
    })
  } catch {
    // Cookie access can be blocked by browser settings.
  }
}
