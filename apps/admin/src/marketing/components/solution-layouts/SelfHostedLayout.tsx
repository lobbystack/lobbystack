import { DatabaseBackup, KeyRound, LockKeyhole, RefreshCw } from "lucide-react"

import { FaqSection } from "@/marketing/components/FaqSection"
import type { SeoLandingPageProps } from "@/marketing/components/solution-layouts/types"
import {
  container,
  githubUrl,
  linkAttributes,
  RelatedLinks,
  sectionSpacing,
  ServerFieldArt,
} from "@/marketing/components/solution-layouts/self-hosting/parts"
import { selfHostedLayoutCopy as t } from "@/marketing/components/solution-layouts/self-hosting/self-hosted-copy"
import { SelfHostingScene } from "@/marketing/components/solution-layouts/self-hosting/SelfHostingScenes"
import { CloudVsSelfHosted } from "@/marketing/components/solutions/self-hosted/CloudVsSelfHosted"
import { WhatYouRun } from "@/marketing/components/solutions/self-hosted/WhatYouRun"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { ClosingCta } from "@/marketing/components/system/ClosingCta"
import { FactStrip } from "@/marketing/components/system/FactStrip"
import { IconCards } from "@/marketing/components/system/IconCards"
import { MediaCard } from "@/marketing/components/system/MediaCard"
import { PageHero } from "@/marketing/components/system/PageHero"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import { SplitCard } from "@/marketing/components/system/SplitCard"
import { cn } from "@/marketing/lib/utils"

const overviewUrl = "https://docs.lobbystack.com/self-hosting/overview"
const composeUrl = "https://docs.lobbystack.com/self-hosting/docker-compose"
const railwayUrl = "https://railway.com/deploy/lobbystack"

/** A short list under a split card's body. */
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

/** The English self-hosted page. Modelled on GitBook's feature pages. */
export function SelfHostedLayout({ page }: SeoLandingPageProps) {
  const locale = "en"
  const [compose, railway, records, code] = page.sections
  const primaryHref = page.ctaPrimaryHref ?? overviewUrl
  const secondaryHref = page.ctaSecondaryHref ?? githubUrl
  const deployCards = [
    { section: compose, scene: "terminal" as const, cta: t.deploy.composeCta, href: composeUrl, action: "read_compose_guide" },
    { section: railway, scene: "railway" as const, cta: t.deploy.railwayCta, href: railwayUrl, action: "deploy_railway" },
  ]
  const runCards = [DatabaseBackup, RefreshCw, LockKeyhole, KeyRound].map((icon, index) => ({
    icon,
    title: t.run.cards[index]?.title ?? "",
    body: t.run.cards[index]?.body ?? "",
  }))

  return (
    <>
      <PageHero
        eyebrow={page.eyebrow}
        title={page.h1}
        intro={page.intro}
        actions={
          <>
            <ButtonLink href={primaryHref} {...linkAttributes(primaryHref, "self_hosted_hero", "read_self_hosting_guide")}>
              {page.ctaPrimaryLabel}
            </ButtonLink>
            <ButtonLink href={secondaryHref} variant="secondary" {...linkAttributes(secondaryHref, "self_hosted_hero", "view_github")}>
              {page.ctaSecondaryLabel}
            </ButtonLink>
          </>
        }
        footnote={t.heroFootnote}
        art={<ServerFieldArt />}
      />

      <div className={cn(container, "mt-12 md:mt-16")}>
        <FactStrip facts={page.proofPoints} />
      </div>

      <section className={sectionSpacing} id="deploy">
        <div className={container}>
          <SectionTitle centered eyebrow={t.deploy.eyebrow} intro={t.deploy.intro} className="max-w-3xl">
            {t.deploy.title}
          </SectionTitle>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {deployCards.map(({ section, scene, cta, href, action }) =>
              section ? (
                <MediaCard
                  key={section.title}
                  media={<SelfHostingScene name={scene} locale={locale} fit="wide" />}
                  mediaClassName="aspect-[9/5] sm:aspect-[9/4]"
                  title={section.title}
                  body={section.body}
                  action={
                    <ButtonLink href={href} variant="secondary" size="sm" {...linkAttributes(href, "self_hosted_deploy", action)}>
                      {cta}
                    </ButtonLink>
                  }
                />
              ) : null
            )}
          </div>
        </div>
      </section>

      {records && (
        <section className={sectionSpacing} id="architecture">
          <div className={container}>
            <SplitCard
              media={<SelfHostingScene name="serverStack" locale={locale} />}
              mediaClassName="min-h-[22rem] md:min-h-[30rem]"
              columns="md:grid-cols-[1.18fr_0.82fr]"
              eyebrow={t.architecture.eyebrow}
              headingLevel="h2"
              title={records.title}
              body={records.body}
              action={
                <ButtonLink href={overviewUrl} {...linkAttributes(overviewUrl, "self_hosted_architecture", "read_self_hosting_overview")}>
                  {t.architecture.cta}
                </ButtonLink>
              }
            >
              <Points points={records.points} />
            </SplitCard>
          </div>
        </section>
      )}

      {code && (
        <section className={sectionSpacing} id="code">
          <div className={container}>
            <SplitCard
              reverse
              media={<SelfHostingScene name="tools" locale={locale} />}
              columns="md:grid-cols-[0.82fr_1.18fr]"
              eyebrow={t.code.eyebrow}
              headingLevel="h2"
              title={code.title}
              body={code.body}
              action={
                <ButtonLink href={githubUrl} variant="secondary" {...linkAttributes(githubUrl, "self_hosted_code", "view_github")}>
                  {t.code.cta}
                </ButtonLink>
              }
            >
              <Points points={code.points} />
            </SplitCard>
          </div>
        </section>
      )}

      <section className={sectionSpacing} id="what-you-run">
        <div className={container}>
          <SectionTitle centered eyebrow={t.run.eyebrow} intro={t.run.intro} className="max-w-3xl">
            {t.run.title}
          </SectionTitle>
          <IconCards className="mt-12" cards={runCards} />
        </div>
      </section>

      <WhatYouRun />
      <CloudVsSelfHosted />

      {page.faqs.length > 0 && <FaqSection className={sectionSpacing} heading={page.faqHeading ?? "Common questions"} faqs={page.faqs} />}

      <RelatedLinks locale={locale} links={page.relatedLinks} section="self_hosted_related" />

      <ClosingCta
        titleLines={[page.ctaHeading ?? page.h1]}
        {...(page.ctaBody ? { body: page.ctaBody } : {})}
        primary={{
          label: page.ctaPrimaryLabel ?? t.architecture.cta,
          href: primaryHref,
          attributes: linkAttributes(primaryHref, "self_hosted_closing", "read_self_hosting_guide"),
        }}
        secondary={{
          label: page.ctaSecondaryLabel ?? "GitHub",
          href: secondaryHref,
          attributes: linkAttributes(secondaryHref, "self_hosted_closing", "view_github"),
        }}
        footnote={t.heroFootnote}
      />
    </>
  )
}
