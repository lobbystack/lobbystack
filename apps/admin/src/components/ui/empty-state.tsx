import * as React from "react"

import { cn } from "@/lib/utils"

type EmptyStateProps = Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
}

/** The dashed box an empty list or section shows in place of its content. */
function EmptyState({ title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn("rounded-xl border border-dashed p-12 text-center", className)}
      {...props}
    >
      <p data-slot="empty-state-title" className="type-empty-title">{title}</p>
      {description ? <p data-slot="empty-state-description" className="type-empty-description mt-2">{description}</p> : null}
      {action ? <div data-slot="empty-state-action" className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
