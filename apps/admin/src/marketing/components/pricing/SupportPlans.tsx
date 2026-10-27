"use client"

import { ArrowRight, Check, ChevronDown, Minus } from "lucide-react"
import { Fragment, useId, useState } from "react"

import { BillingIntervalSwitch, type BillingInterval } from "@/marketing/components/BillingIntervalSwitch"
import { ComparisonCell } from "@/marketing/components/pricing/ComparisonCell"
import { buttonVariants } from "@/marketing/components/ui/button"
import { PillLink } from "@/marketing/components/white-label/PillLink"
import type { SelfHostedSupportCopy, SupportAudienceCopy } from "@/marketing/lib/self-hosted-support-copy"
import type { SupportPlanCard } from "@/marketing/lib/self-hosted-support-plans"
import { cn } from "@/marketing/lib/utils"

type SupportPlansProps = {
  cards: SupportPlanCard[]
  groups: SupportAudienceCopy["groups"]
  labels: SelfHostedSupportCopy["labels"]
  /** "site" matches the pricing page's cards; "beige" matches the white-label tiers. */
  tone: "site" | "beige"
  /** The analytics section the buttons report. */
  section: string
}

/** The self-hosted plan cards, their billing switch, and the comparison table behind "Compare all features". */
export function SupportPlans({ cards, groups, labels, tone, section }: SupportPlansProps) {
  const [interval, setInterval] = useState<BillingInterval>("annual")
  const [comparing, setComparing] = useState(false)
  const tableId = useId()
  const Heading = tone === "site" ? "h2" : "h3"

  return (
    <>
      <div className="flex justify-center">
        <BillingIntervalSwitch labels={labels} onChange={setInterval} value={interval} />
      </div>

      <div className="mx-auto mt-8 grid max-w-xl gap-6 lg:max-w-6xl lg:grid-cols-3">
        {cards.map((card) => {
          const price = card.price[interval]
          const href = card.href[interval]
          const analytics = {
            section,
            action: card.slug === "complete" ? "self_hosted_deploy" : "self_hosted_checkout",
            destination: href,
            plan: card.name,
            "billing-interval": interval,
            label: card.cta,
          }
          return (
            <article
              key={card.slug}
              className={cn(
                "flex min-w-0 flex-col rounded-2xl border p-6",
                tone === "site"
                  ? cn("bg-background", card.highlighted ? "border-foreground/20 ring-1 ring-foreground/10" : "border-border/60")
                  : card.highlighted
                    ? "border-primary bg-background ring-1 ring-primary"
                    : "border-border/60 bg-beige"
              )}
            >
              <Heading
                className={tone === "site" ? "font-heading text-lg font-medium tracking-[-0.03em]" : "text-xl font-medium tracking-[-0.02em]"}
              >
                {card.name}
              </Heading>
              <div className="mt-3 flex items-baseline gap-1">
                <span key={price.amount} className="swap-in font-heading text-4xl font-medium tracking-[-0.05em] tabular-nums">
                  {price.amount}
                </span>
                <span className="text-sm text-muted-foreground">{card.period}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{price.note}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:min-h-[4.5rem]">{card.description}</p>

              {tone === "site" ? (
                <a
                  href={href}
                  className={cn(
                    buttonVariants({ variant: card.highlighted ? "default" : "outline" }),
                    "mt-5 h-auto min-h-11 w-full min-w-0 rounded-full px-4 py-2 text-center text-[0.8125rem] whitespace-normal sm:text-sm"
                  )}
                  {...Object.fromEntries(Object.entries(analytics).map(([key, value]) => [`data-ph-capture-attribute-${key}`, value]))}
                >
                  <span className="min-w-0">{card.cta}</span>
                  <ArrowRight className="size-4 shrink-0 transition-transform duration-200 ease-(--ease-out) group-hover/button:translate-x-0.5" />
                </a>
              ) : (
                <PillLink
                  href={href}
                  variant={card.highlighted ? "primary" : "secondary"}
                  className="mt-5 h-auto min-h-[2.375rem] w-full py-1.5 text-center whitespace-normal"
                  section={section}
                  analytics={analytics}
                >
                  {card.cta}
                </PillLink>
              )}

              <ul className="mt-6 flex flex-col gap-2.5 border-t border-border/50 pt-5">
                {card.lines.map((line) => (
                  <li
                    key={line.label}
                    className={cn("flex items-start gap-2.5 text-sm", !line.included && "text-muted-foreground")}
                  >
                    {line.included ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-foreground/60" aria-hidden="true" />
                    ) : (
                      <Minus className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/40" aria-hidden="true" />
                    )}
                    <span>
                      {line.label}
                      <span className="sr-only">{`: ${line.included ? labels.included : labels.notIncluded}`}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          )
        })}
      </div>

      {/* Without JavaScript the table below is open, so the button has nothing to do. */}
      <div className="mt-8 flex justify-center noscript:hidden">
        <button
          type="button"
          aria-controls={tableId}
          aria-expanded={comparing}
          onClick={() => setComparing((open) => !open)}
          className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-full px-4")}
        >
          {comparing ? labels.compareHide : labels.compareShow}
          <ChevronDown
            className={cn("size-4 transition-transform duration-200 ease-(--ease-out)", comparing && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Rendered while closed, so the comparison is in the page's HTML and open without JavaScript. */}
      <div id={tableId} className={cn("mx-auto mt-8 max-w-5xl", !comparing && "hidden noscript:block")}>
        <div className="overflow-x-auto" role="region" aria-label={labels.tableLabel} tabIndex={0}>
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">{labels.caption}</caption>
            <thead>
              <tr className="border-b border-border/60">
                <th scope="col" className="py-4 pr-8 text-left text-xs font-medium text-muted-foreground">
                  {labels.feature}
                </th>
                {cards.map((card) => (
                  <th
                    key={card.slug}
                    scope="col"
                    className={cn(
                      "w-[170px] px-4 py-4 text-center font-heading text-base font-medium tracking-[-0.03em] text-foreground",
                      card.highlighted && "rounded-t-xl bg-muted/60"
                    )}
                  >
                    {card.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.category}>
                  <tr>
                    <td colSpan={cards.length + 1} className="pt-8 pb-3 text-xs font-medium tracking-wide text-muted-foreground">
                      {group.category}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.feature} className="border-b border-border/40 last:border-0">
                      <th scope="row" className="py-3 pr-8 text-left font-medium text-foreground">
                        {row.feature}
                      </th>
                      {row.values.map((value, index) => (
                        <td key={index} className={cn("px-4 py-3 text-center", cards[index]?.highlighted && "bg-muted/60")}>
                          <ComparisonCell includedLabel={labels.included} notIncludedLabel={labels.notIncluded} value={value} />
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
    </>
  )
}
