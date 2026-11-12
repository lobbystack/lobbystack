// Which size a button takes, everywhere in the dashboard:
// - Page header actions, next to the page title (New appointment, Add agent,
//   Create API key, Test call): default. The page's main one is solid, the rest outline.
// - Section and card header actions, next to a section title (Skip setup, View all): sm.
// - Row actions in settings rows, list rows and cards (Edit, Change voice,
//   Save, Remove, Copy): sm, the same in every row of a group.
// - Dialog and form footers (Cancel, Save, Book appointment, Delete): default.
// - Full-page form submits (Sign in, Continue): default, full width.
// - Inline link-style actions (Skip inside a step): ghost or link, as they are.
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { LoaderCircle } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding whitespace-nowrap transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-input bg-input/30 shadow-xs hover:bg-input/50 hover:text-foreground aria-expanded:bg-input/50 aria-expanded:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        success:
          "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // Polar's Orbit Button sizes (github.com/polarsource/polar, clients/packages/orbit/src/components/Button.tsx):
      // default h-10 px-5 text-sm, sm h-8 px-3 text-xs, lg h-12 px-5 text-sm (type-button and type-button-sm), and square icon buttons at
      // those heights. Orbit spaces an icon from its label by hand; gap does that here. xs has no Orbit size
      // and stays the smallest step below sm.
      size: {
        default: "h-10 gap-2 px-5 type-button",
        xs: "h-6 gap-1 px-2.5 type-button-sm [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 type-button-sm",
        lg: "h-12 gap-2 px-5 type-button",
        icon: "size-10 type-button",
        "icon-xs": "size-6 type-button [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 type-button",
        "icon-lg": "size-12 type-button",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  children,
  disabled,
  loading = false,
  loadingLabel,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
    loadingLabel?: ReactNode
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {loadingLabel ?? children}
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
