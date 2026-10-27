import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/marketing/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium tracking-[-0.01em] whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] duration-150 ease-(--ease-out) outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        secondary: "bg-beige-strong text-foreground hover:bg-beige-strong/70",
        outline: "border border-border bg-background text-foreground hover:bg-beige aria-expanded:bg-beige",
        ghost: "hover:bg-beige hover:text-foreground aria-expanded:bg-beige",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/20",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // One size for calls to action, 38px tall, as on the white-label page.
        default: "h-[2.375rem] px-3.5 text-base",
        lg: "h-[2.375rem] px-3.5 text-base",
        sm: "h-8 px-3 text-sm",
        xs: "h-6 gap-1 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        icon: "size-[2.375rem]",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
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
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
