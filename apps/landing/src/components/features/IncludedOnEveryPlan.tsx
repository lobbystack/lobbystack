import { Check } from "lucide-react"

const includedFeatures = [
  "Call answering",
  "Plain-language workflows",
  "Appointment booking",
  "Appointment confirmation texts",
  "Outbound calls",
  "Transfers",
  "Call summaries",
  "Email notifications",
  "SMS notifications",
  "Spam filtering",
  "Calls under 10 seconds excluded",
  "Unlimited concurrent calls",
  "Knowledge base",
  "Dashboard and call history",
]

export function IncludedOnEveryPlan() {
  return (
    <section className="section-spacing" id="included">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section intro */}
        <div className="mb-12 max-w-3xl md:mb-16">
          <h2 className="section-heading">
            Every plan gets the full{" "}
            <span className="underline decoration-2 underline-offset-4">
              receptionist
            </span>
          </h2>
          <p className="section-intro">
            Plans scale by usage, not by locking basic receptionist features
            behind higher tiers.
          </p>
        </div>

        {/* Checkmark card */}
        <div className="rounded-2xl border border-border/70 bg-background p-8 md:p-10">
          <p className="mb-6 text-xs font-medium tracking-wide text-muted-foreground">
            Included on every plan
          </p>

          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {includedFeatures.map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-2.5 text-sm text-foreground"
              >
                <Check className="size-4 shrink-0 text-foreground/50" />
                {feature}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8">
          <a
            href="/pricing/"
            data-ph-capture-attribute-section="included_every_plan"
            data-ph-capture-attribute-action="view_pricing"
            data-ph-capture-attribute-destination="/pricing/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-7 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            View pricing
          </a>
        </div>
      </div>
    </section>
  )
}
