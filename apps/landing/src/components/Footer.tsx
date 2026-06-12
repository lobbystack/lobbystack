import { Separator } from "@/components/ui/separator"
import { localizeHref, localizePath, type Locale } from "@/lib/i18n"

const footerCopy = {
  en: {
    product: "Product",
    features: "Features",
    howItWorks: "How it Works",
    pricing: "Pricing",
    resources: "Resources",
    helpCenter: "Help Center",
    comparison: "Comparison",
    blog: "Blog",
    calculator: "Missed Call Calculator",
    company: "Company",
    about: "About",
    contact: "Contact",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    rights: "All rights reserved.",
    privacyShort: "Privacy",
    termsShort: "Terms",
  },
  fr: {
    product: "Produit",
    features: "Fonctionnalités",
    howItWorks: "Fonctionnement",
    pricing: "Tarifs",
    resources: "Ressources",
    helpCenter: "Centre d'aide",
    comparison: "Comparaison",
    blog: "Blog",
    calculator: "Calculateur d'appels manqués",
    company: "Entreprise",
    about: "À propos",
    contact: "Contact",
    privacy: "Politique de confidentialité",
    terms: "Conditions d'utilisation",
    rights: "Tous droits réservés.",
    privacyShort: "Confidentialité",
    termsShort: "Conditions",
  },
} satisfies Record<Locale, Record<string, string>>

const footerSections = (locale: Locale) => {
  const copy = footerCopy[locale]

  return [
    {
      title: copy.product,
      links: [
        { label: copy.features, href: "/features/" },
        { label: copy.howItWorks, href: "/#how-it-works" },
        { label: copy.pricing, href: "/pricing/" },
      ],
    },
    {
      title: copy.resources,
      links: [
        {
          label: copy.helpCenter,
          href: "https://docs.lobbystack.com/introduction",
        },
        { label: copy.comparison, href: "/comparison/" },
        { label: copy.blog, href: "/blog/" },
        {
          label: copy.calculator,
          href: "/missed-call-revenue-calculator/",
        },
        { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
      ],
    },
    {
      title: copy.company,
      links: [
        { label: copy.about, href: "/about/" },
        { label: copy.contact, href: "mailto:support@lobbystack.com" },
        { label: copy.privacy, href: "/privacy/" },
        { label: copy.terms, href: "/terms/" },
      ],
    },
  ]
}

type FooterProps = {
  locale?: Locale
}

export function Footer({ locale = "en" }: FooterProps) {
  const copy = footerCopy[locale]

  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-7xl px-6 pt-16">
        <div className="mb-12 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <a
            href={localizePath(locale, "/")}
            className="flex items-center rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <img
              src="/lobbystack-logo.svg"
              alt="LobbyStack"
              width={155}
              height={43}
              decoding="async"
              className="h-7 w-auto"
            />
          </a>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/lobbystack/lobbystack"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="GitHub"
              data-ph-capture-attribute-section="footer_social"
              data-ph-capture-attribute-action="view_github"
              data-ph-capture-attribute-destination="https://github.com/lobbystack/lobbystack"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {footerSections(locale).map((section) => (
            <div key={section.title}>
              <p className="mb-4 text-xs font-semibold text-muted-foreground">
                {section.title}
              </p>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={localizeHref(locale, link.href)}
                      data-ph-capture-attribute-section="footer"
                      data-ph-capture-attribute-action="navigate"
                      data-ph-capture-attribute-destination={link.href}
                      data-ph-capture-attribute-label={link.label}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <Separator className="my-8" />

      <div className="mx-auto max-w-7xl px-6 pb-8">
        <div className="flex flex-col items-center justify-between gap-4 text-xs text-muted-foreground md:flex-row">
          <p>
            © {new Date().getFullYear()} LobbyStack. {copy.rights}
          </p>
          <div className="flex gap-6">
            <a
              href={localizePath(locale, "/privacy/")}
              className="hover:text-foreground"
            >
              {copy.privacyShort}
            </a>
            <a
              href={localizePath(locale, "/terms/")}
              className="hover:text-foreground"
            >
              {copy.termsShort}
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
