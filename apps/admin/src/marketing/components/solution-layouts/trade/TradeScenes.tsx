import { intlLocale } from "@lobbystack/shared"
import {
  AudioLines,
  CalendarCheck,
  CalendarDays,
  Check,
  ClipboardList,
  MessageSquareText,
  PhoneForwarded,
  PhoneIncoming,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Badge, Chip, Connector, Initials, Place, Scene, Tile } from "@/marketing/components/system/art"
import type { Locale } from "@/marketing/i18n"
import type { TradeDetails } from "@/marketing/lib/trade-details"

// The trade pages' scenes. Each one draws a moment from the page's trade data
// (trade-details.ts), so all ten pages share the drawings and each names its
// own trade. The trade data is English only; the labels below come in every
// language in case a translated page uses these scenes later.

const sceneCopy = {
  en: {
    booked: "Booked",
    openSlots: "Open slots",
    confirmationTexted: "Confirmation texted",
    callSummary: "Call summary",
    saved: "Transcript and recording saved",
    summarySaved: "Summary and recording saved",
  },
  fr: {
    booked: "Réservé",
    openSlots: "Plages libres",
    confirmationTexted: "Confirmation par texto",
    callSummary: "Résumé de l'appel",
    saved: "Transcription et enregistrement sauvegardés",
    summarySaved: "Résumé et enregistrement sauvegardés",
  },
  es: {
    booked: "Reservado",
    openSlots: "Horarios libres",
    confirmationTexted: "Confirmación por SMS",
    callSummary: "Resumen de la llamada",
    saved: "Transcripción y grabación guardadas",
    summarySaved: "Resumen y grabación guardados",
  },
  sr: {
    booked: "Zakazano",
    openSlots: "Slobodni termini",
    confirmationTexted: "Potvrda poslata SMS-om",
    callSummary: "Rezime poziva",
    saved: "Transkript i snimak sačuvani",
    summarySaved: "Rezime i snimak sačuvani",
  },
} satisfies Record<Locale, Record<string, string>>

type SceneProps = { details: TradeDetails; locale: Locale }

// A fixed Wednesday, so the booking scene shows the same slots on every render.
function slot(locale: Locale, hour: number, withDay = false) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    ...(withDay ? { weekday: "short" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2026, 10, 4, hour)))
}

function IconDot({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-beige-strong text-foreground/75">
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  )
}

function Row({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) {
  return (
    <span className="flex items-center gap-3">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] leading-snug font-medium">{title}</span>
        {detail && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{detail}</span>}
      </span>
    </span>
  )
}

/** The hero: the caller's problem, joined to what LobbyStack did with it. */
export function TradeMomentScene({ details, locale }: SceneProps) {
  const t = sceneCopy[locale]
  const { hero } = details
  const OutcomeIcon = hero.kind === "transfer" ? PhoneForwarded : CalendarCheck
  return (
    <Scene width={410} height={330} tilt="left">
      <Place x={0} y={0}>
        <Tile className="w-[15rem]" innerClassName="space-y-3 p-4">
          <Row icon={<IconDot icon={PhoneIncoming} />} title={hero.problem} detail={hero.time} />
          <span className="flex items-start gap-2.5">
            <Initials name={hero.caller} className="size-7 text-[0.625rem]" />
            <span className="text-sm leading-snug text-foreground/80">“{hero.quote}”</span>
          </span>
        </Tile>
      </Place>
      <Connector x={56} y={160} length={56} vertical />
      <Connector x={56} y={216} length={74} />
      <Place x={130} y={170}>
        <div className="relative">
          <Tile accent className="w-[16rem]" innerClassName="p-4">
            <Row icon={<IconDot icon={OutcomeIcon} />} title={hero.outcome} detail={hero.detail} />
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-10">
            <OutcomeIcon className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
      <Connector x={258} y={268} length={26} vertical />
      <Place x={258} y={294} className="-translate-x-1/2">
        <Chip className="bg-white px-3 py-1 text-[0.8125rem] shadow-[0_1px_2px_oklch(0_0_0/8%)]">
          <AudioLines className="size-3.5" strokeWidth={1.75} />
          {t.summarySaved}
        </Chip>
      </Place>
    </Scene>
  )
}

