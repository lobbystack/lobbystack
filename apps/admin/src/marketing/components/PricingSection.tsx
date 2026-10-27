import { planComparison, type ComparisonValue } from "@lobbystack/shared/plan-comparison"
import { ArrowRight, Server } from "lucide-react"
import { Fragment } from "react"

import { ComparisonCell } from "@/marketing/components/pricing/ComparisonCell"
import { PlanViewPrompt, planViewLinkClass } from "@/marketing/components/pricing/PlanViewPrompt"
import { PlanCards } from "@/marketing/components/system/PlanCards"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import type { Locale } from "@/marketing/i18n"
import { localizePath } from "@/marketing/i18n/routes"
import { eyebrow } from "@/marketing/lib/eyebrows"
import { billingSwitchLabels, pricingSectionCopy } from "@/marketing/lib/pricing-copy"
import { pricingPlanCards } from "@/marketing/lib/pricing-plan-cards"
import { cn } from "@/marketing/lib/utils"

// The table's rows come from the shared plan comparison, which onboarding uses too.
const planColumns = ["Free", "Starter", "Pro", "Enterprise"] as const

export function PricingSection({ locale = "en" }: { locale?: Locale }) {
  const copy = pricingSectionCopy[locale]
  const comparisonGroups = planComparison(locale)

  return (
    <>
      <section className="pt-10 md:pt-11" id="plans">
        <div className="mx-auto max-w-site px-6">
          <SectionTitle as="h1" centered eyebrow={eyebrow(locale, "pricing.hero")} intro={copy.intro} className="max-w-[44rem]">
            {copy.heading}
          </SectionTitle>
          <div className="mt-6">
            <PlanViewPrompt icon={Server} prompt={copy.selfHostedPrompt}>
              <a href={localizePath(locale, "/pricing/self-hosted/")} className={planViewLinkClass}>
                {copy.selfHostedLink}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </a>
            </PlanViewPrompt>
          </div>
          <PlanCards
            className="mt-8"
            headingLevel="h2"
            cards={pricingPlanCards(locale, "pricing_plan")}
            labels={billingSwitchLabels(locale)}
          />
        </div>
      </section>

      <section className="section-spacing" id="compare">
        <div className="mx-auto max-w-site px-6">
          <SectionTitle centered eyebrow={eyebrow(locale, "pricing.compare")} intro={copy.compareIntro} className="max-w-[44rem]">
            {copy.compareHeading}
          </SectionTitle>

          <div
            className="relative mt-12 overflow-x-auto rounded-2xl border border-border/60"
            role="region"
            aria-label={copy.tableLabel}
            tabIndex={0}
          >
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">{copy.caption}</caption>
              <thead>
                <tr className="bg-beige">
                  <th scope="col" className="py-4 pr-8 pl-6 text-left text-xs font-medium text-muted-foreground">
                    {copy.feature}
                  </th>
                  {planColumns.map((plan) => (
                    <th
                      key={plan}
                      scope="col"
                      className={cn(
                        "w-[150px] px-4 py-4 text-center font-heading text-base font-medium tracking-[-0.03em] text-foreground",
                        plan === "Pro" && "bg-beige-strong/60"
                      )}
                    >
                      {plan}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {comparisonGroups.map((group) => (
                  <Fragment key={group.category}>
                    <tr>
                      <td colSpan={5} className="pt-8 pb-3 pl-6 font-mono text-xs font-semibold tracking-[-0.02em] text-beige-foreground uppercase">
                        {group.category}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.feature} className="border-t border-border/50">
                        <th scope="row" className="py-3 pr-8 pl-6 text-left font-medium text-foreground">
                          {row.feature}
                        </th>
                        {([row.free, row.starter ?? row.pro, row.pro, row.enterprise] as ComparisonValue[]).map((value, i) => (
                          <td key={i} className={cn("px-4 py-3 text-center", i === 2 && "bg-beige/70")}>
                            <ComparisonCell includedLabel={copy.included} notIncludedLabel={copy.notIncluded} value={value} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  )
}
