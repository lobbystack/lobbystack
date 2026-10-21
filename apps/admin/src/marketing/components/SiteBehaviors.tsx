"use client"

import { useEffect } from "react"

import { rememberLocaleChoice } from "@/marketing/lib/locale-preference"

/**
 * The page-wide behavior the marketing pages share. The pages render no other
 * client code for these, so their markup works before this script loads.
 */
export function SiteBehaviors() {
  useEffect(() => {
    // A language picked in the switcher overrides Accept-Language from then on.
    const onClick = (event: MouseEvent) => rememberLocaleChoice(event.target)
    const main = document.querySelector<HTMLElement>("#main-content")
    if (main) main.tabIndex = -1
    // Menus built on <details> stay open until toggled, so close them when a
    // press lands anywhere outside.
    const onPointerDown = (event: PointerEvent) => {
      document
        .querySelectorAll<HTMLDetailsElement>("header details[open]")
        .forEach((details) => {
          const isTopLevel = !details.parentElement?.closest("details")
          if (isTopLevel && !details.contains(event.target as Node)) details.open = false
        })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      const details = (event.target as Element | null)?.closest<HTMLDetailsElement>("header details[open]")
      if (!details) return
      details.open = false
      details.querySelector<HTMLElement>("summary")?.focus()
    }
    document.addEventListener("click", onClick)
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("click", onClick)
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [])
  return null
}
