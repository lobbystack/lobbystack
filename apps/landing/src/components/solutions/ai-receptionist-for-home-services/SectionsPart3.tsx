import { buttonVariants } from "@/components/ui/button"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { ArrowRight } from "lucide-react"

export function SolutionCta() {
  return (
    <section className="flex min-h-[360px] items-center bg-background py-16 md:min-h-[440px] md:py-20 lg:min-h-[500px]">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="section-heading">
          Answer the next job call, even when your crew is already working
        </h2>
        <p className="section-intro mx-auto max-w-lg">
          Try LobbyStack with included voice minutes, set your trade-specific
          intake rules, and turn more phone calls into booked jobs.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href={APP_SIGNUP_URL}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 rounded-full px-7 text-sm"
            )}
          >
            Try for free
            <ArrowRight className="ml-1 size-4" />
          </a>
          <a
            href="/pricing/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            View pricing
          </a>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          No credit card required. Works with your existing business number.
        </p>
      </div>
    </section>
  )
}
