import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type PageHeaderProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="flex min-w-0 flex-col">
        <h1 className="type-page-title">{title}</h1>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
