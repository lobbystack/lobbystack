import { Check, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"

import { FaqSection } from "@/marketing/components/FaqSection"
import { ProductScene, type ProductSceneName } from "@/marketing/components/scenes/ProductScenes"
import { SolutionScene, type SolutionSceneFit, type SolutionSceneName } from "@/marketing/components/solution-layouts/solution/SolutionScenes"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { FactStrip } from "@/marketing/components/system/FactStrip"
import { IconCards, type IconCard } from "@/marketing/components/system/IconCards"
import { MediaCard } from "@/marketing/components/system/MediaCard"
import { PageHero } from "@/marketing/components/system/PageHero"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { SplitCard } from "@/marketing/components/system/SplitCard"
import { getCopy, localizeHref, type Locale } from "@/marketing/i18n"
import type { FaqItem } from "@/marketing/lib/seo"
import { cn } from "@/marketing/lib/utils"

// The solution template's sections, in GitBook's solution-page rhythm: a hero
// with a scene, a strip of facts, a centered title over two cards, split cards,
// icon grids, the FAQ, related links and the closing call to action.

/** Drops the undefined props, since the system components take exact optional props. */
function optional<T extends Record<string, unknown>>(props: T) {
  return Object.fromEntries(Object.entries(props).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>
  }
}

export const container = "mx-auto w-full max-w-site px-6"
export const sectionSpacing = "pt-20 md:pt-30"

/** A scene from either set, by name: the shared product scenes or the solution pages' own. */
export type AnyScene = { product: ProductSceneName } | { solution: SolutionSceneName }

const productFits = { hero: "panel", card: "wide", panel: "panel" } as const

export function SceneArt({ scene, locale, fit }: { scene: AnyScene; locale: Locale; fit: SolutionSceneFit }) {
  return "product" in scene ? (
    <ProductScene name={scene.product} locale={locale} fit={productFits[fit]} />
  ) : (
    <SolutionScene name={scene.solution} locale={locale} fit={fit} />
  )
}

export type CtaLink = { label: string; href: string; attributes?: Record<string, string | boolean | undefined> }

/** A sign-up button's link, tagged for analytics with the section it sits in. */
export function signupLink(label: string, href: string, section: string): CtaLink {
  return {
    label,
    href,
    attributes: {
      "data-ph-signup-cta": true,
      "data-ph-capture-attribute-section": section,
      "data-ph-capture-attribute-action": "try_for_free",
      "data-ph-capture-attribute-destination": href,
    },
  }
}

export function SolutionHero({
  eyebrow,
  title,
  intro,
  primary,
  secondary,
  footnote,
  art,
}: {
  eyebrow: string
  title: string
  intro: string
  primary: CtaLink
  secondary: CtaLink
  footnote: string
  art: ReactNode
}) {
  return (
    <PageHero
      eyebrow={eyebrow}
      title={title}
      intro={intro}
      actions={
        <>
          <ButtonLink href={primary.href} {...primary.attributes}>
            {primary.label}
          </ButtonLink>
          <ButtonLink href={secondary.href} variant="secondary" {...secondary.attributes}>
            {secondary.label}
          </ButtonLink>
        </>
      }
      footnote={footnote}
      art={art}
    />
  )
}

export function SolutionFacts({ facts }: { facts: string[] }) {
  return (
    <div className={cn(container, "mt-12 md:mt-16")}>
      <FactStrip facts={facts} />
    </div>
  )
}

export type MediaPairCard = { eyebrow?: string; title: string; body: ReactNode; media: ReactNode; action?: ReactNode }

/** A centered title over two picture cards. */
export function MediaPair({
  id,
  eyebrow,
  title,
  intro,
  cards,
  className,
}: {
  id?: string
  eyebrow?: string
  title: string
  intro?: ReactNode
  cards: [MediaPairCard, MediaPairCard]
  className?: string
}) {
  return (
    <section className={cn(sectionSpacing, className)} id={id}>
      <div className={container}>
        <SectionTitle centered {...optional({ eyebrow })} intro={intro} className="max-w-3xl">
          {title}
        </SectionTitle>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {cards.map((card) => (
            <MediaCard
              key={card.title}
              media={card.media}
              mediaClassName="h-72 sm:h-80"
              {...optional({ eyebrow: card.eyebrow })}
              title={card.title}
              body={card.body}
              action={card.action}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export function CheckList({ points }: { points: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {points.map((point) => (
        <li key={point} className="flex items-start gap-3 text-base leading-6 text-foreground/85">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
            <Check className="size-3 text-foreground/80" strokeWidth={2.5} aria-hidden="true" />
          </span>
          {point}
        </li>
      ))}
    </ul>
  )
}

/** A split card in its own section, the scene on one side and the text on the other. */
export function SplitSection({
  id,
  eyebrow,
  title,
  body,
  points,
  media,
  reverse,
  action,
  children,
  headingLevel = "h2",
}: {
  id?: string
  eyebrow?: string
  title: string
  body: ReactNode
  points?: string[]
  media: ReactNode
  reverse?: boolean
  action?: ReactNode
  children?: ReactNode
  headingLevel?: "h2" | "h3"
}) {
  return (
    <section className={sectionSpacing} id={id}>
      <div className={container}>
        <SplitCard
          media={media}
          {...optional({ reverse })}
          columns={reverse ? "md:grid-cols-[1fr_1.15fr]" : "md:grid-cols-[1.15fr_1fr]"}
          mediaClassName="min-h-[20rem] md:min-h-[28rem]"
          {...optional({ eyebrow })}
          headingLevel={headingLevel}
          title={title}
          body={body}
          action={action}
        >
          {points && points.length > 0 && <CheckList points={points} />}
          {children}
        </SplitCard>
      </div>
    </section>
  )
}

/** A centered title over a grid of icon cards: 2×2, or three across. */
export function IconGrid({
  id,
  eyebrow,
  title,
  intro,
  cards,
  columns = 2,
  footer,
}: {
  id?: string
  eyebrow?: string
  title: string
  intro?: ReactNode
  cards: IconCard[]
  columns?: 2 | 3
  footer?: ReactNode
}) {
  return (
    <section className={sectionSpacing} id={id}>
      <div className={container}>
        <SectionTitle centered {...optional({ eyebrow })} intro={intro} className="max-w-3xl">
          {title}
        </SectionTitle>
        <IconCards className="mt-12" cards={cards} columns={columns} />
        {footer && <div className="mt-6 text-center">{footer}</div>}
      </div>
    </section>
  )
}

export type LinkTile = { href: string; title: string; detail: string }

/** Links to neighbouring pages, in a joined grid of rows. */
export function LinkGrid({
  id,
  title,
  intro,
  links,
  locale,
}: {
  id?: string
  title: string
  intro?: string
  links: LinkTile[]
  locale: Locale
}) {
  return (
    <section className={sectionSpacing} id={id}>
      <div className={container}>
        <SectionTitle centered intro={intro} className="max-w-3xl">
          {title}
        </SectionTitle>
        <ul
          className={cn(
            "mt-12 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-2",
            links.length % 4 === 0 ? "lg:grid-cols-4" : links.length % 5 === 0 ? "lg:grid-cols-5" : "lg:grid-cols-3"
          )}
        >
          {links.map((link) => (
            <li key={link.href} className="bg-background">
              <a
                href={localizeHref(locale, link.href)}
                className="group flex h-full items-start justify-between gap-3 px-5 py-5 transition-colors hover:bg-beige focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{link.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">{link.detail}</span>
                </span>
                <ChevronRight
                  className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** The FAQ, then the related pages as pill links under it. */
export function FaqAndRelated({
  heading,
  faqs,
  related,
  locale,
}: {
  heading: string
  faqs: FaqItem[]
  related: { label: string; href: string }[]
  locale: Locale
}) {
  const copy = getCopy(locale)
  return (
    <>
      {faqs.length > 0 && <FaqSection className={sectionSpacing} heading={heading} faqs={faqs} />}
      {related.length > 0 && (
        <nav aria-labelledby="related-heading" className="mx-auto w-full max-w-[51.25rem] px-6 pt-16">
          <h2 id="related-heading" className="eyebrow text-center">
            {copy.common.relatedResources}
          </h2>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            {related.map((link) => (
              <ButtonLink key={link.href} href={localizeHref(locale, link.href)} variant="secondary" size="sm">
                {link.label}
              </ButtonLink>
            ))}
          </div>
        </nav>
      )}
    </>
  )
}

export function SolutionClosing({
  title,
  body,
  primary,
  secondary,
  footnote,
}: {
  title: string
  body: string
  primary: CtaLink
  secondary: CtaLink
  footnote?: string
}) {
  return <ClosingCta titleLines={[title]} body={body} primary={primary} secondary={secondary} {...optional({ footnote })} />
}
