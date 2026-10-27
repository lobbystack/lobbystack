import { intlLocale } from "@lobbystack/shared"
import {
  AudioLines,
  CalendarCheck,
  CalendarDays,
  FileText,
  Globe,
  Clock,
  History,
  MessageSquareText,
  Paperclip,
  PhoneCall,
  PhoneIncoming,
  Server,
  ShieldCheck,
  Sparkles,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { Fragment, type ReactNode } from "react"

import { Badge, Chip, Connector, Initials, Place, Scene, Tile } from "@/marketing/components/system/art"
import type { Locale } from "@/marketing/i18n"
import { getProductScenesCopy } from "@/marketing/lib/product-scenes-copy"

// Product scenes: small pieces of the product drawn as tiles on the site's
// plane. They replace the raster illustrations, so their words follow the
// page's language.

export type ProductSceneName =
  | "callCapture"
  | "booking"
  | "handoff"
  | "answeredBooked"
  | "routing"
  | "knowledge"
  | "summary"
  | "jobBooked"
  | "guardrails"

type SceneProps = { locale: Locale; neutral?: boolean | undefined }

// A fixed Tuesday, so every scene shows the same appointment.
const tuesday = (hour: number, minute = 0) => new Date(Date.UTC(2026, 10, 3, hour, minute))

function slot(locale: Locale, hour: number, minute = 0) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(tuesday(hour, minute))
}

function IconDot({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-beige-strong text-foreground/75">
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  )
}

function Row({ icon, title, detail, end }: { icon: ReactNode; title: string; detail?: string | undefined; end?: ReactNode }) {
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

/** Rings spreading out on the plane from a point, like a phone ringing. */
function Ripples({ x, y, sizes }: { x: number; y: number; sizes: number[] }) {
  return (
    <>
      {sizes.map((size, index) => (
        <span
          key={size}
          aria-hidden="true"
          className="absolute rounded-full border border-beige-line/80 bg-white/25"
          style={{ left: x - size / 2, top: y - size / 2, width: size, height: size, opacity: 1 - index * 0.22 }}
        />
      ))}
    </>
  )
}

/** A voice waveform: bars of set heights, the same on every render. */
function Waveform({ className }: { className?: string }) {
  const bars = [8, 14, 22, 12, 26, 18, 10, 20, 28, 16, 9, 18, 24, 12, 7]
  return (
    <span aria-hidden="true" className={`flex h-7 items-center gap-[3px] ${className ?? ""}`}>
      {bars.map((height, index) => (
        <span key={index} className="w-[3px] rounded-full bg-foreground/70" style={{ height }} />
      ))}
    </span>
  )
}

function CallCaptureScene({ locale, neutral }: SceneProps) {
  const t = getProductScenesCopy(locale, neutral)
  return (
    <Scene width={540} height={380} tilt="left">
      <Ripples x={200} y={170} sizes={[340, 252, 170]} />
      <Place x={200} y={170} className="-translate-x-1/2 -translate-y-1/2">
        <Badge className="size-24 ring-[10px]">
          <PhoneIncoming className="size-9" strokeWidth={1.5} />
        </Badge>
      </Place>
      <Place x={200} y={250} className="-translate-x-1/2">
        <Chip className="bg-white px-3 py-1 text-[0.8125rem] shadow-[0_1px_2px_oklch(0_0_0/8%)]">
          {t.incomingCall} · (555) 014-2290
        </Chip>
      </Place>
      <Place x={90} y={10}>
        <Chip className="bg-white/80">{t.teamUnavailable}</Chip>
      </Place>
      <Place x={292} y={150}>
        <Tile accent className="w-[13.5rem]" innerClassName="space-y-3 p-4">
          <Row icon={<IconDot icon={AudioLines} />} title={t.lobbystackAnswers} detail={t.booksOrMessages} />
          <Waveform />
        </Tile>
      </Place>
    </Scene>
  )
}

function BookingScene({ locale, neutral }: SceneProps) {
  const t = getProductScenesCopy(locale, neutral)
  const days = [2, 3, 4, 5, 6].map((day) =>
    new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 10, day)))
  )
  const hours = [9, 11, 13, 15].map((hour) =>
    new Intl.DateTimeFormat(intlLocale(locale), { hour: "numeric", timeZone: "UTC" }).format(tuesday(hour))
  )
  // Day by hour: taken slots in beige, the booked one in black.
  const busy = new Set(["0-0", "2-1", "3-2", "0-2", "4-0", "2-3", "4-3"])
  const booked = "1-3"
  return (
    <Scene width={520} height={400}>
      <Place x={40} y={0}>
        <div className="relative">
          <Tile className="w-[24rem]" innerClassName="space-y-4 p-4">
            <Row icon={<IconDot icon={CalendarDays} />} title={t.scheduleVisit} />
            <div className="grid grid-cols-[2.75rem_repeat(5,1fr)] gap-1.5 text-[0.6875rem]">
              <span />
              {days.map((day) => (
                <span key={day} className="text-center font-medium text-muted-foreground">
                  {day}
                </span>
              ))}
              {hours.map((hour, row) => (
                <Fragment key={hour}>
                  <span className="flex h-9 items-center text-muted-foreground tabular-nums">{hour}</span>
                  {days.map((day, column) => {
                    const key = `${column}-${row}`
                    return (
                      <span
                        key={day}
                        className={
                          key === booked
                            ? "flex h-9 items-center justify-center rounded-lg bg-primary text-[0.625rem] font-medium text-primary-foreground"
                            : busy.has(key)
                              ? "h-9 rounded-lg bg-beige-strong"
                              : "h-9 rounded-lg border border-dashed border-beige-line/80"
                        }
                      >
                        {key === booked && <CalendarCheck className="size-3.5" />}
                      </span>
                    )
                  })}
                </Fragment>
              ))}
            </div>
          </Tile>
        </div>
      </Place>
      <Connector x={120} y={300} length={36} vertical />
      <Place x={80} y={336}>
        <span className="flex flex-col items-start gap-1.5">
          <Chip strong className="px-3 py-1 text-[0.8125rem]">
            <CalendarCheck className="size-3.5" />
            {t.appointmentBooked} · {slot(locale, 15)}
          </Chip>
          <Chip className="bg-white px-3 py-1 text-[0.8125rem]">
            <MessageSquareText className="size-3.5" />
            {t.confirmationTexted}
          </Chip>
        </span>
      </Place>
    </Scene>
  )
}

