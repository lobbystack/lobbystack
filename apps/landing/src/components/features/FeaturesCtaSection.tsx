import { buttonVariants } from "@/components/ui/button"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { ArrowRight } from "lucide-react"

export function FeaturesCtaSection() {
  return (
    <section className="flex min-h-[360px] items-center bg-background py-16 md:min-h-[440px] md:py-20 lg:min-h-[500px]">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="section-heading">
          Stop letting missed calls decide your{" "}
          <span className="underline decoration-2 underline-offset-4">
            revenue
          </span>
        </h2>
        <p className="section-intro mx-auto max-w-xl">
          Let LobbyStack answer, qualify, quote, book, follow up, and notify
          your team day or night.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href={APP_SIGNUP_URL}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-11 rounded-full px-7 text-sm"
            )}
            data-ph-signup-cta
            data-ph-capture-attribute-section="features_final_cta"
            data-ph-capture-attribute-action="try_for_free"
            data-ph-capture-attribute-destination={APP_SIGNUP_URL}
          >
            Try for free
            <ArrowRight className="ml-1 size-4" />
          </a>
          <a
            href="/pricing/"
            data-ph-capture-attribute-section="features_final_cta"
            data-ph-capture-attribute-action="view_pricing"
            data-ph-capture-attribute-destination="/pricing/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            View pricing
          </a>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          No credit card required · Cancel anytime
        </p>
      </div>
    </section>
  )
}
