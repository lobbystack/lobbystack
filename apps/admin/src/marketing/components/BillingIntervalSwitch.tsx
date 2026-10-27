"use client"

import { useLayoutEffect, useRef, useState } from "react"

import { Button } from "@/marketing/components/ui/button"
import { cn } from "@/marketing/lib/utils"

export type BillingInterval = "monthly" | "annual"

type BillingIntervalSwitchProps = {
  value: BillingInterval
  onChange: (interval: BillingInterval) => void
  labels: { monthly: string; annual: string; save: string; billingLabel: string }
}

/** The Monthly / Annual tabs above plan cards, with a thumb that slides between them. */
export function BillingIntervalSwitch({ value, onChange, labels }: BillingIntervalSwitchProps) {
  const tabRefs = useRef<Record<BillingInterval, HTMLButtonElement | null>>({
    monthly: null,
    annual: null,
  })
  // Measured position of the selected tab. Until hydration measures it, the
  // selected tab paints its own background so the server HTML still shows state.
  const [thumb, setThumb] = useState<{ x: number; width: number } | null>(
    null
  )

  useLayoutEffect(() => {
    const tab = tabRefs.current[value]
    if (!tab) return

    const measure = () =>
      setThumb({ x: tab.offsetLeft, width: tab.offsetWidth })
    measure()

    // Watch every tab: a late font swap can resize the one before this tab
    // and shift it without changing its own size.
    const observer = new ResizeObserver(measure)
    Object.values(tabRefs.current).forEach((node) => node && observer.observe(node))
    return () => observer.disconnect()
  }, [value])

  return (
    <div
      aria-label={labels.billingLabel}
      className="relative inline-flex rounded-full border border-border bg-input/30 p-1"
      role="tablist"
    >
      {thumb && (
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 left-0 rounded-full bg-background shadow-sm transition-[translate,width] duration-250 ease-(--ease-out) motion-reduce:transition-none"
          style={{ translate: `${thumb.x}px 0`, width: thumb.width }}
        />
      )}
      {(["monthly", "annual"] as const).map((interval) => (
        <Button
          aria-selected={value === interval}
          className={cn(
            "relative h-9 rounded-full border-transparent bg-transparent px-4 hover:bg-transparent",
            value === interval
              ? cn(
                  "text-foreground",
                  !thumb && "bg-background shadow-sm hover:bg-background"
                )
              : "text-muted-foreground hover:text-foreground"
          )}
          key={interval}
          ref={(node) => {
            tabRefs.current[interval] = node
          }}
          onClick={() => onChange(interval)}
          role="tab"
          size="sm"
          type="button"
          variant="outline"
        >
          {interval === "monthly" ? labels.monthly : labels.annual}
          {interval === "annual" ? (
            <span className="ml-1 rounded-full bg-beige-strong px-2 py-0.5 text-xs font-medium text-foreground/80">
              {labels.save}
            </span>
          ) : null}
        </Button>
      ))}
    </div>
  )
}
