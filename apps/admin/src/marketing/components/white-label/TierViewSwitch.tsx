"use client"

import { ArrowRight, Cloud, Server } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { PlanViewPrompt, planViewLinkClass } from "@/marketing/components/pricing/PlanViewPrompt"
import { cn } from "@/marketing/lib/utils"

type View = "hosted" | "self-hosted"

/** Links to the self-hosted view, so another page can open the tiers on it. */
export const selfHostedTiersHash = "#self-hosted-tiers"

/** The view a link to the tiers names, if any. */
export const viewForHash = (hash: string): View | null =>
  hash === selfHostedTiersHash ? "self-hosted" : hash === "#tiers" ? "hosted" : null

type TierViewSwitchProps = {
  hosted: { header: ReactNode; body: ReactNode; prompt: string; link: string }
  selfHosted: { header: ReactNode; body: ReactNode; prompt: string; link: string }
}

/**
 * The partner tiers and their self-hosted plans in one section. Both views
 * are in the server HTML, and both show without JavaScript; with it, the link
 * under the heading swaps which one shows, and so do links to #tiers and
 * #self-hosted-tiers.
 */
export function TierViewSwitch({ hosted, selfHosted }: TierViewSwitchProps) {
  const [view, setView] = useState<View>("hosted")

  useEffect(() => {
    const follow = (scroll: boolean) => {
      const next = viewForHash(window.location.hash)
      if (!next) return
      setView(next)
      if (scroll) document.getElementById("tiers")?.scrollIntoView()
    }
    // A reload or a step back restores the reader's scroll, so only a fresh visit jumps to the tiers.
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined
    follow(navigation?.type === "navigate")
    const onHashChange = () => follow(true)
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  const show = (next: View) => {
    setView(next)
    window.history.replaceState(null, "", next === "self-hosted" ? selfHostedTiersHash : "#tiers")
  }

  const panel = (current: View, content: TierViewSwitchProps["hosted"], other: View, icon: typeof Server) => (
    <div className={cn(view !== current && "hidden noscript:block", current === "self-hosted" && "noscript:mt-20")}>
      {content.header}
      <div className="mt-5 noscript:hidden">
        <PlanViewPrompt icon={icon} prompt={content.prompt}>
          <button type="button" className={planViewLinkClass} onClick={() => show(other)}>
            {content.link}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        </PlanViewPrompt>
      </div>
      {content.body}
    </div>
  )

  return (
    <>
      {panel("hosted", hosted, "self-hosted", Server)}
      {panel("self-hosted", selfHosted, "hosted", Cloud)}
    </>
  )
}
