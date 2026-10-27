import { LegacySolutionBody, type SeoLandingPageProps } from "@/marketing/components/solution-layouts/LegacySolutionBody"

/** Every other solution page: salons, about, and the French, Spanish and Serbian trade pages. Modelled on GitBook's industry pages. */
export function GeneralLayout(props: SeoLandingPageProps) {
  return <LegacySolutionBody {...props} />
}
