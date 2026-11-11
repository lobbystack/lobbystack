import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

/**
 * Polar's Status chip (clients/packages/orbit/src/components/Status.tsx): a
 * tinted pill sized in em, so it scales with its text. Pick the variant from
 * the shared map for the record in `@/lib/status-variants`.
 */
const statusSizes = {
  small: "px-[0.5em] py-[0.2em] text-xs",
  medium: "px-[0.7em] py-[0.3em] text-sm",
}

/** The chip's shape without its color, for placeholders that stand in for one. */
const statusShape = cva(
  "inline-flex w-fit shrink-0 flex-row items-center justify-center rounded-[0.5em] whitespace-nowrap",
  { variants: { size: statusSizes }, defaultVariants: { size: "small" } }
)

const statusVariants = cva(
  "inline-flex w-fit shrink-0 flex-row items-center justify-center rounded-[0.5em] whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-status-neutral text-status-neutral-foreground",
        success: "bg-status-success text-status-success-foreground",
        warning: "bg-status-warning text-status-warning-foreground",
        danger: "bg-status-danger text-status-danger-foreground",
        info: "bg-status-info text-status-info-foreground",
      },
      size: statusSizes,
    },
    defaultVariants: {
      variant: "neutral",
      size: "small",
    },
  }
)

type StatusVariant = NonNullable<VariantProps<typeof statusVariants>["variant"]>

// Like Polar's, the chip takes no className: its look comes from variant and size alone.
function Status({
  variant = "neutral",
  size = "small",
  ...props
}: Omit<React.ComponentProps<"span">, "className"> & VariantProps<typeof statusVariants>) {
  return (
    <span
      data-slot="status"
      data-variant={variant}
      className={statusVariants({ variant, size })}
      {...props}
    />
  )
}

export { Status, statusShape, statusVariants, type StatusVariant }
