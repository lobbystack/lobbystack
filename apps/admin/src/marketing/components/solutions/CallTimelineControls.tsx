"use client"

import { useEffect } from "react"

/**
 * The carousel buttons of the CallTimeline whose heading has this id. The
 * timeline's markup is server-rendered; this only attaches the listeners.
 */
export function CallTimelineControls({ labelId }: { labelId: string }) {
  useEffect(() => {
    const root = document.getElementById(labelId)?.closest<HTMLElement>("[data-call-timeline]")
    const track = root?.querySelector<HTMLElement>("[data-call-timeline-track]")
    const prev = root?.querySelector<HTMLButtonElement>("[data-call-timeline-prev]")
    const next = root?.querySelector<HTMLButtonElement>("[data-call-timeline-next]")
    if (!track || !prev || !next) return

    // Move by one call: its width plus the gap to the next one.
    const step = () => {
      const [first, second] = track.children
      if (!(first instanceof HTMLElement)) return track.clientWidth
      return second instanceof HTMLElement ? second.offsetLeft - first.offsetLeft : first.offsetWidth
    }
    const behavior = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth")
    const update = () => {
      prev.disabled = track.scrollLeft <= 1
      next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1
    }
    const onPrev = () => track.scrollBy({ left: -step(), behavior: behavior() })
    const onNext = () => track.scrollBy({ left: step(), behavior: behavior() })

    prev.addEventListener("click", onPrev)
    next.addEventListener("click", onNext)
    track.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    update()
    return () => {
      prev.removeEventListener("click", onPrev)
      next.removeEventListener("click", onNext)
      track.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [labelId])
  return null
}
