"use client"

import { createContext, useContext, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Takes the page title's heading, so the dashboard's phone top bar can show
 * the title once the heading scrolls under it. Unset outside the dashboard.
 */
export const PageTitleTargetContext = createContext<((heading: HTMLHeadingElement | null) => void | (() => void)) | null>(null)

type PageHeaderProps = {
  title: ReactNode
  /** Shown beside the title on the same row, outside the heading, for a live value such as a count. */
  titleAside?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  titleAside,
  actions,
  className,
}: PageHeaderProps) {
  const titleTarget = useContext(PageTitleTargetContext)
  return (
    <div
      className={cn(
        // The actions wrap under the title when the content is too narrow for both, at any screen width.
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-4 py-2",
        className
      )}
    >
      <div className={cn("flex min-w-0 max-w-full", titleAside ? "items-center gap-3" : "flex-col")}>
        <h1 className="type-page-title" ref={titleTarget ?? undefined}>{title}</h1>
        {titleAside}
      </div>
      {actions ? (
        // Pushed right, so actions that wrap under the title stay on the right.
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
