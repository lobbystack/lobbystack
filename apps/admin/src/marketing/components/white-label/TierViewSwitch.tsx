"use client"

import { ArrowRight, Cloud, Server } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import { PlanViewPrompt, planViewLinkClass } from "@/marketing/components/pricing/PlanViewPrompt"

type View = "hosted" | "self-hosted"

/** Links to the self-hosted view, so another page can open the tiers on it. */
export const selfHostedTiersHash = "#self-hosted-tiers"

type TierViewSwitchProps = {
  hosted: { header: ReactNode; body: ReactNode; prompt: string; link: string }
  selfHosted: { header: ReactNode; body: ReactNode; prompt: string; link: string }
}

/**
 * The partner tiers and their self-hosted plans in one section. Both views
 * are in the server HTML; the link under the heading swaps which one shows.
 */
export function TierViewSwitch({ hosted, selfHosted }: TierViewSwitchProps) {
  const [view, setView] = useState<View>("hosted")

  useEffect(() => {
    const sync = () => {
      if (window.location.hash !== selfHostedTiersHash) return
      setView("self-hosted")
      document.getElementById("tiers")?.scrollIntoView()
    }
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  const show = (next: View) => {
    setView(next)
    window.history.replaceState(null, "", next === "self-hosted" ? selfHostedTiersHash : "#tiers")
  }

  return (
    <>
      <div hidden={view !== "hosted"}>
        {hosted.header}
        <div className="mt-5">
          <PlanViewPrompt icon={Server} prompt={hosted.prompt}>
            <button type="button" className={planViewLinkClass} onClick={() => show("self-hosted")}>
              {hosted.link}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
          </PlanViewPrompt>
        </div>
        {hosted.body}
      </div>
      <div hidden={view !== "self-hosted"}>
        {selfHosted.header}
        <div className="mt-5">
          <PlanViewPrompt icon={Cloud} prompt={selfHosted.prompt}>
            <button type="button" className={planViewLinkClass} onClick={() => show("hosted")}>
              {selfHosted.link}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </button>
          </PlanViewPrompt>
        </div>
        {selfHosted.body}
      </div>
    </>
  )
}