/** The first feature card: a routine job and three open slots, one booked. */
export function TradeBookingScene({ details, locale }: SceneProps) {
  const t = sceneCopy[locale]
  const { booking } = details
  const picked = booking.hours[booking.picked]
  return (
    <Scene width={380} height={230} tilt="flat">
      <Place x={0} y={0}>
        <Tile className="w-[23.75rem]" innerClassName="space-y-3.5 p-4">
          <Row icon={<IconDot icon={CalendarDays} />} title={booking.job} detail={t.openSlots} />
          <span className="grid grid-cols-3 gap-2">
            {booking.hours.map((hour, index) => (
              <span
                key={hour}
                className={
                  index === booking.picked
                    ? "flex h-9 items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground tabular-nums"
                    : "flex h-9 items-center justify-center rounded-lg border border-dashed border-beige-line text-xs text-muted-foreground tabular-nums"
                }
              >
                {slot(locale, hour)}
              </span>
            ))}
          </span>
        </Tile>
      </Place>
      <Connector x={64} y={152} length={34} vertical />
      <Place x={24} y={186}>
        <span className="flex flex-wrap items-center gap-1.5">
          <Chip strong className="px-3 py-1 text-[0.8125rem]">
            <CalendarCheck className="size-3.5" />
            {t.booked} · {slot(locale, picked, true)}
          </Chip>
          <Chip className="bg-white px-3 py-1 text-[0.8125rem] shadow-[0_1px_2px_oklch(0_0_0/8%)]">
            <MessageSquareText className="size-3.5" />
            {t.confirmationTexted}
          </Chip>
        </span>
      </Place>
    </Scene>
  )
}

/** The second feature card: a caller's question and the answer from your details. */
export function TradeAnswerScene({ details }: SceneProps) {
  const { answer, hero } = details
  return (
    <Scene width={440} height={250} tilt="left">
      <Place x={0} y={0}>
        <Tile className="w-[17rem] rounded-[1.4rem] p-1.5" innerClassName="flex items-start gap-2.5 rounded-[1rem] px-3.5 py-3">
          <Initials name={hero.caller} className="size-8 text-[0.625rem]" />
          <span className="text-sm leading-snug text-foreground/85">{answer.question}</span>
        </Tile>
      </Place>
      <Connector x={60} y={88} length={44} vertical />
      <Connector x={60} y={132} length={40} />
      <Place x={100} y={104}>
        <div className="relative">
          <Tile accent className="w-[21rem]" innerClassName="space-y-2.5 p-4">
            <span className="flex items-start gap-3">
              <IconDot icon={MessageSquareText} />
              <span className="min-w-0 flex-1 text-sm leading-snug">{answer.answer}</span>
            </span>
            <Chip className="px-2.5 text-[0.6875rem]">{answer.source}</Chip>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <Check className="size-4" strokeWidth={2} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

/** The intake section: the answers the example call saved, as a summary card. */
export function TradeSummaryScene({ details, locale }: SceneProps) {
  const t = sceneCopy[locale]
  return (
    <Scene width={480} height={350} tilt="right">
      <Place x={0} y={0}>
        <Tile className="w-[20rem]" innerClassName="space-y-2 p-4">
          <span className="mb-3 flex items-center gap-3">
            <IconDot icon={ClipboardList} />
            <span className="min-w-0">
              <span className="block text-[0.9375rem] leading-snug font-medium">{t.callSummary}</span>
              <span className="block text-xs text-muted-foreground">{details.business}</span>
            </span>
          </span>
          {details.summary.map((row) => (
            <span key={row.label} className="flex items-baseline justify-between gap-3 rounded-xl bg-beige px-3 py-2 text-sm">
              <span className="shrink-0 text-muted-foreground">{row.label}</span>
              <span className="min-w-0 truncate text-right font-medium">{row.value}</span>
            </span>
          ))}
        </Tile>
      </Place>
      <Connector x={120} y={282} length={40} vertical />
      <Connector x={120} y={322} length={60} />
      <Place x={180} y={286}>
        <div className="relative">
          <Tile accent className="w-[18.5rem] rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3 py-2.5">
            <Row icon={<IconDot icon={AudioLines} />} title={t.saved} />
          </Tile>
          <Badge className="absolute -top-3.5 -right-3.5 size-8">
            <Check className="size-3.5" strokeWidth={2} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}
