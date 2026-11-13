export const featurePageSlugs = [
  "call-transfers",
  "knowledge",
  "rules",
  "voices-and-languages",
  "inbox",
  "notifications",
  "analytics",
  "integrations",
] as const

export type FeaturePageSlug = (typeof featurePageSlugs)[number]

/** The mock-up beside a page's example: a quoted instruction, a list of rows, or text messages. */
export type FeatureMock =
  | { kind: "text"; text: string }
  | { kind: "rows"; rows: { label: string; value: string }[] }
  | { kind: "messages"; messages: string[] }

export type FeaturePageCopy = {
  seo: { title: string; description: string }
  /** The page's short name, used in breadcrumbs and the eyebrow. */
  name: string
  hero: { title: string; intro: string }
  facts: string[]
  benefits: { title: string; items: { title: string; body: string }[] }
  example: { eyebrow: string; title: string; body: string; mock: FeatureMock }
  /** Two illustrated sections, each a claim with three short points. */
  sections: { title: string; body: string; points: string[] }[]
  steps: { title: string; items: { title: string; body: string }[] }
  faqTitle: string
  faqs: { question: string; answer: string }[]
  closing: { titleLines: string[]; body: string }
}

export type FeaturePagesCopy = Record<FeaturePageSlug, FeaturePageCopy>
