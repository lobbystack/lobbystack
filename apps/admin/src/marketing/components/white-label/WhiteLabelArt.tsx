import { intlLocale } from "@lobbystack/shared"
import { Bell, Building2, CreditCard, Palette, Tag } from "lucide-react"

import { Badge, Footprint, GuideLines, plane, planes, Tile } from "@/marketing/components/system/art"
import type { Locale } from "@/marketing/i18n"
import { cn } from "@/marketing/lib/utils"
import type { WhiteLabelCopy } from "@/marketing/lib/white-label-copy"

// The white-label page's scenes, built from the site's illustration kit.

function money(locale: Locale, amount: number) {
  // The made-up packages bill in the currency a partner in that market would
  // connect, since packages use the Stripe account's currency.
  const currency = locale === "en" ? "USD" : "EUR"
  return new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency, maximumFractionDigits: 0 }).format(amount)
}

/** The hero: your brand, your clients and your prices as three tilted cards. */
export function HeroIllustration({ copy, className }: { copy: WhiteLabelCopy["heroArt"]; className?: string }) {
  const cards = [
    { label: copy.brand, icon: Palette, style: { left: "96px", top: "0px" } },
    { label: copy.clients, icon: Building2, style: { left: "48px", top: "118px" }, accent: true },
    { label: copy.prices, icon: Tag, style: { left: "0px", top: "236px" } },
  ]
  return (
    <div aria-hidden="true" className={cn("relative h-[26rem] w-[34rem] [perspective:1800px]", className)}>
      {/* The strokes run behind the cards, flat on the page, like light across the plane. */}
      <svg viewBox="0 0 544 416" className="absolute inset-0 h-full w-full" fill="none">
        <defs>
          <linearGradient id="wl-stroke-dark" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="oklch(0.25 0 0)" stopOpacity="0" />
            <stop offset="0.35" stopColor="oklch(0.25 0 0)" stopOpacity="0.75" />
            <stop offset="0.7" stopColor="oklch(0.25 0 0)" stopOpacity="0.55" />
            <stop offset="1" stopColor="oklch(0.25 0 0)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="wl-stroke-sand" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="oklch(0.78 0.05 60)" stopOpacity="0" />
            <stop offset="0.3" stopColor="oklch(0.78 0.05 60)" stopOpacity="0.9" />
            <stop offset="0.75" stopColor="oklch(0.84 0.04 65)" stopOpacity="0.8" />
            <stop offset="1" stopColor="oklch(0.84 0.04 65)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 250 C 70 236, 110 130, 160 150 S 220 300, 300 250 S 430 190, 544 140" stroke="url(#wl-stroke-sand)" strokeWidth="3" />
        <path d="M0 262 C 90 270, 160 246, 250 236 S 420 268, 544 196" stroke="url(#wl-stroke-dark)" strokeWidth="2.25" />
      </svg>

      <div className="absolute inset-0 [mask-image:radial-gradient(70%_70%_at_55%_50%,black,transparent)]">
        <div className="absolute top-[-10%] left-[8%] h-[120%] w-[90%]" style={plane}>
          <GuideLines count={9} gap={62} />
        </div>
      </div>

      <div className="absolute top-[3.5rem] left-[6rem] h-[18rem] w-[22rem]" style={plane}>
        {cards.map(({ label, icon: Icon, style, accent }) => (
          <div key={label} className="absolute" style={style}>
            <Tile accent={accent} className="w-[17.5rem]" innerClassName="flex items-center gap-4 px-6 py-5">
              <Icon className="size-6 shrink-0 text-foreground/75" strokeWidth={1.75} />
              <span className="font-heading text-[1.625rem] font-medium tracking-[-0.03em] text-foreground/90">{label}</span>
            </Tile>
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
}

/** Packages: three of a partner's packages, the middle one picked. */
export function PackagesArt({ locale, copy }: { locale: Locale; copy: WhiteLabelCopy["earnArt"] }) {
  const packages = [
    { name: copy.essentials, price: money(locale, 149) },
    { name: copy.plus, price: money(locale, 249), accent: true },
    { name: copy.pro, price: money(locale, 449) },
  ]
  return (
    <div aria-hidden="true" className="relative h-full w-full scale-[1.18] [perspective:1400px] md:scale-[1.22]">
      <div className="absolute top-[3.25rem] left-1/2 h-[14rem] w-[15rem] -translate-x-[42%]" style={plane}>
        <Footprint className="-inset-5" />
        {packages.map(({ name, price, accent }, index) => (
          <div key={name} className="absolute w-[13.5rem]" style={{ left: `${index * -14}px`, top: `${index * 72}px` }}>
            <Tile accent={accent} className="rounded-[1.4rem] p-1.5" innerClassName="flex items-baseline justify-between gap-3 rounded-[1rem] px-4 py-3.5">
              <span className="text-[0.9375rem] font-medium tracking-[-0.01em] text-foreground/90">{name}</span>
              <span className="text-[0.9375rem] font-medium tabular-nums">
                {price}
                <span className="text-xs font-normal text-muted-foreground">{copy.perMonth}</span>
              </span>
            </Tile>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Setup fees: a one-time line on the first invoice, collected by Stripe. */
export function SetupFeeArt({ locale, copy }: { locale: Locale; copy: WhiteLabelCopy["earnArt"] }) {
  return (
    <div aria-hidden="true" className="relative h-full w-full scale-[1.18] [perspective:1400px] md:scale-[1.22]">
      <div className="absolute top-[4.5rem] left-1/2 h-[11rem] w-[14rem] -translate-x-1/2" style={planes.flat}>
        <Footprint className="-inset-6" />
        <Tile className="absolute inset-0" innerClassName="flex h-full flex-col justify-between p-5">
          <span className="font-mono text-[0.6875rem] text-beige-foreground uppercase">{copy.oneTime}</span>
          <span>
            <span className="block text-sm text-muted-foreground">{copy.setupFee}</span>
            <span className="block font-heading text-[2rem] leading-none font-medium tracking-[-0.03em] tabular-nums">
              {money(locale, 199)}
            </span>
          </span>
          <span className="self-start rounded-full bg-beige-strong px-2.5 py-0.5 text-xs font-medium">{copy.paid}</span>
        </Tile>
        <Badge className="absolute -top-5 -right-5">
          <CreditCard className="size-[1.125rem]" strokeWidth={1.75} />
        </Badge>
      </div>
    </div>
  )
}

/** Overage: a client's allowance filling up, with the 80% alert going out. */
export function OverageArt({ locale, copy }: { locale: Locale; copy: WhiteLabelCopy["earnArt"] }) {
  const number = (value: number) => new Intl.NumberFormat(intlLocale(locale)).format(value)
  return (
    <div aria-hidden="true" className="relative h-full w-full scale-[1.18] [perspective:1400px] md:scale-[1.22]">
      <div className="absolute top-[4.5rem] left-1/2 h-[10.5rem] w-[15rem] -translate-x-[67%]" style={planes.left}>
        <Footprint className="-inset-6" />
        <Tile className="absolute inset-0" innerClassName="flex h-full flex-col justify-between p-5">
          <span className="text-sm font-medium">{copy.minutes}</span>
          <span className="block">
            <span className="flex items-baseline justify-between text-sm">
              <span className="font-heading text-[1.75rem] leading-none font-medium tracking-[-0.03em] tabular-nums">{number(412)}</span>
              <span className="text-muted-foreground tabular-nums">/ {number(500)}</span>
            </span>
            <span className="mt-3 block h-2.5 overflow-hidden rounded-full bg-beige-strong">
              <span className="block h-full w-[82%] rounded-full bg-[linear-gradient(90deg,oklch(0.45_0_0),oklch(0.2_0_0))]" />
            </span>
          </span>
        </Tile>
        <span className="absolute -right-10 -bottom-8 flex items-center gap-2 rounded-full bg-white py-1.5 pr-4 pl-1.5 text-sm font-medium ring-1 ring-black/[0.05] [box-shadow:0_10px_24px_-8px_oklch(0.3_0.02_60/25%)]">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bell className="size-3.5" strokeWidth={1.75} />
          </span>
          {copy.alertSent}
        </span>
      </div>
    </div>
  )
}