function HandoffScene({ locale, neutral }: SceneProps) {
  const t = getProductScenesCopy(locale, neutral)
  const person = t.team[1] ?? { name: "Sarah Lopez", role: "Customer success" }
  // The urgent message overlaps the phone it was transferred to, like a notification.
  return (
    <Scene width={400} height={320} tilt="flat">
      <Place x={204} y={0}>
        <Tile className="w-[11.5rem] rounded-[2.5rem] p-2" innerClassName="flex h-[19rem] flex-col items-center rounded-[2rem] px-4 pt-3 pb-4 text-center">
          <span className="h-1.5 w-10 rounded-full bg-black/10" />
          <Initials name={person.name} className="mt-9 size-14 text-base" />
          <span className="mt-3 block text-[0.9375rem] font-medium">{person.name}</span>
          <span className="block text-xs text-muted-foreground">{person.role}</span>
          <Chip className="mt-3 px-2.5 text-[0.6875rem]">{t.transferredTo(person.name.split(" ")[0] ?? person.name)}</Chip>
          <span className="mt-auto flex items-center gap-1.5 text-left text-[0.6875rem] leading-snug text-muted-foreground">
            <Paperclip className="size-3.5 shrink-0" />
            {t.contextAttached}
          </span>
          <Badge className="mt-3 size-11 ring-4">
            <PhoneCall className="size-5" strokeWidth={1.75} />
          </Badge>
        </Tile>
      </Place>
      <Place x={0} y={96}>
        <Tile accent className="w-[13.75rem]" innerClassName="space-y-2.5 p-3.5">
          <Chip strong>{t.urgent}</Chip>
          <span className="block text-sm leading-snug">{t.urgentQuote}</span>
        </Tile>
      </Place>
    </Scene>
  )
}

