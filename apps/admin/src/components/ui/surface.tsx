import * as React from "react"

import { cn } from "@/lib/utils"

export const surfaceClassName = "overflow-hidden rounded-xl border border-border bg-card"

function Surface({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="surface"
      className={cn(surfaceClassName, className)}
      {...props}
    />
  )
}

export { Surface }
