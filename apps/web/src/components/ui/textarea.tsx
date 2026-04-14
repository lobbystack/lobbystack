import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({
  className,
  wrap = "hard",
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      wrap={wrap}
      className={cn(
        "min-h-24 w-full resize-none appearance-none rounded-xl border border-input bg-transparent px-4 py-3 text-[15px] leading-6 whitespace-pre-wrap break-words [overflow-wrap:anywhere] overflow-hidden transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
