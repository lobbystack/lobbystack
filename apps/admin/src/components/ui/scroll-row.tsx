"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/** What marks the chosen item in a scroll row: a tab, a segmented choice or a pressed chip. */
const ACTIVE_ITEM = "[data-active], [aria-selected='true'], [aria-pressed='true'], [aria-checked='true'], [aria-current='page']"

/** Scrolls `row` sideways just enough to show `item` whole, without moving the page. */
export function revealInRow(row: HTMLElement, item: HTMLElement) {
  const rowBox = row.getBoundingClientRect()
  const itemBox = item.getBoundingClientRect()
  if (itemBox.left < rowBox.left) row.scrollLeft -= rowBox.left - itemBox.left
  else if (itemBox.right > rowBox.right) row.scrollLeft += itemBox.right - rowBox.right
}

/**
 * Keeps a scroll row's chosen item in view: when the row mounts and whenever
 * the choice changes, the row scrolls so the chosen item shows whole.
 */
export function useActiveItemInView<Element extends HTMLElement>(ref: React.RefObject<Element | null>) {
  React.useEffect(() => {
    const row = ref.current
    if (!row) return
    const reveal = () => {
      const active = row.querySelector<HTMLElement>(ACTIVE_ITEM)
      if (active) revealInRow(row, active)
    }
    reveal()
    const observer = new MutationObserver(reveal)
    observer.observe(row, { attributes: true, attributeFilter: ["data-active", "aria-selected", "aria-pressed", "aria-checked", "aria-current"], subtree: true })
    return () => observer.disconnect()
  }, [ref])
}

/** Merges a forwarded ref with the row's own. */
export function useScrollRowRef<Element extends HTMLElement>(forwarded?: React.Ref<Element>) {
  const own = React.useRef<Element | null>(null)
  useActiveItemInView(own)
  return React.useCallback((node: Element | null) => {
    own.current = node
    if (typeof forwarded === "function") forwarded(node)
    else if (forwarded) (forwarded as React.RefObject<Element | null>).current = node
  }, [forwarded])
}

/** A plain row of chips or links that scrolls sideways and keeps the chosen one in view. */
function ScrollRow({ className, ref, ...props }: React.ComponentProps<"div">) {
  const rowRef = useScrollRowRef(ref)
  return <div className={cn("scroll-row items-center gap-1", className)} data-slot="scroll-row" ref={rowRef} {...props} />
}

export { ScrollRow }
