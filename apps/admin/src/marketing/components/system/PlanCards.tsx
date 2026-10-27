"use client"

import { CircleCheck } from "lucide-react"
import { useState } from "react"

import { BillingIntervalSwitch, type BillingInterval } from "@/marketing/components/BillingIntervalSwitch"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { cn } from "@/marketing/lib/utils"

export type PlanFeature = string | { label: string; sublabel: string }

export type PlanCard = {
  key: string
  name: string
  description?: string
  /** The amount on each interval, and the line under it ("Per month, billed annually"). */
  price: Record<BillingInterval, { amount: string; note: string | null }>
  /** The "/mo" after a paid plan's price. */
  period: string | null
  highlighted: boolean
  cta: {
    label: string
    href: string
    /** Analytics attributes for the link. The billing interval is added here. */
    attributes?: Record<string, string | boolean | undefined>
  }
  features: PlanFeature[]
}

type PlanCardsProps = {
  cards: PlanCard[]
  labels: { monthly: string; annual: string; save: string; billingLabel: string }
  defaultInterval?: BillingInterval
  /** h2 when the cards sit right under the page's h1, as on the pricing page. */
  headingLevel?: "h2" | "h3"
  className?: string
}

/** Plan cards under a Monthly / Annual switch, as on the pricing page. */
export function PlanCards({ cards, labels, defaultInterval = "annual", headingLevel: Heading = "h3", className }: PlanCardsProps) {
  const [interval, setInterval] = useState<BillingInterval>(defaultInterval)
  const withDescriptions = cards.some((card) => card.description)
  return (
    <div className={className}>
      <div className="flex justify-center">
        <BillingIntervalSwitch labels={labels} onChange={setInterval} value={interval} />
      </div>
      <div className={cn("mt-10 grid gap-6 md:grid-cols-2", cards.length >= 4 ? "xl:grid-cols-4" : "lg:grid-cols-3")}>
        {cards.map((card) => {
          const price = card.price[interval]
          return (
            <article
              key={card.key}
              className={cn(
                "flex min-w-0 flex-col rounded-2xl border p-8 xl:p-6",
                card.highlighted ? "border-primary bg-background ring-1 ring-primary" : "border-border/60 bg-beige"
              )}
            >
              <Heading className="text-xl font-medium tracking-[-0.02em]">{card.name}</Heading>
              {withDescriptions && (
                <p className="mt-3 text-base leading-6 text-muted-foreground md:min-h-[4.5rem]">{card.description}</p>
              )}
              <div className="mt-4 flex items-baseline gap-1">
                <span key={price.amount} className="swap-in font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums">
                  {price.amount}
                </span>
                {card.period && <span className="text-sm text-muted-foreground">{card.period}</span>}
              </div>
              <p className="mt-3 min-h-5 text-sm text-muted-foreground">{price.note}</p>
              <ButtonLink
                href={card.cta.href}
                variant={card.highlighted ? "default" : "secondary"}
                arrow={card.highlighted}
                className="mt-5 w-full"
                {...card.cta.attributes}
                data-ph-capture-attribute-billing-interval={interval}
              >
                {card.cta.label}
              </ButtonLink>
              <ul className="mt-6 space-y-3">
                {card.features.map((feature) => {
                  const label = typeof feature === "string" ? feature : feature.label
                  return (
                    <li key={label} className="flex gap-3 text-base leading-6 text-muted-foreground">
                      <CircleCheck className="mt-1 size-4 shrink-0 text-beige-foreground" aria-hidden="true" />
                      <span>
                        {label}
                        {typeof feature !== "string" && <span className="block text-sm">{feature.sublabel}</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </article>
          )
        })}
      </div>
    </div>
  )
}
