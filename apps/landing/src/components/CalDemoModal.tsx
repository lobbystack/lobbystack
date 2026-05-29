import Cal, { getCalApi } from "@calcom/embed-react"
import {
  CAL_DEMO_CONFIG,
  CAL_DEMO_LINK,
  CAL_DEMO_NAMESPACE,
} from "@/lib/app-links"
import { CalendarDays, X } from "lucide-react"
import { useEffect, useState } from "react"

export function CalDemoModal() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const openDemo = (event: MouseEvent) => {
      const target = event.target

      if (!(target instanceof Element)) return
      if (!target.closest("[data-cal-demo-trigger]")) return

      event.preventDefault()
      setIsOpen(true)
    }

    document.addEventListener("click", openDemo)

    return () => {
      document.removeEventListener("click", openDemo)
    }
  }, [])

  useEffect(() => {
    const configureCal = async () => {
      const cal = await getCalApi({ namespace: CAL_DEMO_NAMESPACE })

      cal("ui", {
        hideEventTypeDetails: false,
        layout: CAL_DEMO_CONFIG.layout,
        theme: CAL_DEMO_CONFIG.theme,
      })
    }

    configureCal()
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false)
    }

    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", closeOnEscape)

    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [isOpen])

  return (
    <>
      <button
        type="button"
        className="fixed right-6 bottom-6 z-50 inline-flex size-16 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/20 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 md:right-9 md:bottom-8"
        aria-label="Book a Demo"
        data-cal-demo-trigger
        data-ph-capture-attribute-section="floating_cta"
        data-ph-capture-attribute-action="book_demo"
        data-ph-capture-attribute-destination={`cal.com/${CAL_DEMO_LINK}`}
      >
        <CalendarDays className="size-7" aria-hidden="true" />
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/55 p-4 md:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Book a Demo"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close demo scheduler"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative z-10 flex h-[min(780px,calc(100dvh-2rem))] w-[min(1080px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg bg-background shadow-2xl md:h-[min(820px,calc(100dvh-3rem))] md:w-[min(1120px,calc(100vw-3rem))]">
            <div className="flex h-12 shrink-0 items-center justify-end border-b border-border/70 px-3">
              <button
                type="button"
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label="Close demo scheduler"
                onClick={() => setIsOpen(false)}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <Cal
              namespace={CAL_DEMO_NAMESPACE}
              calLink={CAL_DEMO_LINK}
              className="cal-demo-inline"
              config={CAL_DEMO_CONFIG}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}
