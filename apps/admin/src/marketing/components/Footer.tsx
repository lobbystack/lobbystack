import discordIcon from "@iconify-icons/logos/discord-icon"
import { GithubIcon } from "@/marketing/components/GithubIcon"
import { Icon } from "@iconify/react/offline"
import { Separator } from "@/marketing/components/ui/separator"
import {
  languageSwitcherLinks,
  localizeHref,
  localizePath,
  type Locale,
} from "@/marketing/i18n"

const footerCopy = {
  en: {
    product: "Product",
    features: "Features",
    howItWorks: "How it Works",
    pricing: "Pricing",
    resources: "Resources",
    helpCenter: "Help Center",
    blog: "Blog",
    calculator: "Missed Call Calculator",
    affiliateProgram: "Affiliate Program",
    whiteLabel: "White Label",
    mcpServer: "MCP Server",
    company: "Company",
    about: "About",
    contact: "Contact",
    privacy: "Privacy Policy",
    cookiePolicy: "Cookie Policy",
    terms: "Terms of Service",
    rights: "All rights reserved.",
    privacyShort: "Privacy",
    cookiePolicyShort: "Cookie Policy",
    termsShort: "Terms",
    cookiePreferences: "Cookie preferences",
  },
  fr: {
    product: "Produit",
    features: "Fonctionnalités",
    howItWorks: "Fonctionnement",
    pricing: "Tarifs",
    resources: "Ressources",
    helpCenter: "Centre d'aide",
    blog: "Blog",
    calculator: "Calculateur d'appels manqués",
    affiliateProgram: "Programme d'affiliation",
    whiteLabel: "Marque blanche",
    mcpServer: "Serveur MCP",
    company: "Entreprise",
    about: "À propos",
    contact: "Contact",
    privacy: "Politique de confidentialité",
    cookiePolicy: "Politique relative aux cookies",
    terms: "Conditions d'utilisation",
    rights: "Tous droits réservés.",
    privacyShort: "Confidentialité",
    cookiePolicyShort: "Cookies",
    termsShort: "Conditions",
    cookiePreferences: "Préférences cookies",
  },
  es: {
    product: "Producto",
    features: "Funciones",
    howItWorks: "Cómo funciona",
    pricing: "Precios",
    resources: "Recursos",
    helpCenter: "Centro de ayuda",
    blog: "Blog",
    calculator: "Calculadora de llamadas perdidas",
    affiliateProgram: "Programa de afiliados",
    whiteLabel: "Marca blanca",
    mcpServer: "Servidor MCP",
    company: "Empresa",
    about: "Acerca de",
    contact: "Contacto",
    privacy: "Política de privacidad",
    cookiePolicy: "Política de cookies",
    terms: "Términos del servicio",
    rights: "Todos los derechos reservados.",
    privacyShort: "Privacidad",
    cookiePolicyShort: "Cookies",
    termsShort: "Términos",
    cookiePreferences: "Preferencias de cookies",
  },
  sr: {
    product: "Proizvod",
    features: "Funkcije",
    howItWorks: "Kako radi",
    pricing: "Cene",
    resources: "Resursi",
    helpCenter: "Centar za pomoć",
    blog: "Blog",
    calculator: "Kalkulator propuštenih poziva",
    affiliateProgram: "Program preporuka",
    whiteLabel: "Bela etiketa",
    mcpServer: "MCP server",
    company: "Kompanija",
    about: "O nama",
    contact: "Kontakt",
    privacy: "Politika privatnosti",
    cookiePolicy: "Politika kolačića",
    terms: "Uslovi korišćenja",
    rights: "Sva prava zadržana.",
    privacyShort: "Privatnost",
    cookiePolicyShort: "Kolačići",
    termsShort: "Uslovi",
    cookiePreferences: "Podešavanja kolačića",
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
        { label: copy.whiteLabel, href: "/white-label/" },
        { label: copy.mcpServer, href: "/features/mcp/" },
      ],
    },
    {
      title: copy.resources,
      links: [
        {
          label: copy.helpCenter,
          href: "https://docs.lobbystack.com/introduction",
        },
        { label: copy.blog, href: "/blog/" },
        {
          label: copy.calculator,
          href: "/missed-call-revenue-calculator/",
        },
        {
          label: copy.affiliateProgram,
          href: "/affiliate-program/",
        },
        { label: "GitHub", href: "https://github.com/lobbystack/lobbystack" },
        { label: "Discord", href: "https://discord.gg/WKX4wCTTpJ" },
      ],
    },
    {
      title: copy.company,
      links: [
        { label: copy.about, href: "/about/" },
        { label: copy.contact, href: "mailto:support@lobbystack.com" },
        { label: copy.privacy, href: "/privacy/" },
        { label: copy.cookiePolicy, href: "/cookie-policy/" },
        { label: copy.terms, href: "/terms/" },
      ],
    },
  ]
}

const languageLabels = {
  en: "Language",
  fr: "Langue",
  es: "Idioma",
  sr: "Jezik",
} satisfies Record<Locale, string>

type FooterProps = {
  locale?: Locale
  /** Current page path, so the language switcher can link to its translations. */
  path?: string
}

export function Footer({ locale = "en", path }: FooterProps) {
  const copy = footerCopy[locale]
  const languages = languageSwitcherLinks(path ?? localizePath(locale, "/"))

  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-site px-6 pt-16">
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
              <GithubIcon className="size-5" />
            </a>
            <a
              href="https://discord.gg/WKX4wCTTpJ"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Discord"
              data-ph-capture-attribute-section="footer_social"
              data-ph-capture-attribute-action="join_discord"
              data-ph-capture-attribute-destination="https://discord.gg/WKX4wCTTpJ"
            >
              <Icon icon={discordIcon} className="size-5" id="footer-discord" ssr />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {footerSections(locale).map((section) => (
            <div key={section.title}>
              <p className="mb-4 font-mono text-xs leading-tight font-semibold tracking-[-0.02em] text-beige-foreground uppercase">
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

      <Separator className="my-8 bg-border/60" />

      <div className="mx-auto max-w-site px-6 pb-8">
        <div className="flex flex-col items-center justify-between gap-4 text-xs text-muted-foreground md:flex-row">
          <p>
            © {new Date().getFullYear()} LobbyStack. {copy.rights}
          </p>
          <nav
            aria-label={languageLabels[locale]}
            className="flex flex-wrap justify-center gap-4"
          >
            {languages.map((language) => (
              <a
                key={language.locale}
                href={language.href}
                hrefLang={language.hrefLang}
                lang={language.hrefLang}
                data-locale-choice={language.locale}
                aria-current={language.locale === locale ? "true" : undefined}
                data-ph-capture-attribute-section="footer_language"
                data-ph-capture-attribute-action="switch_language"
                data-ph-capture-attribute-destination={language.href}
                className={
                  language.locale === locale
                    ? "font-medium text-foreground"
                    : "hover:text-foreground"
                }
              >
                {language.label}
              </a>
            ))}
          </nav>
          <div className="flex flex-wrap justify-center gap-6">
            <button
              type="button"
              data-cookie-preferences-trigger
              className="hover:text-foreground"
            >
              {copy.cookiePreferences}
            </button>
            <a
              href={localizePath(locale, "/privacy/")}
              className="hover:text-foreground"
            >
              {copy.privacyShort}
            </a>
            <a
              href={localizePath(locale, "/cookie-policy/")}
              className="hover:text-foreground"
            >
              {copy.cookiePolicyShort}
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
