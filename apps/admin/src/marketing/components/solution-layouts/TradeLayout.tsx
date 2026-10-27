import { LegacySolutionBody, type SeoLandingPageProps } from "@/marketing/components/solution-layouts/LegacySolutionBody"

/** English trade pages with written call examples (plumbers, HVAC, electricians, roofing and the rest in trade-details.ts). Modelled on GitBook's industry pages. */
export function TradeLayout(props: SeoLandingPageProps) {
  return <LegacySolutionBody {...props} />
}
