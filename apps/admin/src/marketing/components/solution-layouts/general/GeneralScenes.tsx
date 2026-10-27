import { intlLocale } from "@lobbystack/shared"
import {
  AudioLines,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Cloud,
  FolderGit,
  House,
  MessageSquareText,
  Moon,
  Scissors,
  Server,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Badge, Chip, Connector, Initials, Place, Scene, Tile } from "@/marketing/components/system/art"
import type { Locale } from "@/marketing/i18n"
import { cn } from "@/marketing/lib/utils"

import { getGeneralScenesCopy } from "./general-copy"

// Scenes for the salons and about pages, which the shared product scenes
// don't cover: a stylist's day, the people a client can book, a moved
// appointment, a service menu, calls after closing, the code, and the
// businesses LobbyStack answers for.

export type GeneralSceneName =
  | "salonDay"
  | "stylists"
  | "reschedule"
  | "serviceMenu"
  | "eveningCalls"
  | "repo"
  | "businessTypes"

type SceneProps = { locale: Locale }

/** A day of the fixed week the shared scenes use, at a time. Tuesday is 3. */
const day = (date: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 10, date, hour, minute))

function time(locale: Locale, date: Date) {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(date)
}

function slot(locale: Locale, date: Date) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)
}

function weekday(locale: Locale, date: Date) {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", timeZone: "UTC" }).format(date)
}

function minutes(locale: Locale, value: number) {
  return new Intl.NumberFormat(intlLocale(locale), { style: "unit", unit: "minute", unitDisplay: "short" }).format(value)
}

function price(locale: Locale, currency: string, value: number) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(value)
}

function IconDot({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-beige-strong text-foreground/75">
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  )
}

function Row({ icon, title, detail, end }: { icon: ReactNode; title: ReactNode; detail?: ReactNode; end?: ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] leading-snug font-medium">{title}</span>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
      </span>
      {end}
    </span>
  )
}

