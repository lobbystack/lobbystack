"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

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
  return (
    <div
      className={cn(
        // The actions wrap under the title when the content is too narrow for both, at any screen width.
        "flex flex-wrap items-start justify-between gap-x-6 gap-y-4 py-2",
        className
      )}
    >
      <div className={cn("flex min-w-0 max-w-full", titleAside ? "items-center gap-3" : "flex-col")}>
        <h1 className="type-page-title">{title}</h1>
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
