import { getCopy, localizeHref, type Locale } from "@/marketing/i18n"
import { getWhiteLabelCopy } from "@/marketing/lib/white-label-copy"

/** Links to the pages agencies compare the program with, styled like the solution pages' related resources. */
export function WhiteLabelRelated({ locale }: { locale: Locale }) {
  const t = getWhiteLabelCopy(locale).related
  const links = [
    { label: t.features, href: "/features/" },
    { label: t.pricing, href: "/pricing/" },
    { label: t.affiliate, href: "/affiliate-program/" },
    { label: t.selfHosted, href: "/solutions/self-hosted-ai-receptionist/" },
    { label: t.mitPost, href: "/blog/lobbystack-mit-license-ai-receptionist-resellers/" },
  ]
  return (
    <section className="mx-auto w-full max-w-site px-6 py-12">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground">
          {getCopy(locale).common.relatedResources}
        </h2>
        <div className="flex flex-wrap gap-3">
          {links.map((link) => (
            <a
              key={link.href}
              href={localizeHref(locale, link.href)}
              className="inline-flex h-9 items-center rounded-full border border-border/70 bg-background px-4 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
