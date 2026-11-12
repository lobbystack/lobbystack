"use client"

import { useEffect, useState } from "react"

import { buttonVariants } from "@/marketing/components/ui/button"
import type { Locale } from "@/marketing/i18n"
import {
  appDashboardUrl,
  appLoginUrl,
  appSessionCheckUrl,
  appSignupUrl,
} from "@/marketing/lib/app-links"
import { cn } from "@/marketing/lib/utils"

let signedInCheck: Promise<boolean> | null = null

// One request per page load, shared by the desktop and phone links. The
// dashboard's session cookie belongs to its own host, so only the dashboard
// can say whether it's there. Any failure counts as signed out.
function checkSignedIn(): Promise<boolean> {
  signedInCheck ??= fetch(appSessionCheckUrl(), { credentials: "include", cache: "no-store" })
    .then(async (response) => response.ok && (await response.json() as { signedIn?: unknown }).signedIn === true)
    .catch(() => false)
  return signedInCheck
}

/** Forgets the last check, so tests can start from a fresh page. */
export function resetSignedInCheck() {
  signedInCheck = null
}

function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    let active = true
    void checkSignedIn().then((value) => { if (active) setSignedIn(value) })
    return () => { active = false }
  }, [])
  return signedIn
}

type NavbarAuthLinksProps = {
  locale: Locale
  copy: { login: string; tryFree: string; dashboard: string }
  placement: "navbar" | "mobile_navbar"
}

/**
 * The navbar's Log in and Try for free links, or one Dashboard link for a
 * visitor already signed in. Pages render signed out, so a signed-out visitor
 * never sees the links change.
 */
export function NavbarAuthLinks({ locale, copy, placement }: NavbarAuthLinksProps) {
  const signedIn = useSignedIn()
  const dashboard = (
    <a
      href={appDashboardUrl(locale)}
      className={cn(buttonVariants(), placement === "navbar" && "justify-self-end [grid-area:1/1]")}
      data-ph-capture-attribute-section={placement}
      data-ph-capture-attribute-action="open_dashboard"
      data-ph-capture-attribute-destination={appDashboardUrl(locale)}
    >
      {copy.dashboard}
    </a>
  )

  if (placement === "mobile_navbar") {
    if (signedIn) return dashboard
    return (
      <>
        <a
          href={appLoginUrl(locale)}
          className="rounded-md px-3 py-2 text-center text-sm font-medium text-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {copy.login}
        </a>
        <a
          href={appSignupUrl(locale)}
          className={buttonVariants()}
          data-ph-signup-cta
          data-ph-capture-attribute-section="mobile_navbar"
          data-ph-capture-attribute-action="try_for_free"
          data-ph-capture-attribute-destination={appSignupUrl(locale)}
        >
          {copy.tryFree}
        </a>
      </>
    )
  }

  // Both states share one grid cell. Signed in, the signed-out links stay in
  // it, hidden, so the bar keeps its width and the menu beside it stays put.
  return (
    <div className="grid items-center">
      <div
        className={cn("flex items-center gap-1 [grid-area:1/1]", signedIn && "invisible")}
        aria-hidden={signedIn || undefined}
        inert={signedIn || undefined}
      >
        <a
          href={appLoginUrl(locale)}
          className="rounded-full px-3 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {copy.login}
        </a>
        <a
          href={appSignupUrl(locale)}
          className={cn(buttonVariants(), "ml-2")}
          data-ph-signup-cta
          data-ph-capture-attribute-section="navbar"
          data-ph-capture-attribute-action="try_for_free"
          data-ph-capture-attribute-destination={appSignupUrl(locale)}
        >
          {copy.tryFree}
        </a>
      </div>
      {signedIn ? dashboard : null}
    </div>
  )
}
