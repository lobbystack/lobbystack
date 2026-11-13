import { ArrowRight, ArrowUpRight } from "lucide-react"

import { IconTile } from "@/marketing/components/system/IconCards"
import { SectionTitle } from "@/marketing/components/system/SectionTitle"
import type { Locale } from "@/marketing/i18n"
import { eyebrow } from "@/marketing/lib/eyebrows"
import { featureIcons } from "@/marketing/lib/feature-icons"
import { featureGroups, featureIndexCopy, featureLink, type FeatureId } from "@/marketing/lib/feature-index"

function FeatureCard({ locale, id }: { locale: Locale; id: FeatureId }) {
  const { title, body } = featureIndexCopy[locale].features[id]
  const { href, external } = featureLink(locale, id)
  const Arrow = external ? ArrowUpRight : ArrowRight

  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      data-ph-capture-attribute-section="feature_index"
      data-ph-capture-attribute-action="open_feature"
      data-ph-capture-attribute-destination={href}
      data-ph-capture-attribute-label={id}
      className="group/card flex flex-col bg-background p-6 transition-colors duration-150 hover:bg-beige focus-visible:bg-beige focus-visible:outline-none"
    >
      <span className="flex items-start justify-between">
        <IconTile icon={featureIcons[id]} />
        <Arrow
          className="size-4 text-muted-foreground transition-colors group-hover/card:text-foreground group-focus-visible/card:text-foreground"
          aria-hidden="true"
        />
      </span>
      <h3 className="mt-6 font-heading text-base leading-snug font-medium tracking-[-0.01em]">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">{body}</p>
    </a>
  )
}

/** Every feature as a card that opens its page or its Help Center guide. */
export function FeatureIndex({ locale = "en" }: { locale?: Locale }) {
  const copy = featureIndexCopy[locale]

  return (
    <section className="section-spacing" id="feature-index">
      <div className="mx-auto max-w-site px-6">
        <SectionTitle eyebrow={eyebrow(locale, "features.wall")} className="max-w-3xl">
          {copy.heading}
        </SectionTitle>

        <div className="mt-12 grid gap-10">
          {featureGroups.map((group) => (
            <div key={group.id}>
              <p className="eyebrow">{copy.groups[group.id]}</p>
              <div className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/70 md:grid-cols-3">
                {group.features.map((id) => (
                  <FeatureCard key={id} locale={locale} id={id} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