function AnsweredBookedScene({ locale, neutral }: SceneProps) {
  const t = getProductScenesCopy(locale, neutral)
  return (
    <Scene width={600} height={124} tilt="flat">
      <Place x={0} y={20}>
        <Tile className="w-60" innerClassName="p-4">
          <Row icon={<IconDot icon={PhoneCall} />} title={t.callAnswered} detail="(555) 014-2290 · 2:14" />
        </Tile>
      </Place>
      <Connector x={250} y={62} length={80} />
      <Place x={330} y={0}>
        <div className="relative">
          <Tile accent className="w-[16.5rem]" innerClassName="p-4">
            <Row icon={<IconDot icon={CalendarCheck} />} title={t.appointmentBooked} detail={slot(locale, 15)} />
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <CalendarCheck className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

function RoutingScene({ locale, neutral }: SceneProps) {
  const t = getProductScenesCopy(locale, neutral)
  return (
    <Scene width={600} height={260} tilt="left">
      <Place x={0} y={88}>
        <Tile accent className="w-56" innerClassName="p-4">
          <Row icon={<IconDot icon={PhoneIncoming} />} title={t.incomingCall} detail="(555) 014-2290" />
        </Tile>
      </Place>
      <Connector x={232} y={130} length={70} />
      <Connector x={300} y={36} length={196} vertical />
      {t.team.map((person, index) => (
        <div key={person.name}>
          <Connector x={300} y={36 + index * 98} length={40} />
          <Place x={340} y={index * 98}>
            <Tile className="w-60 rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3 py-2.5">
              <Row icon={<Initials name={person.name} />} title={person.name.split(" ")[0] ?? person.name} detail={person.role} />
            </Tile>
          </Place>
        </div>
      ))}
    </Scene>
  )
}

function KnowledgeScene({ locale, neutral }: SceneProps) {
  const t = getProductScenesCopy(locale, neutral)
  const icons = [Globe, Tag, Clock, FileText]
  return (
    <Scene width={560} height={340} tilt="left">
      <Place x={0} y={0}>
        <Tile className="w-64" innerClassName="space-y-2.5 p-4">
          <span className="block text-xs font-medium text-muted-foreground">{t.knowledgeSources}</span>
          {t.sources.map((source, index) => {
            const Icon = icons[index] ?? FileText
            return (
              <span key={source} className="flex items-center gap-2.5 rounded-xl bg-beige px-2.5 py-2">
                <Icon className="size-4 shrink-0 text-foreground/70" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate text-sm">{source}</span>
                {index === 0 && <Chip className="px-2 text-[0.6875rem]">{t.synced}</Chip>}
              </span>
            )
          })}
        </Tile>
      </Place>
      <Connector x={268} y={150} length={60} />
      <Place x={330} y={110}>
        <div className="relative">
          <Tile accent className="w-56" innerClassName="p-4">
            <Row icon={<IconDot icon={Sparkles} />} title={t.readyToAnswer} />
          </Tile>
        </div>
      </Place>
    </Scene>
  )
}

function SummaryScene({ locale, neutral }: SceneProps) {
  const t = getProductScenesCopy(locale, neutral)
  return (
    <Scene width={460} height={360}>
      <Place x={0} y={0}>
        <Tile className="w-56" innerClassName="p-4">
          <Row icon={<IconDot icon={PhoneCall} />} title={t.callAnswered} detail="2:14" />
        </Tile>
      </Place>
      <Connector x={110} y={90} length={60} vertical />
      <Place x={60} y={150}>
        <div className="relative">
          <Tile accent className="w-[18.5rem]" innerClassName="space-y-2.5 p-4">
            <span className="block text-xs font-medium text-muted-foreground">{t.callSummary}</span>
            <Row icon={<IconDot icon={Wrench} />} title={t.summaryService} detail={t.summaryNote} />
            <Chip strong>
              <CalendarCheck className="size-3" />
              {slot(locale, 15)}
            </Chip>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <Sparkles className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

function JobBookedScene({ locale, neutral }: SceneProps) {
  const t = getProductScenesCopy(locale, neutral)
  return (
    <Scene width={560} height={340} tilt="left">
      <Place x={0} y={30}>
        <Tile className="w-52 rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3 py-2.5">
          <Row icon={<IconDot icon={PhoneIncoming} />} title={t.serviceRequest} />
        </Tile>
      </Place>
      <Place x={30} y={190}>
        <Tile className="w-52 rounded-[1.4rem] p-1.5" innerClassName="rounded-[1rem] px-3 py-2.5">
          <Row icon={<IconDot icon={FileText} />} title={t.estimate} />
        </Tile>
      </Place>
      <Connector x={220} y={70} length={80} />
      <Connector x={250} y={230} length={50} />
      <Connector x={300} y={70} length={160} vertical />
      <Place x={300} y={100}>
        <div className="relative">
          <Tile accent className="w-[16rem]" innerClassName="space-y-2.5 p-4">
            <Row icon={<IconDot icon={CalendarCheck} />} title={t.jobBooked} detail={t.jobName} />
            <Chip strong>{slot(locale, 10)}</Chip>
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <CalendarCheck className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
    </Scene>
  )
}

function GuardrailsScene({ locale, neutral }: SceneProps) {
  const t = getProductScenesCopy(locale, neutral)
  return (
    <Scene width={580} height={360}>
      <Place x={0} y={0}>
        <Tile className="w-64" innerClassName="space-y-2.5 p-4">
          <Row icon={<IconDot icon={History} />} title={t.callHistory} />
          {[t.team[0], t.team[1], t.team[2]].map((person, index) =>
            person ? (
              <span key={person.name} className="flex items-center gap-2.5 rounded-xl bg-beige px-2.5 py-1.5">
                <Initials name={person.name} className="size-7 text-[0.625rem]" />
                <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{["2:14", "0:58", "3:41"][index]}</span>
              </span>
            ) : null
          )}
        </Tile>
      </Place>
      <Place x={300} y={120}>
        <div className="relative">
          <Tile accent className="w-[17rem]" innerClassName="space-y-2.5 p-4">
            <Row icon={<IconDot icon={ShieldCheck} />} title={t.guardrails} />
            {t.guardrailRules.map((rule) => (
              <span key={rule} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1">{rule}</span>
                <Chip className="px-2 text-[0.6875rem]">{t.on}</Chip>
              </span>
            ))}
          </Tile>
          <Badge className="absolute -top-4 -right-4 size-9">
            <Server className="size-4" strokeWidth={1.75} />
          </Badge>
        </div>
      </Place>
      <Connector x={140} y={200} length={60} vertical />
      <Connector x={140} y={260} length={160} />
      <Place x={20} y={262}>
        <Chip>
          <Server className="size-3" />
          {t.yourServer}
        </Chip>
      </Place>
    </Scene>
  )
}

const scenes = {
  callCapture: CallCaptureScene,
  booking: BookingScene,
  handoff: HandoffScene,
  answeredBooked: AnsweredBookedScene,
  routing: RoutingScene,
  knowledge: KnowledgeScene,
  summary: SummaryScene,
  jobBooked: JobBookedScene,
  guardrails: GuardrailsScene,
} satisfies Record<ProductSceneName, (props: SceneProps) => ReactNode>

// How much each kind of panel scales its scene's plane.
const fits = {
  /** A card in a row of three, about 380px wide. */
  card: "[--scene-scale:0.6] sm:[--scene-scale:0.7] lg:[--scene-scale:0.62] xl:[--scene-scale:0.68]",
  /** A wide, short card in a row of two. */
  wide: "[--scene-scale:0.5] sm:[--scene-scale:0.75] lg:[--scene-scale:0.72] xl:[--scene-scale:0.8]",
  /** The picture half of a split card. */
  panel: "[--scene-scale:0.62] sm:[--scene-scale:0.8] lg:[--scene-scale:0.92]",
  /** A square panel. */
  square: "[--scene-scale:0.62] sm:[--scene-scale:0.8] lg:[--scene-scale:0.86]",
} as const

export type SceneFit = keyof typeof fits

/**
 * One of the product scenes, filling its container. `neutral` swaps the
 * plumbing examples for lines that fit any trade.
 */
export function ProductScene({
  name,
  locale,
  fit = "panel",
  neutral,
}: {
  name: ProductSceneName
  locale: Locale
  fit?: SceneFit
  neutral?: boolean | undefined
}) {
  const Component = scenes[name]
  return (
    <div className={`absolute inset-0 ${fits[fit]}`}>
      <Component locale={locale} neutral={neutral} />
    </div>
  )
}