/** One stylist's Tuesday, with the balayage a caller just booked into the open gap. */
function SalonDayScene({ locale }: SceneProps) {
  const t = getGeneralScenesCopy(locale).salon
  const stylist = t.stylists[0] ?? { name: "Maya Ortiz", role: "Color" }
  const [balayage, cut, touchUp] = t.services
  const blocks = [
    { at: day(3, 9), label: cut?.name, busy: true },
    { at: day(3, 10, 30), label: touchUp?.name, busy: true },
    { at: day(3, 13), label: undefined, busy: false },
    { at: day(3, 16), label: cut?.name, busy: true },
  ]
  return (
    <Scene width={520} height={330}>
      <Place x={0} y={0}>
        <Tile className="w-[15rem]" innerClassName="space-y-2.5 p-4">
          <Row
            icon={<Initials name={stylist.name} />}
            title={stylist.name}
            detail={`${stylist.role} · ${weekday(locale, day(3, 9))}`}
          />
          {blocks.map(({ at, label, busy }) => (
            <span key={at.toISOString()} className="flex items-center gap-2.5">
              <span className="w-[3.75rem] shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">{time(locale, at)}</span>
              {busy ? (
                <span className="min-w-0 flex-1 truncate rounded-lg bg-beige-strong px-2.5 py-2 text-xs text-foreground/70">{label}</span>
              ) : (
                <span className="h-[2.125rem] flex-1 rounded-lg border border-dashed border-beige-line" />
              )}
            </span>
          ))}
        </Tile>
      </Place>
      <Connector x={232} y={194} length={44} />
      <Place x={276} y={128}>
        <div className="relative">
          <Tile accent className="w-[15rem]" innerClassName="space-y-2.5 p-4">
            <Row
              icon={<IconDot icon={CalendarCheck} />}
              title={t.appointmentBooked}
              detail={`${balayage?.name ?? "Balayage"} · ${minutes(locale, balayage?.minutes ?? 150)}`}
            />
            <span className="flex flex-wrap gap-1.5">
              <Chip strong>{slot(locale, day(3, 13))}</Chip>
              <Chip className="bg-white">
                <MessageSquareText className="size-3" />
                {t.confirmationTexted}
              </Chip>
            </span>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <Scissors className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

/** The people a client can book for a cut: one free, one off, one chosen. */
function StylistsScene({ locale }: SceneProps) {
  const t = getGeneralScenesCopy(locale).salon
  const [first, second, third] = t.stylists
  const people = [
    { person: second, status: <Chip className="px-2 text-[0.6875rem]">{t.offUntil(weekday(locale, day(5, 9)))}</Chip>, muted: true },
    { person: first, status: <Chip strong className="px-2 text-[0.6875rem]">{t.freeAt(time(locale, day(3, 15)))}</Chip>, accent: true },
    { person: third, status: <Chip className="px-2 text-[0.6875rem]">{t.freeAt(time(locale, day(3, 16, 30)))}</Chip> },
  ]
  return (
    <Scene width={420} height={330} tilt="left">
      <Place x={0} y={0}>
        <Chip className="bg-white px-3 py-1 text-[0.8125rem] shadow-[0_1px_2px_oklch(0_0_0/8%)]">
          <Scissors className="size-3.5" />
          {t.clientAsks}
        </Chip>
      </Place>
      <Connector x={40} y={34} length={250} vertical />
      {people.map(({ person, status, muted, accent }, index) =>
        person ? (
          <div key={person.name}>
            <Connector x={40} y={92 + index * 98} length={40} />
            <Place x={80} y={50 + index * 98}>
              <Tile accent={accent} className={cn("w-[21rem]", muted && "opacity-70")} innerClassName="px-3.5 py-3">
                <Row icon={<Initials name={person.name} />} title={person.name} detail={person.role} end={status} />
              </Tile>
            </Place>
          </div>
        ) : null
      )}
    </Scene>
  )
}

/** Saturday's cut moved to Thursday, after a texted code. */
function RescheduleScene({ locale }: SceneProps) {
  const t = getGeneralScenesCopy(locale).salon
  const cut = t.services[1]
  const stylist = t.stylists[1]
  return (
    <Scene width={540} height={140} tilt="flat">
      <Place x={0} y={14}>
        <Tile className="w-[14.5rem]" innerClassName="space-y-2 p-3.5">
          <span className="block text-xs font-medium text-muted-foreground">{t.rescheduleRequest}</span>
          <Row
            icon={<IconDot icon={CalendarX} />}
            title={<span className="text-muted-foreground line-through decoration-foreground/40">{slot(locale, day(7, 10))}</span>}
            detail={[cut?.name, stylist?.name.split(" ")[0]].filter(Boolean).join(" · ")}
          />
        </Tile>
      </Place>
      <Connector x={244} y={70} length={32} />
      <Place x={276} y={0}>
        <div className="relative">
          <Tile accent className="w-[16rem]" innerClassName="space-y-2.5 p-3.5">
            <Row icon={<IconDot icon={CalendarClock} />} title={t.movedTo(slot(locale, day(5, 16, 30)))} detail={t.calendarUpdated} />
            <Chip className="bg-white">
              <ShieldCheck className="size-3" />
              {t.codeVerified}
            </Chip>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <CalendarCheck className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

/** The service menu, and the answer a caller hears from it. */
function ServiceMenuScene({ locale }: SceneProps) {
  const t = getGeneralScenesCopy(locale).salon
  const balayage = t.services[0]
  return (
    <Scene width={520} height={340}>
      <Place x={0} y={0}>
        <Tile className="w-[21rem]" innerClassName="space-y-2 p-4">
          <span className="block text-xs font-medium text-muted-foreground">{t.serviceMenu}</span>
          {t.services.map((service) => (
            <span key={service.name} className="flex items-center gap-2.5 rounded-xl bg-beige px-2.5 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{service.name}</span>
              <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{minutes(locale, service.minutes)}</span>
              <Chip className="bg-white px-2 text-[0.6875rem]">{t.from(price(locale, t.currency, service.from))}</Chip>
            </span>
          ))}
        </Tile>
      </Place>
      <Connector x={150} y={232} length={36} vertical />
      <Place x={120} y={268}>
        <div className="relative">
          <Tile accent className="w-[18rem]" innerClassName="flex items-start gap-3 p-3.5">
            <IconDot icon={AudioLines} />
            <span className="text-sm leading-snug">{t.answerQuote(price(locale, t.currency, balayage?.from ?? 180))}</span>
          </Tile>
        </div>
      </Place>
    </Scene>
  )
}

/** Three calls after closing and what came of each. */
function EveningCallsScene({ locale }: SceneProps) {
  const t = getGeneralScenesCopy(locale).salon
  const calls = [
    { at: day(3, 19, 42), outcome: t.outcomes.booked, icon: CalendarCheck, accent: true },
    { at: day(3, 21, 15), outcome: t.outcomes.rescheduled, icon: CalendarClock },
    { at: day(8, 10, 5), outcome: t.outcomes.message, icon: MessageSquareText },
  ]
  return (
    <Scene width={480} height={330} tilt="left">
      <Place x={0} y={0}>
        <span className="flex items-center gap-2.5">
          <Badge className="size-10 ring-4">
            <Moon className="size-4" strokeWidth={1.75} />
          </Badge>
          <Chip className="bg-white px-3 py-1 text-[0.8125rem]">{t.salonClosed}</Chip>
        </span>
      </Place>
      <Connector x={20} y={52} length={240} vertical />
      {calls.map(({ at, outcome, icon, accent }, index) => (
        <div key={at.toISOString()}>
          <Connector x={20} y={104 + index * 92} length={44} />
          <Place x={64} y={66 + index * 92}>
            <Tile accent={accent} className="w-[17rem] rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3 py-2.5">
              <Row icon={<IconDot icon={icon} />} title={outcome} detail={slot(locale, at)} />
            </Tile>
          </Place>
        </div>
      ))}
    </Scene>
  )
}

/** The open-source repository, running on LobbyStack Cloud or your own server. */
function RepoScene({ locale }: SceneProps) {
  const t = getGeneralScenesCopy(locale).about
  return (
    <Scene width={470} height={290} tilt="flat">
      <Place x={55} y={0}>
        <Tile className="w-[22.5rem]" innerClassName="space-y-3 p-4">
          <Row icon={<IconDot icon={FolderGit} />} title={t.repo} detail={t.repoBlurb} />
          <span className="flex flex-wrap gap-1.5">
            <Chip>{t.license}</Chip>
            <Chip>TypeScript</Chip>
            <Chip>PostgreSQL</Chip>
          </span>
        </Tile>
      </Place>
      <Connector x={235} y={136} length={40} vertical />
      <Connector x={110} y={176} length={250} />
      <Connector x={110} y={176} length={22} vertical />
      <Connector x={360} y={176} length={22} vertical />
      <Place x={235} y={166} className="-translate-x-1/2">
        <Chip className="bg-white text-[0.6875rem] shadow-[0_1px_2px_oklch(0_0_0/8%)]">{t.sameCode}</Chip>
      </Place>
      <Place x={0} y={198}>
        <Tile accent className="w-[13.5rem] rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3 py-2.5">
          <Row icon={<IconDot icon={Cloud} />} title={t.cloud} />
        </Tile>
      </Place>
      <Place x={250} y={198}>
        <Tile className="w-[13.5rem] rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3 py-2.5">
          <Row icon={<IconDot icon={Server} />} title={t.yourServer} />
        </Tile>
      </Place>
    </Scene>
  )
}

/** The kinds of business LobbyStack answers for, as a grid of tiles. */
function BusinessTypesScene({ locale }: SceneProps) {
  const t = getGeneralScenesCopy(locale).about
  const icons = [Scissors, Stethoscope, House, Building2]
  return (
    <Scene width={470} height={250} tilt="flat">
      <Place x={0} y={0}>
        <Chip className="bg-white px-3 py-1 text-[0.8125rem] shadow-[0_1px_2px_oklch(0_0_0/8%)]">
          <AudioLines className="size-3.5" />
          {t.answersFor}
        </Chip>
      </Place>
      {t.businessTypes.map((label, index) => {
        const Icon = icons[index] ?? Building2
        return (
          <Place key={label} x={(index % 2) * 240} y={44 + Math.floor(index / 2) * 104}>
            <Tile accent={index === 0} className="w-[14.25rem]" innerClassName="flex items-center gap-3 px-3.5 py-4">
              <IconDot icon={Icon} />
              <span className="min-w-0 text-[0.9375rem] leading-snug font-medium">{label}</span>
            </Tile>
          </Place>
        )
      })}
    </Scene>
  )
}

const generalScenes = {
  salonDay: SalonDayScene,
  stylists: StylistsScene,
  reschedule: RescheduleScene,
  serviceMenu: ServiceMenuScene,
  eveningCalls: EveningCallsScene,
  repo: RepoScene,
  businessTypes: BusinessTypesScene,
} satisfies Record<GeneralSceneName, (props: SceneProps) => ReactNode>

// How much each kind of panel scales its scene's plane, as the shared scenes do.
const fits = {
  /** The picture half of a split card. */
  panel: "[--scene-scale:0.56] sm:[--scene-scale:0.85] lg:[--scene-scale:0.94]",
  /** The hero, floating on white. */
  hero: "[--scene-scale:0.58] sm:[--scene-scale:0.86] lg:[--scene-scale:1]",
} as const

export type GeneralSceneFit = keyof typeof fits

/** One of the general layout's own scenes, filling its container. */
export function GeneralScene({ name, locale, fit = "panel" }: { name: GeneralSceneName; locale: Locale; fit?: GeneralSceneFit }) {
  const Component = generalScenes[name]
  return (
    <div className={`absolute inset-0 ${fits[fit]}`}>
      <Component locale={locale} />
    </div>
  )
}
