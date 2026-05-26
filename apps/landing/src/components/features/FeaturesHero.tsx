import { buttonVariants } from "@/components/ui/button"
import { APP_SIGNUP_URL } from "@/lib/app-links"
import { cn } from "@/lib/utils"
import { ArrowRight } from "lucide-react"

export function FeaturesHero() {
  return (
    <section className="relative overflow-hidden" id="features-hero">
      <div className="mx-auto max-w-7xl px-6 pt-16 md:pt-20 lg:pt-24">
        {/* Hero copy */}
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="animate-fade-up display-heading delay-100">
            AI receptionist features that actually{" "}
            <span className="underline decoration-2 underline-offset-4">
              gets work done
            </span>
          </h1>

          <p className="animate-fade-up body-copy mx-auto mt-6 max-w-[65ch] delay-200 md:text-lg">
            LobbyStack handles AI phone answering, appointment booking, team
            follow-up, call routing, quotes, and lead qualification without
            phone trees or workflow-builder mess.
          </p>

          {/* CTAs */}
          <div className="animate-fade-up mt-8 flex items-center justify-center gap-4 delay-300">
            <a
              href={APP_SIGNUP_URL}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 rounded-full px-7 text-sm"
              )}
              data-ph-signup-cta
              data-ph-capture-attribute-section="features_hero"
              data-ph-capture-attribute-action="try_for_free"
              data-ph-capture-attribute-destination={APP_SIGNUP_URL}
            >
              Try for free
              <ArrowRight className="ml-1 size-4" />
            </a>
            <a
              href="/pricing/"
              data-ph-capture-attribute-section="features_hero"
              data-ph-capture-attribute-action="view_pricing"
              data-ph-capture-attribute-destination="/pricing/"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              View pricing
            </a>
          </div>
        </div>

        {/* Three product panels */}
        <div className="animate-fade-up mx-auto mt-16 max-w-5xl delay-500 md:mt-20">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Panel 1: Plain-language workflow */}
            <div className="flex flex-col rounded-2xl border border-border/70 bg-background p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                  1
                </span>
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  Write the workflow
                </p>
              </div>
              <div className="flex-1 rounded-xl bg-muted/60 p-4">
                <p className="font-mono text-xs leading-relaxed text-foreground/80">
                  When someone asks for a quote, ask what service they need,
                  where they are located, their timeline, and their budget. Give
                  our approved price range for standard jobs. If they need exact
                  pricing, schedule a callback with sales and attach the
                  summary for the team.
                </p>
              </div>
            </div>

            {/* Panel 2: Call summary */}
            <div className="flex flex-col rounded-2xl border border-border/70 bg-background p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                  2
                </span>
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  LobbyStack handles the call
                </p>
              </div>
              <div className="flex-1 space-y-3">
                <h4 className="text-sm font-medium text-foreground">
                  Quote request from Sarah M.
                </h4>
                <ul className="space-y-1.5 text-[13px] text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30" />
                    Service: Renovation estimate
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30" />
                    Budget: $8,000 to $12,000
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30" />
                    Timeline: Next month
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30" />
                    Price range shared
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1 rounded-full bg-foreground/30" />
                    Callback needed
                  </li>
                </ul>
              </div>
            </div>

            {/* Panel 3: Callback booked */}
            <div className="flex flex-col rounded-2xl border border-border/70 bg-background p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
                  3
                </span>
                <p className="text-xs font-medium tracking-wide text-muted-foreground">
                  Review the outcome
                </p>
              </div>
              <div className="flex-1 space-y-3">
                <h4 className="text-sm font-medium text-foreground">
                  Callback booked
                </h4>
                <p className="text-lg font-medium tracking-tight text-foreground">
                  Tuesday at 2:00 PM
                </p>
                <ul className="space-y-1.5 text-[13px] text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Assigned to Alex
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Customer confirmation sent
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Team notification sent
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-emerald-500" />
                    Summary attached
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
