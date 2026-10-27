import { ArrowRight } from "lucide-react"
import type { AnchorHTMLAttributes, ReactNode } from "react"

import { buttonVariants } from "@/marketing/components/ui/button"
import { cn } from "@/marketing/lib/utils"

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  variant?: "default" | "secondary" | "outline"
  size?: "default" | "sm"
  /** The arrow that slides on hover. Primary links show it unless told not to. */
  arrow?: boolean
  children: ReactNode
}

/** A link that looks like the site's pill button. */
export function ButtonLink({
  href,
  variant = "default",
  size = "default",
  arrow = variant === "default",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a href={href} className={cn(buttonVariants({ variant, size }), className)} {...props}>
      {children}
      {arrow && (
        <ArrowRight
          className="size-4 transition-transform duration-200 ease-(--ease-out) group-hover/button:translate-x-0.5"
          aria-hidden="true"
        />
      )}
    </a>
  )
}
