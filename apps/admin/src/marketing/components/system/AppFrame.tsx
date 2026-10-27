import type { ReactNode } from "react"

import { cn } from "@/marketing/lib/utils"

/** A product screenshot in a soft window frame with pale window controls. */
export function AppFrame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-[1.25rem] bg-[oklch(0.965_0.003_60)] p-2 ring-1 ring-black/[0.04] md:rounded-[1.75rem] md:p-3",
        "shadow-[0_2px_4px_oklch(0_0_0/3%),0_24px_64px_-24px_oklch(0.3_0.02_60/22%)]",
        className
      )}
    >
      <div className="flex gap-2 px-2 pt-1 pb-2.5 md:px-3 md:pt-1.5 md:pb-3" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-[oklch(0.78_0.08_25)] md:size-3" />
        <span className="size-2.5 rounded-full bg-[oklch(0.88_0.08_85)] md:size-3" />
        <span className="size-2.5 rounded-full bg-[oklch(0.82_0.08_150)] md:size-3" />
      </div>
      <div className="overflow-hidden rounded-[0.875rem] bg-background ring-1 ring-black/[0.06] md:rounded-[1.125rem]">{children}</div>
    </div>
  )
}

/** A screenshot's file and pixel size, with smaller copies for narrow screens when it has them. */
export type ScreenshotSource = { src: string; width: number; height: number; srcSet?: string; sizes?: string }

/** A screenshot image at its pixel size, so the page reserves its space. */
export function Screenshot({
  shot,
  alt,
  priority,
  className,
}: {
  shot: ScreenshotSource
  alt: string
  priority?: boolean
  className?: string
}) {
  return (
    <img
      src={shot.src}
      {...(shot.srcSet ? { srcSet: shot.srcSet, sizes: shot.sizes } : {})}
      alt={alt}
      width={shot.width}
      height={shot.height}
      className={cn("block w-full", className)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  )
}
