import { ArrowRight, Check } from "lucide-react"

import { FaqSection } from "@/marketing/components/FaqSection"
import { ProductScene } from "@/marketing/components/scenes/ProductScenes"
import { GeneralScene } from "@/marketing/components/solution-layouts/general/GeneralScenes"
import { getGeneralLayoutCopy } from "@/marketing/components/solution-layouts/general/general-copy"
import { heroSceneFor, sectionScenesFor, type PickedScene } from "@/marketing/components/solution-layouts/general/scene-picker"
import type { SeoLandingPageProps } from "@/marketing/components/solution-layouts/types"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { FactStrip } from "@/marketing/components/system/FactStrip"
import { PageHero } from "@/marketing/components/system/PageHero"
import { SplitCard } from "@/marketing/components/system/SplitCard"
import { getCopy, localizeHref, type Locale } from "@/marketing/i18n"
import { appSignupUrl } from "@/marketing/lib/app-links"

const container = "mx-auto w-full max-w-site px-6"

// These shared scenes are wider than a phone-width panel at the panel fit, so they take the wide fit.
const wideScenes = new Set<string>(["answeredBooked", "guardrails"])

function SceneArt({ scene, locale, hero, neutral }: { scene: PickedScene; locale: Locale; hero?: boolean; neutral?: boolean }) {
  if (scene.kind === "general") return <GeneralScene name={scene.name} locale={locale} fit={hero ? "hero" : "panel"} />
  const fit = wideScenes.has(scene.name) ? "wide" : hero ? "square" : "panel"
  return <ProductScene name={scene.name} locale={locale} fit={fit} neutral={neutral} />
}

function Points({ points }: { points: string[] }) {
  if (points.length === 0) return null
  return (
    <ul className="mt-6 space-y-3">
      {points.map((point) => (
        <li key={point} className="flex items-start gap-3 text-base leading-6 text-foreground/85">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-beige-strong">
            <Check className="size-3 text-foreground/80" strokeWidth={2.5} aria-hidden="true" />
          </span>
          <span className="min-w-0">{point}</span>
        </li>
      ))}
    </ul>
  )
}

/** Every other solution page: salons, about, and the French, Spanish and Serbian trade pages. Modelled on GitBook's industry pages. */
export function GeneralLayout({ page, locale }: SeoLandingPageProps) {
  // The shared scenes speak plumbing; every other page gets lines that fit any trade.
  const neutral = page.slug !== "ai-receptionist-for-plumbers"
  const copy = getCopy(locale)
  const t = getGeneralLayoutCopy(locale)
  // localizeHref leaves absolute URLs alone, so the signup URL carries its own locale.
  const primaryHref = page.ctaPrimaryHref ? localizeHref(locale, page.ctaPrimaryHref) : appSignupUrl(locale)
  const primaryLabel = page.ctaPrimaryLabel ?? copy.common.tryFree
  const secondaryHref = localizeHref(locale, page.ctaSecondaryHref ?? "/pricing/")
  const heroScene = heroSceneFor(page)
  const sectionScenes = sectionScenesFor(page)

  return (
    <>
      <PageHero
        eyebrow={page.eyebrow}
        title={page.h1}
        intro={page.intro}
        actions={
          <>
            <ButtonLink href={primaryHref}>{primaryLabel}</ButtonLink>
            <ButtonLink href={secondaryHref} variant="secondary">
              {page.ctaSecondaryLabel ?? copy.common.seePricing}
            </ButtonLink>
          </>
        }
        footnote={page.heroFootnote ?? t.reassurance}
        art={heroScene && <SceneArt scene={heroScene} locale={locale} hero neutral={neutral} />}
      />

      {page.proofPoints.length > 0 && (
        <div className={`${container} mt-12 md:mt-16`}>
          <FactStrip facts={page.proofPoints} />
        </div>
      )}

      {page.sections.length > 0 && (
        <section className="pt-20 md:pt-30">
          <div className={`${container} space-y-6 md:space-y-12`}>
            {page.sections.map((section, index) => {
              const scene = sectionScenes[index]
              return (
                <SplitCard
                  key={section.title}
                  reverse={index % 2 === 1}
                  headingLevel="h2"
                  mediaClassName="min-h-[20rem] md:min-h-[30rem]"
                  media={scene ? <SceneArt scene={scene} locale={locale} neutral={neutral} /> : null}
                  title={section.title}
                  body={section.body}
                >
                  <Points points={section.points} />
                </SplitCard>
              )
            })}
          </div>
        </section>
      )}

      {page.faqs.length > 0 && (
        <FaqSection className="pt-20 md:pt-30" heading={page.faqHeading ?? t.faqHeading} faqs={page.faqs} />
      )}

      {page.relatedLinks.length > 0 && (
        <section className="pt-20 md:pt-30" aria-labelledby="related-resources">
          <div className={container}>
            <h2 id="related-resources" className="eyebrow">
              {copy.common.relatedResources}
            </h2>
            <ul className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-3">
              {page.relatedLinks.map((link) => {
                const external = /^https?:\/\//.test(link.href)
                return (
                  <li key={link.href} className="bg-background">
                    <a
                      href={localizeHref(locale, link.href)}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="group flex h-full items-center justify-between gap-4 px-5 py-5 text-base font-medium text-foreground transition-colors hover:bg-beige"
                    >
                      <span className="min-w-0">{link.label}</span>
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-(--ease-out) group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      <ClosingCta
        titleLines={[page.ctaHeading ?? t.ctaHeading]}
        body={page.ctaBody ?? t.ctaBody}
        primary={{ label: primaryLabel, href: primaryHref }}
        secondary={{ label: page.ctaSecondaryLabel ?? copy.common.viewPricing, href: secondaryHref }}
        footnote={copy.common.noCreditCardCancelAnytime}
      />
    </>
  )
}
