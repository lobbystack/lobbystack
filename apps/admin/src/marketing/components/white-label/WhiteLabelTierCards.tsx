"use client"

import { CircleCheck } from "lucide-react"
import { useState } from "react"

import { BillingIntervalSwitch, type BillingInterval } from "@/marketing/components/BillingIntervalSwitch"
import { PillLink } from "@/marketing/components/white-label/PillLink"
import { cn } from "@/marketing/lib/utils"

export type WhiteLabelTierCard = {
  slug: string
  name: string
  description: string
  cta: string
  highlighted: boolean
  /** The "/mo" after a paid tier's price, as on the pricing page. */
  period: string | null
  /** The per-month amount on each interval, and how it's billed. */
  price: Record<BillingInterval, { amount: string; note: string | null }>
  features: string[]
}

type WhiteLabelTierCardsProps = {
  cards: WhiteLabelTierCard[]
  labels: { monthly: string; annual: string; save: string; billingLabel: string }
  signup: string
}

export function WhiteLabelTierCards({ cards, labels, signup }: WhiteLabelTierCardsProps) {
  const [interval, setInterval] = useState<BillingInterval>("annual")
  return (
    <>
      <div className="mt-8 flex justify-center">
        <BillingIntervalSwitch labels={labels} onChange={setInterval} value={interval} />
      </div>
      <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const price = card.price[interval]
          return (
            <article
              key={card.slug}
              className={cn(
                "flex flex-col rounded-2xl border p-8 xl:p-6",
                card.highlighted ? "border-primary bg-background ring-1 ring-primary" : "border-border/60 bg-beige"
              )}
            >
              <h3 className="text-xl font-medium tracking-[-0.02em]">{card.name}</h3>
              <p className="mt-3 text-base leading-6 text-muted-foreground md:min-h-[4.5rem]">{card.description}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span key={price.amount} className="swap-in font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums">
                  {price.amount}
                </span>
                {card.period && <span className="text-sm text-muted-foreground">{card.period}</span>}
              </div>
              <p className="mt-3 min-h-5 text-sm text-muted-foreground">{price.note}</p>
              <PillLink
                href={signup}
                variant={card.highlighted ? "primary" : "secondary"}
                className="mt-5 w-full"
                section={`white_label_tier_${card.slug}`}
              >
                {card.cta}
              </PillLink>
              <ul className="mt-6 space-y-3">
                {card.features.map((feature) => (
                  <li key={feature} className="flex gap-3 text-base leading-6 text-muted-foreground">
                    <CircleCheck className="mt-1 size-4 shrink-0 text-beige-foreground" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>
    </>
  )
}
