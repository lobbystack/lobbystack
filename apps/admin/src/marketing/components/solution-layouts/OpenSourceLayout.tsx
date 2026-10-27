import { GitPullRequest, KeyRound, Scale, Sparkles } from "lucide-react"

import { FaqSection } from "@/marketing/components/FaqSection"
import { ProductScene } from "@/marketing/components/scenes/ProductScenes"
import type { SeoLandingPageProps } from "@/marketing/components/solution-layouts/types"
import { getOpenSourceLayoutCopy } from "@/marketing/components/solution-layouts/self-hosting/open-source-copy"
import {
  container,
  linkAttributes,
  RelatedLinks,
  sectionSpacing,
  signupLink,
} from "@/marketing/components/solution-layouts/self-hosting/parts"
import { SelfHostingScene } from "@/marketing/components/solution-layouts/self-hosting/SelfHostingScenes"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { FactStrip } from "@/marketing/components/system/FactStrip"
import { IconCards } from "@/marketing/components/system/IconCards"
import { MediaCard } from "@/marketing/components/system/MediaCard"
import { PageHero } from "@/marketing/components/system/PageHero"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { SplitCard } from "@/marketing/components/system/SplitCard"
import { getCopy, localizeHref } from "@/marketing/i18n"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { cn } from "@/marketing/lib/utils"

const githubUrl = "https://github.com/lobbystack/lobbystack"
const selfHostedPath = "/solutions/self-hosted-ai-receptionist/"

/** A short check list under a split card's body. */
function Points({ points }: { points: string[] }) {
  if (points.length === 0) return null
  return (
    <ul className="mt-5 space-y-2 text-base leading-6 text-muted-foreground">
      {points.map((point) => (
        <li key={point} className="flex gap-2.5">
          <span className="mt-2.5 size-1 shrink-0 rounded-full bg-foreground/60" aria-hidden="true" />
          {point}
        </li>
      ))}
    </ul>
  )
}

/**
 * The open-source page, in every language. Modelled on GitBook's open-source
 * solution page: the code, what you can change, where it runs.
 */
export function OpenSourceLayout({ page, locale }: SeoLandingPageProps) {
  const t = getOpenSourceLayoutCopy(locale)
  const common = getCopy(locale).common
  const signup = appSignupUrl(locale)
  const primaryHref = page.ctaPrimaryHref ?? githubUrl
  const secondaryHref = localizeHref(locale, page.ctaSecondaryHref ?? selfHostedPath)
  const [readCard, changeCard, selfHost, cloud] = page.sections
  const cardScenes = ["tools", "fork"] as const
  const iconCards = [Scale, KeyRound, Sparkles, GitPullRequest].map((icon, index) => ({
    icon,
    title: t.repo.cards[index]?.title ?? "",
    body: t.repo.cards[index]?.body ?? "",
  }))

  return (
    <>
      <PageHero
        eyebrow={page.eyebrow}
        title={page.h1}
        intro={page.intro}
        actions={
          <>
            <ButtonLink href={primaryHref} {...linkAttributes(primaryHref, "open_source_hero", "view_github")}>
              {page.ctaPrimaryLabel ?? "GitHub"}
            </ButtonLink>
            <ButtonLink href={secondaryHref} variant="secondary" {...linkAttributes(secondaryHref, "open_source_hero", "read_docs")}>
              {page.ctaSecondaryLabel}
            </ButtonLink>
          </>
        }
        footnote={t.heroFootnote}
        art={<SelfHostingScene name="repo" locale={locale} fit="hero" />}
      />

      <div className={cn(container, "mt-12 md:mt-16")}>
        <FactStrip facts={page.proofPoints} />
      </div>

      <section className={sectionSpacing} id="why-open-source">
        <div className={container}>
          <SectionTitle centered eyebrow={t.why.eyebrow} intro={t.why.intro} className="max-w-3xl">
            {t.why.title}
          </SectionTitle>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {[readCard, changeCard].map((section, index) =>
              section ? (
                <MediaCard
                  key={section.title}
                  media={<SelfHostingScene name={cardScenes[index] ?? "tools"} locale={locale} fit="wide" />}
                  mediaClassName="aspect-[9/5] sm:aspect-[9/4]"
                  title={section.title}
                  body={
                    <>
                      {section.body}
                      <Points points={section.points} />
                    </>
                  }
                />
              ) : null
            )}
          </div>
        </div>
      </section>

      {selfHost && (
        <section className={sectionSpacing} id="self-host">
          <div className={container}>
            <SplitCard
              media={<SelfHostingScene name="serverStack" locale={locale} />}
              mediaClassName="min-h-[22rem] md:min-h-[30rem]"
              columns="md:grid-cols-[1.18fr_0.82fr]"
              eyebrow={t.selfHost.eyebrow}
              headingLevel="h2"
              title={selfHost.title}
              body={selfHost.body}
              action={
                <ButtonLink
                  href={localizeHref(locale, selfHostedPath)}
                  {...linkAttributes(selfHostedPath, "open_source_self_host", "view_self_hosted_solution")}
                >
                  {t.selfHost.cta}
                </ButtonLink>
              }
            >
              <Points points={selfHost.points} />
            </SplitCard>
          </div>
        </section>
      )}

      <section className={sectionSpacing} id="repository">
        <div className={container}>
          <SectionTitle centered eyebrow={t.repo.eyebrow} intro={t.repo.intro} className="max-w-3xl">
            {t.repo.title}
          </SectionTitle>
          <IconCards className="mt-12" cards={iconCards} />
        </div>
      </section>

      {cloud && (
        <section className={sectionSpacing} id="cloud">
          <div className={container}>
            <SplitCard
              reverse
              media={<ProductScene name="callCapture" locale={locale} fit="panel" />}
              columns="md:grid-cols-[0.82fr_1.18fr]"
              eyebrow={t.cloud.eyebrow}
              headingLevel="h2"
              title={cloud.title}
              body={cloud.body}
              action={
                <>
                  <ButtonLink href={signup} {...signupLink(signup, "open_source_cloud")}>
                    {common.tryFree}
                  </ButtonLink>
                  <ButtonLink href={localizeHref(locale, "/pricing/")} variant="secondary">
                    {common.viewPricing}
                  </ButtonLink>
                </>
              }
            >
              <Points points={cloud.points} />
            </SplitCard>
          </div>
        </section>
      )}

      {page.faqs.length > 0 && <FaqSection className={sectionSpacing} heading={page.faqHeading ?? common.commonQuestions} faqs={page.faqs} />}

      <RelatedLinks locale={locale} links={page.relatedLinks} section="open_source_related" />

      <ClosingCta
        titleLines={[page.ctaHeading ?? page.h1]}
        {...(page.ctaBody ? { body: page.ctaBody } : {})}
        primary={{
          label: page.ctaPrimaryLabel ?? "GitHub",
          href: primaryHref,
          attributes: linkAttributes(primaryHref, "open_source_closing", "view_github"),
        }}
        secondary={{
          label: page.ctaSecondaryLabel ?? common.viewPricing,
          href: secondaryHref,
          attributes: linkAttributes(secondaryHref, "open_source_closing", "read_docs"),
        }}
        footnote={t.heroFootnote}
      />
    </>
  )
}
