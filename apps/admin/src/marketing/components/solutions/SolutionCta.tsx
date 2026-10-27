import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { appSignupUrl } from "@/marketing/lib/app-links"

type SolutionCtaProps = {
  heading: string
  intro: string
  footnote: string
}

/** The closing call to action on the English solution pages. */
export function SolutionCta({ heading, intro, footnote }: SolutionCtaProps) {
  return (
    <ClosingCta
      titleLines={[heading]}
      body={intro}
      primary={{ label: "Try for free", href: appSignupUrl("en") }}
      secondary={{ label: "View pricing", href: "/pricing/" }}
      footnote={footnote}
    />
  )
}
