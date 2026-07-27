import { buttonVariants } from "@/components/ui/button"
import {
  localizeMarketingHref,
  type MarketingLocale,
} from "@/lib/marketing-site-url"
import { cn } from "@/lib/utils"
import {
  BookOpen,
  CalendarCheck,
  Calculator,
  ChevronDown,
  DoorOpen,
  ExternalLink,
  Gift,
  Hammer,
  History,
  Home,
  KeyRound,
  Menu,
  Moon,
  Newspaper,
  PhoneCall,
  Scissors,
  Server,
  Scale,
  Stethoscope,
  WashingMachine,
  Wind,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react"

type NavChildLink = {
  label: string
  href: string
  external?: boolean
  icon?: LucideIcon
}

type NavColumn = {
  title: string
  links: NavChildLink[]
  highlighted?: boolean
}

type NavLink =
  | (NavChildLink & { type: "link" })
  | {
      type: "group"
      label: string
      columns: NavColumn[]
    }

const labels = {
  en: {
    solutions: "Solutions",
    features: "Features",
    resources: "Resources",
    pricing: "Pricing",
    login: "Log in",
    tryFree: "Try for free",
    blog: "Blog",
    changelog: "Changelog",
    helpCenter: "Help Center",
    comparison: "Comparison",
    calculator: "Missed call calculator",
    affiliateProgram: "Affiliate Program",
  },
  fr: {
    solutions: "Solutions",
    features: "Fonctionnalités",
    resources: "Ressources",
    pricing: "Tarifs",
    login: "Connexion",
    tryFree: "Essayer gratuitement",
    blog: "Blog",
    changelog: "Journal des changements",
    helpCenter: "Centre d'aide",
    comparison: "Comparaison",
    calculator: "Calculateur d'appels manqués",
    affiliateProgram: "Programme d'affiliation",
  },
} satisfies Record<MarketingLocale, Record<string, string>>

const solutionLabelMap = {
  en: {
    solutions: "Top Uses",
    industries: "By Industry",
    aiPhoneAnswering: "AI phone answering",
    aiAppointmentScheduler: "AI appointment scheduler",
    homeServices: "Home services",
    afterHours: "After-hours answering",
    dental: "Dental offices",
    salons: "Salons and spas",
    selfHosted: "Self-hosted AI receptionist",
    trades: "By Trade",
    plumbers: "Plumbers",
    hvac: "HVAC",
    electricians: "Electricians",
    garageDoor: "Garage door repair",
    applianceRepair: "Appliance repair",
    restoration: "Restoration",
    locksmiths: "Locksmiths",
  },
  fr: {
    solutions: "Solutions",
    industries: "Industries",
    aiPhoneAnswering: "Réponse téléphonique IA",
    aiAppointmentScheduler: "Planification de rendez‑vous IA",
    homeServices: "Services à domicile",
    afterHours: "Réponse hors horaires",
    dental: "Cabinets dentaires",
    salons: "Salons et spas",
    selfHosted: "Réceptionniste IA auto-hébergé",
    trades: "Métiers",
    plumbers: "Plombiers",
    hvac: "CVC",
    electricians: "Électriciens",
    garageDoor: "Réparation de portes de garage",
    applianceRepair: "Réparation d'électroménagers",
    restoration: "Restauration",
    locksmiths: "Serruriers",
  },
} satisfies Record<MarketingLocale, Record<string, string>>

const resourceLinks = (locale: MarketingLocale) =>
  [
    { label: labels[locale].blog, href: "/blog/", icon: Newspaper },
    { label: labels[locale].changelog, href: "/changelog/", icon: History },
    {
      label: labels[locale].helpCenter,
      href: "https://docs.lobbystack.com/introduction",
      external: true,
      icon: BookOpen,
    },
    {
      label: labels[locale].comparison,
      href: "/comparison/",
      icon: Scale,
    },
    {
      label: labels[locale].calculator,
      href: "/missed-call-revenue-calculator/",
      icon: Calculator,
    },
    {
      label: labels[locale].affiliateProgram,
      href: "/affiliate-program/",
      icon: Gift,
    },
  ] satisfies NavChildLink[]

const solutionLinks = (locale: MarketingLocale) =>
  [
    {
      label: solutionLabelMap[locale].aiPhoneAnswering,
      href: "/solutions/ai-phone-answering/",
      icon: PhoneCall,
    },
    {
      label: solutionLabelMap[locale].aiAppointmentScheduler,
      href: "/solutions/ai-appointment-scheduler/",
      icon: CalendarCheck,
    },
    {
      label: solutionLabelMap[locale].afterHours,
      href: "/solutions/after-hours-answering-service/",
      icon: Moon,
    },
    {
      label: solutionLabelMap[locale].selfHosted,
      href: "/solutions/self-hosted-ai-receptionist/",
      icon: Server,
    },
  ] satisfies NavChildLink[]

const industryLinks = (locale: MarketingLocale) =>
  [
    {
      label: solutionLabelMap[locale].homeServices,
      href: "/solutions/ai-receptionist-for-home-services/",
      icon: Home,
    },
    {
      label: solutionLabelMap[locale].dental,
      href: "/solutions/ai-receptionist-for-dental-offices/",
      icon: Stethoscope,
    },
    {
      label: solutionLabelMap[locale].salons,
      href: "/solutions/ai-receptionist-for-salons-and-spas/",
      icon: Scissors,
    },
  ] satisfies NavChildLink[]

const tradeLinks = (locale: MarketingLocale) =>
  [
    {
      label: solutionLabelMap[locale].plumbers,
      href: "/solutions/ai-receptionist-for-plumbers/",
      icon: Wrench,
    },
    {
      label: solutionLabelMap[locale].hvac,
      href: "/solutions/ai-receptionist-for-hvac/",
      icon: Wind,
    },
    {
      label: solutionLabelMap[locale].electricians,
      href: "/solutions/ai-receptionist-for-electricians/",
      icon: Zap,
    },
    {
      label: solutionLabelMap[locale].garageDoor,
      href: "/solutions/ai-receptionist-for-garage-door-repair/",
      icon: DoorOpen,
    },
    {
      label: solutionLabelMap[locale].applianceRepair,
      href: "/solutions/ai-receptionist-for-appliance-repair/",
      icon: WashingMachine,
    },
    {
      label: solutionLabelMap[locale].restoration,
      href: "/solutions/ai-receptionist-for-restoration-companies/",
      icon: Hammer,
    },
    {
      label: solutionLabelMap[locale].locksmiths,
      href: "/solutions/ai-receptionist-for-locksmiths/",
      icon: KeyRound,
    },
  ] satisfies NavChildLink[]

const tradeColumns = (locale: MarketingLocale): NavColumn[] => {
  const links = tradeLinks(locale)

  if (links.length === 0) {
    return []
  }

  return [
    {
      title: solutionLabelMap[locale].trades,
      links,
      highlighted: true,
    },
  ]
}

const solutionColumns = (locale: MarketingLocale) =>
  [
    {
      title: solutionLabelMap[locale].solutions,
      links: solutionLinks(locale),
    },
    ...tradeColumns(locale),
    {
      title: solutionLabelMap[locale].industries,
      links: industryLinks(locale),
    },
  ].filter(Boolean) as NavColumn[]

const navLinks = (locale: MarketingLocale): NavLink[] => [
  {
    type: "group",
    label: labels[locale].solutions,
    columns: solutionColumns(locale),
  },
  { type: "link", label: labels[locale].features, href: "/features/" },
  {
    type: "group",
    label: labels[locale].resources,
    columns: [
      {
        title: labels[locale].resources,
        links: resourceLinks(locale),
      },
    ],
  },
  { type: "link", label: labels[locale].pricing, href: "/pricing/" },
]

type LandingNavbarProps = {
  locale?: MarketingLocale
}

export function LandingNavbar({ locale = "en" }: LandingNavbarProps) {
  const mobileMenuId = "site-mobile-menu"
  const copy = labels[locale]

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <a
          href={localizeMarketingHref(locale, "/")}
          className="flex items-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks(locale).map((link) => (
            <div key={link.label} className="group relative">
              {link.type === "group" ? (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-haspopup="menu"
                  >
                    {link.label}
                    <ChevronDown
                      className="size-3.5 transition-transform group-focus-within:rotate-180 group-hover:rotate-180"
                      aria-hidden="true"
                    />
                  </button>
                  <div
                    className={cn(
                      "invisible absolute top-full left-0 z-50 grid min-w-56 translate-y-2 gap-3 rounded-lg border border-border/70 bg-popover p-1.5 text-popover-foreground opacity-0 shadow-lg transition-all duration-150 group-focus-within:visible group-focus-within:translate-y-1 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-1 group-hover:opacity-100",
                      link.columns.length === 2 && "w-[31rem] grid-cols-2",
                      link.columns.length === 3 &&
                        "w-max grid-cols-[minmax(13rem,max-content)_minmax(13rem,max-content)_minmax(13rem,max-content)] gap-x-8 p-4",
                      link.columns.length === 4 &&
                        "w-max grid-cols-[minmax(13rem,max-content)_minmax(13rem,max-content)_minmax(13rem,max-content)_minmax(13rem,max-content)] gap-x-8 p-4"
                    )}
                  >
                    {link.columns.map((column, columnIndex) => (
                      <div
                        key={`${column.title || "column"}-${columnIndex}`}
                        className={cn(
                          "min-w-0",
                          column.highlighted && "rounded-lg bg-muted/45 p-2"
                        )}
                      >
                        <p
                          className={cn(
                            "px-3 pt-2 pb-1 text-sm text-muted-foreground",
                            !column.title && "invisible"
                          )}
                        >
                          {column.title || solutionLabelMap[locale].trades}
                        </p>
                        {column.links.map((resourceLink) => {
                          const LinkIcon = resourceLink.icon

                          return (
                            <a
                              key={resourceLink.label}
                              href={localizeMarketingHref(locale, resourceLink.href)}
                              target={
                                resourceLink.external ? "_blank" : undefined
                              }
                              rel={
                                resourceLink.external
                                  ? "noopener noreferrer"
                                  : undefined
                              }
                              data-ph-capture-attribute-section="navbar"
                              data-ph-capture-attribute-action="navigate"
                              data-ph-capture-attribute-destination={
                                resourceLink.href
                              }
                              data-ph-capture-attribute-label={
                                resourceLink.label
                              }
                              className="group/link flex min-w-0 items-center justify-between gap-4 rounded-md px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
                            >
                              <span className="flex min-w-0 items-center gap-2.5">
                                {LinkIcon && (
                                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover/link:text-foreground">
                                    <LinkIcon
                                      className="size-3.5"
                                      aria-hidden="true"
                                      strokeWidth={2}
                                    />
                                  </span>
                                )}
                                <span className="min-w-0">
                                  {resourceLink.label}
                                </span>
                              </span>
                              {resourceLink.external && (
                                <ExternalLink
                                  className="size-3.5 shrink-0"
                                  aria-hidden="true"
                                />
                              )}
                            </a>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <a
                  href={localizeMarketingHref(locale, link.href)}
                  data-ph-capture-attribute-section="navbar"
                  data-ph-capture-attribute-action="navigate"
                  data-ph-capture-attribute-destination={link.href}
                  data-ph-capture-attribute-label={link.label}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {link.label}
                </a>
              )}
            </div>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          <a
            href="/login"
            className="rounded-md text-sm font-medium text-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {copy.login}
          </a>
          <a
            href="/signup"
            className={cn(buttonVariants(), "rounded-full px-5")}
            data-ph-signup-cta
            data-ph-capture-attribute-section="navbar"
            data-ph-capture-attribute-action="try_for_free"
            data-ph-capture-attribute-destination="/signup"
          >
            {copy.tryFree}
          </a>
        </div>

        <details className="group/mobile-menu md:hidden">
          <summary
            className="inline-flex size-9 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden"
            aria-controls={mobileMenuId}
            aria-label="Open menu"
          >
            <Menu
              className="size-5 group-open/mobile-menu:hidden"
              aria-hidden="true"
            />
            <X
              className="hidden size-5 group-open/mobile-menu:block"
              aria-hidden="true"
            />
          </summary>

          <div
            id={mobileMenuId}
            className="fixed inset-x-0 top-16 max-h-[calc(100svh-4rem)] overflow-y-auto border-t border-border/60 bg-background shadow-sm"
          >
            <nav
              className="flex flex-col gap-1 px-6 py-4"
              aria-label="Mobile navigation"
            >
              {navLinks(locale).map((link) =>
                link.type === "group" ? (
                  <details
                    key={link.label}
                    className="group/mobile-submenu py-1"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                      <span>{link.label}</span>
                      <ChevronDown
                        className="size-4 shrink-0 transition-transform group-open/mobile-submenu:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <div className="mt-1 flex flex-col gap-2 pl-3">
                      {link.columns.map((column, columnIndex) => (
                        <div
                          key={`${column.title || "column"}-${columnIndex}`}
                          className={cn(
                            "flex flex-col gap-1",
                            column.highlighted && "rounded-lg bg-muted/45 p-2"
                          )}
                        >
                          <p
                            className={cn(
                              "px-3 pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase",
                              !column.title && "invisible"
                            )}
                          >
                            {column.title || solutionLabelMap[locale].trades}
                          </p>
                          {column.links.map((resourceLink) => {
                            const LinkIcon = resourceLink.icon

                            return (
                              <a
                                key={resourceLink.label}
                                href={localizeMarketingHref(locale, resourceLink.href)}
                                target={
                                  resourceLink.external ? "_blank" : undefined
                                }
                                rel={
                                  resourceLink.external
                                    ? "noopener noreferrer"
                                    : undefined
                                }
                                data-ph-capture-attribute-section="mobile_navbar"
                                data-ph-capture-attribute-action="navigate"
                                data-ph-capture-attribute-destination={
                                  resourceLink.href
                                }
                                data-ph-capture-attribute-label={
                                  resourceLink.label
                                }
                                className="group/link flex min-w-0 items-center justify-between gap-4 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
                              >
                                <span className="flex min-w-0 items-center gap-2.5">
                                  {LinkIcon && (
                                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover/link:text-foreground">
                                      <LinkIcon
                                        className="size-3.5"
                                        aria-hidden="true"
                                        strokeWidth={2}
                                      />
                                    </span>
                                  )}
                                  <span className="min-w-0">
                                    {resourceLink.label}
                                  </span>
                                </span>
                                {resourceLink.external && (
                                  <ExternalLink
                                    className="size-3.5 shrink-0"
                                    aria-hidden="true"
                                  />
                                )}
                              </a>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                  <a
                    key={link.label}
                    href={localizeMarketingHref(locale, link.href)}
                    data-ph-capture-attribute-section="mobile_navbar"
                    data-ph-capture-attribute-action="navigate"
                    data-ph-capture-attribute-destination={link.href}
                    data-ph-capture-attribute-label={link.label}
                    className="rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
                  >
                    {link.label}
                  </a>
                )
              )}
            </nav>
            <div className="flex flex-col gap-2 px-6 pt-2 pb-4">
              <a
                href="/login"
                className="rounded-md px-3 py-2 text-center text-sm font-medium text-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {copy.login}
              </a>
              <a
                href="/signup"
                className={cn(buttonVariants(), "rounded-full")}
                data-ph-signup-cta
                data-ph-capture-attribute-section="mobile_navbar"
                data-ph-capture-attribute-action="try_for_free"
                data-ph-capture-attribute-destination="/signup"
              >
                {copy.tryFree}
              </a>
            </div>
          </div>
        </details>
      </div>
    </header>
  )
}
